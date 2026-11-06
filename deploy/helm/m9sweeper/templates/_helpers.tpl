{{- define "m9.image" -}}
{{- if .digest -}}{{ .repository }}@{{ .digest }}{{- else -}}{{ .repository }}:{{ .tag }}{{- end -}}
{{- end -}}
{{- define "m9.labels" -}}
app.kubernetes.io/part-of: m9sweeper
app.kubernetes.io/managed-by: Helm
{{- end -}}
