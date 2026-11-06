// Live Kind cluster test for the ORIGINAL NestJS KubernetesApiService.
// No mocked Kubernetes responses and no privileged cluster mutations by the test itself.
import { readFileSync } from 'node:fs';
import { KubernetesApiService } from './src/modules/command-line/services/kubernetes-api.service';

async function main(): Promise<void> {
  const raw=readFileSync(process.env.KUBECONFIG || '/tmp/m9-kind-kubeconfig','utf8');
  const encoded=Buffer.from(raw,'utf8').toString('base64');
  const client=new KubernetesApiService({get:()=>null} as any);
  const namespaces=await client.listNamespaces(encoded);
  if (!namespaces?.items?.some(n=>n.metadata?.name==='m9-inventory')) {
    throw new Error('Live Kubernetes namespace inventory failed');
  }
  const pods=await client.listPods(encoded,'m9-inventory');
  if (!pods?.items?.some(p=>p.metadata?.name==='m9-inventory-pod')) {
    throw new Error('Live Kubernetes Pod discovery failed');
  }
  const pod=await client.getNamespacedPod('m9-inventory-pod','m9-inventory',encoded);
  const ref=pod?.spec?.containers?.[0]?.image;
  if(ref!=='registry.k8s.io/pause:3.10')throw new Error('Incorrect workload image discovery: '+ref);
  console.log('PASS: actual m9sweeper KubernetesApiService discovered live namespace, Pod and image',ref);
}
main().catch(e=>{console.error(e);process.exitCode=1});
