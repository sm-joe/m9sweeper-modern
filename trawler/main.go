package main

import (
 "bytes"
 "context"
 "crypto/rand"
 "crypto/tls"
 "crypto/x509"
 "net/url"
 "path/filepath"
 "encoding/hex"
 "encoding/json"
 "fmt"
 "io"
 "log"
 "net/http"
 "os"
 "os/exec"
 "strings"
 "time"
)

type payload struct {
 ClusterID string `json:"clusterId"`
 ScanID string `json:"scanId"`
 Image string `json:"image"`
 ScannedAt string `json:"scannedAt"`
 Report json.RawMessage `json:"report"`
}
func scan(ctx context.Context, image string) error {
 idbytes := make([]byte,16)
 if _,err:=rand.Read(idbytes);err!=nil{return err}
 cmd:=exec.CommandContext(ctx,"trivy","image","--quiet","--scanners","vuln","--format","json",image)
 output,err:=cmd.Output()
 if err!=nil{return fmt.Errorf("trivy scan: %w",err)}
 if !json.Valid(output){return fmt.Errorf("invalid JSON from Trivy")}
 scan := payload{os.Getenv("M9_CLUSTER_ID"),hex.EncodeToString(idbytes),image,time.Now().UTC().Format(time.RFC3339Nano),json.RawMessage(output)}
 data,err:=json.Marshal([]payload{scan});if err!=nil{return err}
 url:=strings.TrimRight(os.Getenv("M9_BACKEND_URL"),"/")+"/v1/scans"
 req,err:=http.NewRequestWithContext(ctx,http.MethodPost,url,bytes.NewReader(data));if err!=nil{return err}
 req.Header.Set("Authorization","Bearer "+os.Getenv("M9_AGENT_API_KEY"))
 req.Header.Set("Content-Type","application/json")
 client:= &http.Client{Timeout:2*time.Minute}
 res,err:=client.Do(req);if err!=nil{return err};defer res.Body.Close()
 response,_:=io.ReadAll(io.LimitReader(res.Body,2048))
 if res.StatusCode!=201{return fmt.Errorf("backend status %d: %s",res.StatusCode,string(response))}
 log.Printf("completed %s: %s",image,string(response));return nil
}
// discoverClusterImages reads PodSpec image references using the service-account's
// scoped read permissions. No external kubectl or kubeconfig is required.
func discoverClusterImages(ctx context.Context) ([]string,error) {
 host:=os.Getenv("KUBERNETES_SERVICE_HOST")
 port:=os.Getenv("KUBERNETES_SERVICE_PORT_HTTPS")
 if port=="" {port="443"}
 if host=="" {return nil,fmt.Errorf("KUBERNETES_SERVICE_HOST not set")}
 root:="/var/run/secrets/kubernetes.io/serviceaccount"
 token,err:=os.ReadFile(filepath.Join(root,"token"));if err!=nil{return nil,err}
 ca,err:=os.ReadFile(filepath.Join(root,"ca.crt"));if err!=nil{return nil,err}
 pool:=x509.NewCertPool()
 if !pool.AppendCertsFromPEM(ca){return nil,fmt.Errorf("invalid cluster CA")}
 client:=&http.Client{Timeout:45*time.Second,Transport:&http.Transport{TLSClientConfig:&tls.Config{RootCAs:pool,MinVersion:tls.VersionTLS12}}}
 seen:=make(map[string]struct{})
 cursor:=""
 for {
  endpoint:="https://"+host+":"+port+"/api/v1/pods?limit=500"
  if cursor!="" {endpoint+="&continue="+url.QueryEscape(cursor)}
  request,err:=http.NewRequestWithContext(ctx,http.MethodGet,endpoint,nil)
  if err!=nil{return nil,err}
  request.Header.Set("Authorization","Bearer "+strings.TrimSpace(string(token)))
  response,err:=client.Do(request);if err!=nil{return nil,err}
  payload,err:=io.ReadAll(io.LimitReader(response.Body,16*1024*1024))
  response.Body.Close()
  if err!=nil{return nil,err}
  if response.StatusCode!=http.StatusOK{return nil,fmt.Errorf("Kubernetes pods API returned %d",response.StatusCode)}
  var list struct {
   Metadata struct { Continue string `json:"continue"` } `json:"metadata"`
   Items []struct { Spec struct {
    InitContainers []struct {Image string `json:"image"`} `json:"initContainers"`
    Containers []struct {Image string `json:"image"`} `json:"containers"`
    EphemeralContainers []struct {Image string `json:"image"`} `json:"ephemeralContainers"`
   } `json:"spec"` } `json:"items"`
  }
  if err:=json.Unmarshal(payload,&list);err!=nil{return nil,err}
  for _,pod:=range list.Items {
   for _,container:=range pod.Spec.InitContainers {if container.Image!=""{seen[container.Image]=struct{}{}}}
   for _,container:=range pod.Spec.Containers {if container.Image!=""{seen[container.Image]=struct{}{}}}
   for _,container:=range pod.Spec.EphemeralContainers {if container.Image!=""{seen[container.Image]=struct{}{}}}
   if len(seen)>500 {return nil,fmt.Errorf("cluster has more than 500 unique images; configure scan scope")}
  }
  cursor=list.Metadata.Continue
  if cursor=="" {break}
 }
 images:=make([]string,0,len(seen))
 for image:=range seen {images=append(images,image)}
 return images,nil
}
func main(){
 if len(os.Getenv("M9_AGENT_API_KEY"))<32 || os.Getenv("M9_BACKEND_URL")==""{log.Fatal("M9_AGENT_API_KEY (32+ chars) and M9_BACKEND_URL required")}
 images:=strings.Split(os.Getenv("M9_SCAN_IMAGES"),",")
 source:=os.Getenv("M9_SCAN_SOURCE")
 if source!="" && source!="images" && source!="kubernetes" {log.Fatal("M9_SCAN_SOURCE must be images or kubernetes")}
 interval:=time.Hour*6
 if v:=os.Getenv("M9_SCAN_INTERVAL");v!=""{n,err:=time.ParseDuration(v);if err!=nil||n<time.Minute{log.Fatal("M9_SCAN_INTERVAL must be >=1m")};interval=n}
 for {
  cycleImages:=images
  if source=="kubernetes" {
   ctx,cancel:=context.WithTimeout(context.Background(),2*time.Minute)
   discovered,err:=discoverClusterImages(ctx);cancel()
   if err!=nil{log.Printf("Kubernetes discovery failed: %v; no scan performed",err);time.Sleep(interval);continue}
   cycleImages=discovered
   log.Printf("discovered %d unique container images",len(cycleImages))
  }
  for _,candidate:=range cycleImages {
   image:=strings.TrimSpace(candidate);if image==""{continue}
   ctx,cancel:=context.WithTimeout(context.Background(),30*time.Minute)
   if err:=scan(ctx,image);err!=nil{log.Printf("scan failed for %s: %v",image,err)}
   cancel()
  }
  log.Printf("scan cycle done; next in %s",interval)
  time.Sleep(interval)
 }
}
