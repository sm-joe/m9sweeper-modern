package main
import "testing"
func TestPayloadShape(t *testing.T) {
 p := payload{ClusterID:"local",ScanID:"abc",Image:"alpine:3.21"}
 if p.ClusterID=="" || p.ScanID=="" || p.Image=="" {t.Fatal("invalid scan envelope")}
}
