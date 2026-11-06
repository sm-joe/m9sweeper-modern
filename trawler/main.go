package main

import (
 "bytes"
 "context"
 "crypto/rand"
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
func main(){
 if len(os.Getenv("M9_AGENT_API_KEY"))<32 || os.Getenv("M9_BACKEND_URL")==""{log.Fatal("M9_AGENT_API_KEY (32+ chars) and M9_BACKEND_URL required")}
 images:=strings.Split(os.Getenv("M9_SCAN_IMAGES"),",")
 interval:=time.Hour*6
 if v:=os.Getenv("M9_SCAN_INTERVAL");v!=""{n,err:=time.ParseDuration(v);if err!=nil||n<time.Minute{log.Fatal("M9_SCAN_INTERVAL must be >=1m")};interval=n}
 for {
  for _,candidate:=range images {
   image:=strings.TrimSpace(candidate);if image==""{continue}
   ctx,cancel:=context.WithTimeout(context.Background(),30*time.Minute)
   if err:=scan(ctx,image);err!=nil{log.Printf("scan failed for %s: %v",image,err)}
   cancel()
  }
  log.Printf("scan cycle done; next in %s",interval)
  time.Sleep(interval)
 }
}
