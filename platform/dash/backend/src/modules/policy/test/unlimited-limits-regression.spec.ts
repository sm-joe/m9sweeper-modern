import { ImageComplianceService } from '../services/image-compliance-service';
import { ComplianceResultMap } from '../entities/compliance-result-map';
import { ScannerDto, VulnerabilitySettingsDto } from '../../scanner/dto/scanner-dto';
import { PolicyDto } from '../dto/policy-dto';
import { ImageScanResultPerPolicyDto } from '../dto/image-scan-results-perpolicy-dto';

/** Product regression: original -1 severity allowance means unlimited. */
describe('ImageComplianceService: boundary and unlimited-threshold regression', () => {
  const service = new ImageComplianceService();
  const limits = Object.assign(new VulnerabilitySettingsDto(), {
    fixableCritical: 1, unFixableCritical: 0,
    fixableMajor: -1, unFixableMajor: -1,
    fixableNormal: -1, unFixableNormal: -1,
    fixableLow: -1, unFixableLow: -1,
    fixableNegligible: -1, unFixableNegligible: -1
  });
  const scanner=Object.assign(new ScannerDto(),{
    id: 11,policyId: 5,name:'Trivy',required:true,enabled:true,vulnerabilitySettings:limits
  });
  const policy=Object.assign(new PolicyDto(),{id:5,name:'Baseline',enabled:true,enforcement:true});
  function result(issues:any[], extras:Record<string,unknown>={}): ImageScanResultPerPolicyDto {
    return Object.assign(new ImageScanResultPerPolicyDto(), {
      policy, scanners:[scanner], issues, exceptions:[], encounteredError:false, ...extras
    });
  }
  function issue(cveCode:string,severity:string,isFixable:boolean) {
    return {scannerId:11,cveCode,severity,isFixable};
  }
  test('exactly allowed critical finding stays compliant',()=>{
    const map=new ComplianceResultMap();
    expect(service.isImageCompliant([result([issue('CVE-1','CRITICAL',true)])],[],map)).toBe(true);
    expect(map.getResultForCve(5,11,'CVE-1').compliant).toBe(true);
  });
  test('second critical exceeds allowance, and is recorded as failure',()=>{
    const map=new ComplianceResultMap();
    const issues=[issue('CVE-1','CRITICAL',true),issue('CVE-2','CRITICAL',true)];
    expect(service.isImageCompliant([result(issues)],[],map)).toBe(false);
    expect(map.getResultForCve(5,11,'CVE-2').compliant).toBe(false);
  });
  test('unlimited high and medium pass with multiple fixable/unfixable issues',()=>{
    const issues=Array.from({length:12},(_,i)=>issue('CVE-'+i,i%2?'HIGH':'MEDIUM',i%3===0));
    expect(service.isImageCompliant([result(issues)],[],new ComplianceResultMap())).toBe(true);
  });
  test('zero unfixable critical allowance prohibits any unfixable critical finding',()=>{
    expect(service.isImageCompliant([result([issue('CVE-3','CRITICAL',false)])],[],new ComplianceResultMap())).toBe(false);
  });
  test('scanner error remains fail closed',()=>{
    expect(service.isImageCompliant([result([], {encounteredError:true})],[],new ComplianceResultMap())).toBe(false);
  });
});
