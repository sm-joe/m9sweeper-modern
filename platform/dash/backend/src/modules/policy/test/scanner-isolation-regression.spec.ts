import {PolicyComplianceCheckerService} from '../services/policy-compliance-checker-service';
import {ImageTrawlerResultDto} from '../../image/dto/image-trawler-result.dto';
import {PolicyDto} from '../dto/policy-dto';
import {ScannerDto} from '../../scanner/dto/scanner-dto';

describe('PolicyComplianceCheckerService scanner isolation', () => {
  function checker(enforcement=true) {
    const policy=Object.assign(new PolicyDto(),{id:11,enforcement});
    const scanners=[
      Object.assign(new ScannerDto(),{id:1,name:'required',required:true,enabled:true}),
      Object.assign(new ScannerDto(),{id:2,name:'optional',required:false,enabled:true})
    ];
    return new PolicyComplianceCheckerService(
      {getPolicyById:jest.fn().mockResolvedValue(policy)} as any,
      {getScannersByPolicyId:jest.fn().mockResolvedValue(scanners)} as any
    );
  }
  function result(issues:any[],encounterError=false):ImageTrawlerResultDto {
    return Object.assign(new ImageTrawlerResultDto(),{policyId:11,issues,encounterError});
  }
  function finding(scannerId:number,severity:string,isFixable:boolean) {
    return {scannerId,severity,isFixable};
  }
  it('does not attribute an optional critical vulnerability to required clean scanner',async()=>{
    const data=result([finding(1,'MEDIUM',false),finding(2,'CRITICAL',false)]);
    expect((await checker(true).run(1,1,data)).policyStatus).toBe(true);
  });
  it('groups multiple severities correctly and catches critical after low',async()=>{
    const data=result([finding(1,'LOW',false),finding(1,'CRITICAL',false)]);
    expect((await checker(true).run(1,1,data)).policyStatus).toBe(false);
  });
  it('counts unfixable issues toward total severity cap',async()=>{
    const data=result([finding(1,'CRITICAL',false)]);
    expect((await checker(true).run(1,1,data)).policyStatus).toBe(false);
  });
  it('fails closed on scanner errors and malformed scanner IDs',async()=>{
    expect((await checker(true).run(1,1,result([],true))).policyStatus).toBe(false);
    await expect(checker(true).run(1,1,result([finding(99,'HIGH',true)]))).rejects.toThrow('unknown scanner');
  });
});
