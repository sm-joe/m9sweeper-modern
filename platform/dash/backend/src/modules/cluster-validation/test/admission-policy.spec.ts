import { ClusterValidationService } from '../services/cluster-validation.service';
import { AdmissionReviewDto } from '../dto/admission-review.dto';

function makeReview(images: { main: string; init?: string; ephemeral?: string } | null): AdmissionReviewDto {
  const spec = images ? {
    containers:[{name:'app',image:images.main}],
    initContainers:images.init?[{name:'setup',image:images.init}]:[],
    ephemeralContainers:images.ephemeral?[{name:'debug',image:images.ephemeral}]:[]
  } : {};
  return {kind:'AdmissionReview',apiVersion:'admission.k8s.io/v1',
    request:{uid:'test-uid',namespace:'default',name:'scan-pod',
      object:{metadata:{name:'scan-pod',namespace:'default'},spec}
    } as any
  } as AdmissionReviewDto;
}

describe('original admission controller: init containers and missing images',()=>{
  function setup(enforced=true){
    const cluster={getClusterById:jest.fn().mockResolvedValue({isEnforcementEnabled:enforced})};
    const exceptions={getAllFilteredPolicyExceptions:jest.fn().mockResolvedValue([]),
      filterExceptionsByImageName:jest.fn().mockReturnValue([])};
    const k8s={parseDockerImageUrl:jest.fn((ref:string)=>({
      host:'docker.io',path:'library',imageName:ref.split(':')[0],tag:ref.split(':')[1]??'latest'
    }))};
    const pod={calculatePodNamespaceCompliance:jest.fn().mockResolvedValue([{compliant:true,reason:''}])};
    const svc=new ClusterValidationService({} as any,exceptions as any,k8s as any,
      cluster as any,pod as any,{} as any);
    (svc as any).findOrCreateImage=jest.fn(async(_cluster:number,_host:string,name:string)=>{
      return {isNew:name.includes('unscanned'),image:{id:1,lastScanned:!name.includes('unscanned')}};
    });
    return {svc,pod,exceptions};
  }
  it('rejects a previously unscanned init container, even if main application image was scanned',async()=>{
    const {svc,pod}=setup();
    const reply=await svc.validateRequest(1,makeReview({main:'safe:1',init:'unscanned:1'}));
    expect(reply.response.allowed).toBe(false);
    expect(reply.response.status.message).toContain('unscanned');
    expect(pod.calculatePodNamespaceCompliance).not.toHaveBeenCalled();
  });
  it('rejects an unscanned ephemeral image in the admission object',async()=>{
    const {svc}=setup();
    expect((await svc.validateRequest(1,makeReview({main:'safe:1',ephemeral:'unscanned:2'}))).response.allowed).toBe(false);
  });
  it('fails closed on malformed pods instead of treating missing images as compliant',async()=>{
    const {svc,pod}=setup();
    const reply=await svc.validateRequest(1,makeReview(null));
    expect(reply.response.allowed).toBe(false);
    expect(reply.response.status.message).toContain('no valid assessable');
    expect(pod.calculatePodNamespaceCompliance).not.toHaveBeenCalled();
  });
  it('allows scanned compliant images through the existing compliance calculator',async()=>{
    const {svc,pod}=setup();
    const reply=await svc.validateRequest(1,makeReview({main:'safe:1',init:'safe-init:1'}));
    expect(reply.response.allowed).toBe(true);
    expect(pod.calculatePodNamespaceCompliance).toHaveBeenCalledTimes(1);
    expect(pod.calculatePodNamespaceCompliance.mock.calls[0][0][0].images).toHaveLength(2);
  });
  it('respects explicitly disabled enforcement without attempting scan checks',async()=>{
    const {svc,pod}=setup(false);
    const reply=await svc.validateRequest(1,makeReview({main:'unscanned:1'}));
    expect(reply.response.allowed).toBe(true);
    expect(pod.calculatePodNamespaceCompliance).not.toHaveBeenCalled();
  });
});
