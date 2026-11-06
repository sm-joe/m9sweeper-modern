import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// An intentionally narrow same-origin adapter, not a general-purpose API proxy.
// The dashboard's agent key stays server-side; writes require the admin key entered
// for the current browser session, never bundled into JavaScript or persisted.
const resources: Record<string,string> = {
  clusters:'/v1/clusters', scans:'/v1/scans', policies:'/v1/policies',
  exceptions:'/v1/policy-exceptions', evaluate:'/v1/compliance/evaluate'
};
function jsonError(message:string,status:number){
  return NextResponse.json({error:message},{status,headers:{'Cache-Control':'no-store'}});
}
async function relay(req:NextRequest,method:'GET'|'PUT'|'POST'|'DELETE'){
  const resource=req.nextUrl.searchParams.get('resource')??'';
  const path=resources[resource];
  if(!path) return jsonError('Unsupported resource',400);
  if(method==='GET' && resource==='evaluate') return jsonError('Method not permitted',405);
  if(method==='PUT' && !['clusters','policies','exceptions'].includes(resource)) return jsonError('Method not permitted',405);
  if(method==='DELETE' && !['policies','exceptions'].includes(resource)) return jsonError('Method not permitted',405);
  if(method==='POST' && resource!=='evaluate') return jsonError('Method not permitted',405);
  if(method!=='GET'){
    // Require same-origin browser requests plus the dedicated admin secret for writes.
    const origin=req.headers.get('origin');
    if(!origin || origin!==req.nextUrl.origin) return jsonError('Same-origin request required',403);
  }
  const admin=method==='PUT'||method==='DELETE';
  const credential=admin?req.headers.get('x-m9-admin-key'):process.env.M9_AGENT_API_KEY;
  if(!credential || (admin && credential.length<32)) return jsonError(admin?'Administrator key required':'Backend credential not configured',401);
  const query=new URLSearchParams();
  for(const name of ['clusterId','policyId','exceptionId']){
    const value=req.nextUrl.searchParams.get(name);
    if(value){ if(value.length>128)return jsonError('Invalid query parameter',400);query.set(name,value); }
  }
  const base=process.env.M9_BACKEND_URL??'http://backend:8080';
  const url=base+path+(query.size?'?'+query.toString():'');
  let payload:string|undefined;
  if(method==='POST'||method==='PUT'){
    if(req.headers.get('content-type')?.split(';')[0]!=='application/json')return jsonError('JSON required',415);
    payload=await req.text();
    if(payload.length>64*1024)return jsonError('Payload too large',413);
    try{JSON.parse(payload);}catch{return jsonError('Malformed JSON',400);}
  }
  try{
    const response=await fetch(url,{
      method,headers:{Authorization:'Bearer '+credential, ...(payload?{'Content-Type':'application/json'}:{})},
      ...(payload?{body:payload}:{}),cache:'no-store',signal:AbortSignal.timeout(12000)
    });
    const raw=await response.text();
    const data=raw.length?JSON.parse(raw):{};
    return NextResponse.json(data,{status:response.status,headers:{'Cache-Control':'no-store'}});
  }catch{
    return jsonError('Backend unavailable',502);
  }
}
export async function GET(req:NextRequest){return relay(req,'GET');}
export async function PUT(req:NextRequest){return relay(req,'PUT');}
export async function POST(req:NextRequest){return relay(req,'POST');}
export async function DELETE(req:NextRequest){return relay(req,'DELETE');}
