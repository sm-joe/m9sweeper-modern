import {Injectable} from '@nestjs/common';
import {CoreV1Api} from '@kubernetes/client-node/dist/gen/api/coreV1Api';
import {MineLoggerService} from '../../shared/services/mine-logger.service';
import {ClusterDto} from '../../cluster/dto/cluster-dto';
import {DatabaseService} from '../../shared/services/database.service';
import {NamespaceService} from '../../namespace/services/namespace.service';
import {DeploymentService} from '../../deployment/services/deployment.service';
import {K8sImageService} from '../../k8s-image/services/k8s-image.service';
import {PodService} from '../../pod/services/pod.service';
import {V1NodeList} from '@kubernetes/client-node';
import {V1Container} from '@kubernetes/client-node/dist/gen/model/v1Container';
import {V1Pod} from '@kubernetes/client-node/dist/gen/model/v1Pod';
import {NamespaceDto} from '../../namespace/dto/namespace-dto';
import {KubernetesApiService} from "./kubernetes-api.service";
import {UtilitiesService} from "../../shared/services/utilities.service";
import {ClusterEventService} from "../../cluster-event/services/cluster-event.service";
import {ImageIdInClusterMap} from "../../k8s-image/classes/imageIdInClusterMap";


@Injectable()
export class KubernetesClusterService {

    constructor(
      private readonly loggerService: MineLoggerService,
      private readonly databaseService: DatabaseService,
      private readonly namespaceService: NamespaceService,
      private readonly deploymentService: DeploymentService,
      private readonly k8sImageService: K8sImageService,
      private readonly podService: PodService,
      private readonly k8sApiService: KubernetesApiService,
      private readonly utilitiesService: UtilitiesService,
      private readonly clusterEventService: ClusterEventService,
    ) {}

    async sync(cluster: ClusterDto): Promise<{everythingSuccessfullySynced: boolean, nodeSummary: {numNodes: number, numCPU: number, amountRAM: number}}> {
        try {
            // build api client with proper auth credentials
            const kubeConfig = this.k8sApiService.loadConfigFromBase64Json(cluster.kubeConfig);
            kubeConfig.setCurrentContext(cluster.context);
            const coreApi = this.k8sApiService.makeCoreV1ApiFromConfig(kubeConfig);

            if (!await this.testCoreAPI(cluster, coreApi)) {
              return {
                everythingSuccessfullySynced: false,
                nodeSummary: {numNodes: null, numCPU: null, amountRAM: null}
              }
            }

            // sync the things we care about: namespaces and pods
            const allNamespacesSuccessfullySynced = await this.syncNamespaces(cluster, coreApi);
            const allPodsSuccessfullySynced = await this.syncPods(cluster, coreApi);
            const nodeSummary = await this.getK8sNodeSummary(cluster?.id, coreApi);
            return {
              everythingSuccessfullySynced: allNamespacesSuccessfullySynced && allPodsSuccessfullySynced,
              nodeSummary,
            }
        } catch (e) {
            this.loggerService.log({label: 'Something went wrong with kube config file', clusterId: cluster.id, error: e}, 'KubernetesClusterService.sync()');
            return {
              everythingSuccessfullySynced: false,
              nodeSummary: {numNodes: null, numCPU: null, amountRAM: null}
            }
        }
    }
    /**
     * Namespace listing is required for inventory sync. Node listing is only
     * required for the optional node summary; don't block pod inventory if the
     * stored service account lacks node RBAC permissions.
     */
    private async testCoreAPI(cluster: ClusterDto, coreApi: CoreV1Api): Promise<boolean> {
      try {
        if (!coreApi) throw new Error('Kubernetes API client unavailable');
        await coreApi.listNamespace();
        return true;
      } catch (error) {
        // Never log request headers, bearer tokens, or raw kubeconfig.
        const status = Number(error?.statusCode ?? error?.response?.statusCode ??
          error?.response?.status ?? error?.status);
        const networkCode = String(error?.code ?? error?.cause?.code ?? '').toUpperCase();
        let category = 'Kubernetes API request failed; check backend connectivity and kubeconfig';
        if (status === 401) category = 'Kubernetes authentication failed (401); refresh the stored service-account token';
        else if (status === 403) category = 'Kubernetes authorization denied (403); grant list namespaces to the stored service account';
        else if (['ENOTFOUND', 'EAI_AGAIN'].includes(networkCode))
          category = 'Kubernetes API DNS failed; check the API hostname from the Dash container';
        else if (['ECONNREFUSED', 'ETIMEDOUT', 'EHOSTUNREACH', 'ENETUNREACH'].includes(networkCode))
          category = 'Kubernetes API unreachable from Dash; check Docker/Kind network and kubeconfig server';
        else if (/CERT_|UNABLE_TO_VERIFY|SELF_SIGNED|DEPTH_ZERO_SELF_SIGNED/i.test(networkCode))
          category = 'Kubernetes API TLS certificate failed; check trusted kubeconfig certificate-authority-data';
        this.loggerService.log({
          label: 'Kubernetes API readiness check failed',
          data: {clusterId: cluster.id, category,
            httpStatus: Number.isFinite(status) ? status : undefined,
            networkCode: /^[A-Z_]+$/.test(networkCode) ? networkCode : undefined}
        }, 'KubernetesClusterService.testCoreAPI()');
        const clusterEventData = this.clusterEventService.createClusterEventObject(
          0, 'Batch Job', 'Get', 'Error',
          `Cluster ${cluster.id} inventory sync blocked: ${category}`,
          'KubernetesClusterService.testCoreAPI()');
        await this.clusterEventService.createClusterEvent(clusterEventData, cluster.id);
        return false;
      }
    }

    private async syncNamespaces(cluster: ClusterDto, coreApi: CoreV1Api): Promise<boolean> {
        try {
            const namespaceListRes = await coreApi.listNamespace();
            const namespaces: NamespaceDto[] = await this.namespaceService.setNamespacesContents(namespaceListRes, cluster.id);
            await Promise.all(namespaces.map(n => {
              this.namespaceService.saveK8sNamespaces(n, cluster.id);
            }));

            const currentNamespaces = await this.namespaceService.getNamespacesByClusterId(cluster.id);
            const getNames = currentNamespaces.map( n => n.name);
            const k8sNamespaceNames = namespaces.map(n => n.name);
            const namespacesToBeDeleted = getNames.filter(x => !k8sNamespaceNames.includes(x));
            if (namespacesToBeDeleted.length > 0) {
                await this.namespaceService.deleteDeadNamespaces(cluster.id, namespacesToBeDeleted);
            }
        } catch (err) {
            const clusterEventData = this.clusterEventService.createClusterEventObject(0, 'Batch Job', 'Update', 'Error', `Error while syncing namespaces for ${cluster.id}`, cluster);
            await this.clusterEventService.createClusterEvent(clusterEventData, cluster.id);
            this.loggerService.log({label: 'Error when sync namespaces. ', error: {stack: err.stack, message: err.message}}, 'KubernetesClusterService.syncNamespaces()');
            return false;
        }
        return true;
    }

    /**
     * Syncs all of the Pods & images for the cluster
     */
    private async syncPods(cluster: ClusterDto, coreApi: CoreV1Api): Promise<boolean> {
        let everythingSavedSuccessfully = true;
        try {
            // Get every running Pod
            const allPods = await coreApi.listPodForAllNamespaces();
            if (!Array.isArray(allPods?.body?.items)) {
                throw new Error('Kubernetes Pod inventory response has no items array');
            }
            const runningPods: V1Pod[] = allPods.body.items
                .filter(pod => pod?.status?.phase === 'Running');

            // map structure:
            //    < imageName: string, list of Pods running that image: [V1Pod, V1Pod, V1Pod] >
            const mapOfImagesAndThePodsRunningThem: Map<string, Array<V1Pod>> = new Map<string, Array<V1Pod>>();

            // Find all unique images running in all the pods
            runningPods.forEach((pod) => {
              const allContainers: V1Container[] = (pod.spec?.containers ?? [])
                .concat(pod.spec?.initContainers ?? [])
                .concat(pod.spec?.ephemeralContainers ?? []);

              allContainers.forEach((container) => {
                const imageRunningInContainer: string = container?.image;
                if (!imageRunningInContainer) return;
                const existingPodsRunningThatImage: V1Pod[] = mapOfImagesAndThePodsRunningThem.has(imageRunningInContainer) ? mapOfImagesAndThePodsRunningThem.get(imageRunningInContainer) : [];
                // add our current pod to the list
                mapOfImagesAndThePodsRunningThem.set(imageRunningInContainer, existingPodsRunningThatImage.concat([pod]));
              });
            });

            // save images and pods (with imageIdMap for sake of optimization)
            const saveResult = await this.k8sImageService.saveK8sImages(cluster.id, mapOfImagesAndThePodsRunningThem);
            everythingSavedSuccessfully = everythingSavedSuccessfully && saveResult.allImagesSavedSuccessfully;
            const imageIdMap = saveResult.imageIdMapRunningInCluster;
            everythingSavedSuccessfully =
                (await this.saveK8sPods(cluster.id, runningPods, imageIdMap)) &&
                everythingSavedSuccessfully;
        } catch (e) {
          this.loggerService.log({label: `ERROR syncing pods for ${cluster.id}`, error: {stack: e.stack, message: e.message}}, 'KubernetesClusterService.syncPods()');
            const clusterEventData = this.clusterEventService.createClusterEventObject(
              0,
              'Batch Job',
              'Update',
              'Error',
              `Error while syncing pods for ${cluster.id}`,
              cluster
            );
            await this.clusterEventService.createClusterEvent(clusterEventData, cluster.id);
            return false;
        }
        return everythingSavedSuccessfully;
    }

    private async saveK8sPods(clusterId: number, runningPods: V1Pod[],
                              imageIdMap: ImageIdInClusterMap): Promise<boolean> {
      let failed = 0;
      for (const pod of runningPods) {
        try {
          this.loggerService.log({
            label: 'Saving pod',
            data: {name: pod.metadata?.name, namespace: pod.metadata?.namespace}
          }, 'KubernetesClusterService.saveK8sPods');
          await this.podService.savePod(pod, clusterId, imageIdMap);
        } catch (error) {
          failed++;
          // Error details stay in backend logs; cluster events contain no secrets.
          this.loggerService.log({
            label: 'Pod synchronization failed',
            data: {clusterId, name: pod.metadata?.name, namespace: pod.metadata?.namespace},
            error: {message: error?.message, stack: error?.stack}
          }, 'KubernetesClusterService.saveK8sPods()');
        }
      }
      if (failed > 0) {
        const clusterEventData = this.clusterEventService.createClusterEventObject(
          0,
          'Batch Job',
          'Update',
          'Error',
          `Error while running KubernetesClusterService.saveK8sPods for ${clusterId} - ${failed} of ${runningPods.length} running pods failed to save; inventory cleanup withheld`,
          clusterId
        );
        await this.clusterEventService.createClusterEvent(clusterEventData, clusterId);
        // Do not delete previously known pods after a partial sync failure.
        return false;
      }
      // Only remove stale records after ALL observed running pods are persisted.
      await this.podService.deleteDeadPods(clusterId, runningPods.map(p => ({
        name: p.metadata.name, namespace: p.metadata.namespace ?? 'default'
      })));
      return true;
    }

    async getK8sNodeSummary(clusterId: number, coreApi: CoreV1Api): Promise<{numNodes: number, numCPU: number, amountRAM: number}> {
        try {
            const nodeListResponse: V1NodeList = await coreApi.listNode().then(resolvedPromise => resolvedPromise.body);
            const numNodes = nodeListResponse.items.length;
            let numCPU = 0;
            let amountRAM = 0;
            for (const node of nodeListResponse.items) {
                numCPU += parseInt(node.status.capacity.cpu.toString(), 10);
                const ramWithPrefix = node.status.capacity.memory.toString();
                const prefix = ramWithPrefix.replace(/([0-9])/g, '');
                const ramWithoutPrefix = ramWithPrefix.replace(/([a-zA-Z])/g, '');
                amountRAM += parseInt(ramWithoutPrefix, 10) * this.utilitiesService.prefixesToMultipliers[prefix];
            }
            this.loggerService.log({label: `cluster ${clusterId} node summary successfully built`, numNodes, numCPU, amountRAM}, 'KubernetesClusterService.getK8sNodeSummary()');
            return {numNodes, numCPU, amountRAM};
        } catch (err) {
            this.loggerService.log({label: 'An error occurred while attempting to getK8sNodeSummary', error: {stack: err.stack, message: err.message}}, 'KubernetesClusterService.getK8sNodeSummary()');
            return {numNodes: null, numCPU: null, amountRAM: null};
        }
    }
}
