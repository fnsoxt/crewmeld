{{/*
Expand the name of the chart.
*/}}
{{- define "crewmeld.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
We truncate at 63 chars because some Kubernetes name fields are limited to this (by the DNS naming spec).
If release name contains chart name it will be used as a full name.
*/}}
{{- define "crewmeld.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "crewmeld.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "crewmeld.labels" -}}
helm.sh/chart: {{ include "crewmeld.chart" . }}
{{ include "crewmeld.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- with .Values.global.commonLabels }}
{{ toYaml . }}
{{- end }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "crewmeld.selectorLabels" -}}
app.kubernetes.io/name: {{ include "crewmeld.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
App specific labels
*/}}
{{- define "crewmeld.app.labels" -}}
{{ include "crewmeld.labels" . }}
app.kubernetes.io/component: app
{{- end }}

{{/*
App selector labels
*/}}
{{- define "crewmeld.app.selectorLabels" -}}
{{ include "crewmeld.selectorLabels" . }}
app.kubernetes.io/component: app
{{- end }}

{{/*
Realtime specific labels
*/}}
{{- define "crewmeld.realtime.labels" -}}
{{ include "crewmeld.labels" . }}
app.kubernetes.io/component: realtime
{{- end }}

{{/*
Realtime selector labels
*/}}
{{- define "crewmeld.realtime.selectorLabels" -}}
{{ include "crewmeld.selectorLabels" . }}
app.kubernetes.io/component: realtime
{{- end }}

{{/*
PostgreSQL specific labels
*/}}
{{- define "crewmeld.postgresql.labels" -}}
{{ include "crewmeld.labels" . }}
app.kubernetes.io/component: postgresql
{{- end }}

{{/*
PostgreSQL selector labels
*/}}
{{- define "crewmeld.postgresql.selectorLabels" -}}
{{ include "crewmeld.selectorLabels" . }}
app.kubernetes.io/component: postgresql
{{- end }}

{{/*
Ollama specific labels
*/}}
{{- define "crewmeld.ollama.labels" -}}
{{ include "crewmeld.labels" . }}
app.kubernetes.io/component: ollama
{{- end }}

{{/*
Ollama selector labels
*/}}
{{- define "crewmeld.ollama.selectorLabels" -}}
{{ include "crewmeld.selectorLabels" . }}
app.kubernetes.io/component: ollama
{{- end }}

{{/*
Migrations specific labels
*/}}
{{- define "crewmeld.migrations.labels" -}}
{{ include "crewmeld.labels" . }}
app.kubernetes.io/component: migrations
{{- end }}

{{/*
Create the name of the service account to use
*/}}
{{- define "crewmeld.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "crewmeld.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{/*
Create image name with registry
Expects context with image object passed as second parameter
Usage: {{ include "crewmeld.image" (dict "context" . "image" .Values.app.image) }}
*/}}
{{- define "crewmeld.image" -}}
{{- $registry := "" -}}
{{- $repository := .image.repository -}}
{{- $tag := .image.tag | toString -}}
{{- /* Use global registry for proinsight.io images or when explicitly set for all images */ -}}
{{- if .context.Values.global.imageRegistry -}}
  {{- if or (hasPrefix "proinsight.io/" $repository) .context.Values.global.useRegistryForAllImages -}}
    {{- $registry = .context.Values.global.imageRegistry -}}
  {{- end -}}
{{- end -}}
{{- if $registry -}}
{{- printf "%s/%s:%s" $registry $repository $tag }}
{{- else -}}
{{- printf "%s:%s" $repository $tag }}
{{- end -}}
{{- end }}

{{/*
Database URL for internal PostgreSQL
*/}}
{{- define "crewmeld.databaseUrl" -}}
{{- if .Values.postgresql.enabled }}
{{- $host := printf "%s-postgresql" (include "crewmeld.fullname" .) }}
{{- $port := .Values.postgresql.service.port }}
{{- $username := .Values.postgresql.auth.username }}
{{- $database := .Values.postgresql.auth.database }}
{{- $sslMode := ternary "require" "disable" .Values.postgresql.tls.enabled }}
{{- printf "postgresql://%s:$(POSTGRES_PASSWORD)@%s:%v/%s?sslmode=%s" $username $host $port $database $sslMode }}
{{- else if .Values.externalDatabase.enabled }}
{{- $host := .Values.externalDatabase.host }}
{{- $port := .Values.externalDatabase.port }}
{{- $username := .Values.externalDatabase.username }}
{{- $database := .Values.externalDatabase.database }}
{{- $sslMode := .Values.externalDatabase.sslMode }}
{{- printf "postgresql://%s:$(EXTERNAL_DB_PASSWORD)@%s:%v/%s?sslmode=%s" $username $host $port $database $sslMode }}
{{- end }}
{{- end }}

{{/*
Validate required secrets and reject default placeholder values
Skip validation when using existing secrets or External Secrets Operator
*/}}
{{- define "crewmeld.validateSecrets" -}}
{{- $useExistingAppSecret := and .Values.app.secrets .Values.app.secrets.existingSecret .Values.app.secrets.existingSecret.enabled }}
{{- $useExternalSecrets := and .Values.externalSecrets .Values.externalSecrets.enabled }}
{{- $useExistingPostgresSecret := and .Values.postgresql.auth.existingSecret .Values.postgresql.auth.existingSecret.enabled }}
{{- $useExistingExternalDbSecret := and .Values.externalDatabase.existingSecret .Values.externalDatabase.existingSecret.enabled }}
{{- /* App secrets validation - skip if using existing secret or ESO */ -}}
{{- if not (or $useExistingAppSecret $useExternalSecrets) }}
{{- if and .Values.app.enabled (not .Values.app.env.BETTER_AUTH_SECRET) }}
{{- fail "app.env.BETTER_AUTH_SECRET is required for production deployment" }}
{{- end }}
{{- if and .Values.app.enabled (eq .Values.app.env.BETTER_AUTH_SECRET "CHANGE-ME-32-CHAR-SECRET-FOR-PRODUCTION-USE") }}
{{- fail "app.env.BETTER_AUTH_SECRET must not use the default placeholder value. Generate a secure secret with: openssl rand -hex 32" }}
{{- end }}
{{- if and .Values.app.enabled (not .Values.app.env.ENCRYPTION_KEY) }}
{{- fail "app.env.ENCRYPTION_KEY is required for production deployment" }}
{{- end }}
{{- if and .Values.app.enabled (eq .Values.app.env.ENCRYPTION_KEY "CHANGE-ME-32-CHAR-ENCRYPTION-KEY-FOR-PROD") }}
{{- fail "app.env.ENCRYPTION_KEY must not use the default placeholder value. Generate a secure key with: openssl rand -hex 32" }}
{{- end }}
{{- if and .Values.realtime.enabled (eq .Values.realtime.env.BETTER_AUTH_SECRET "CHANGE-ME-32-CHAR-SECRET-FOR-PRODUCTION-USE") }}
{{- fail "realtime.env.BETTER_AUTH_SECRET must not use the default placeholder value. Generate a secure secret with: openssl rand -hex 32" }}
{{- end }}
{{- end }}
{{- /* PostgreSQL password validation - skip if using existing secret or ESO */ -}}
{{- if not (or $useExistingPostgresSecret $useExternalSecrets) }}
{{- if and .Values.postgresql.enabled (not .Values.postgresql.auth.password) }}
{{- fail "postgresql.auth.password is required when using internal PostgreSQL" }}
{{- end }}
{{- if and .Values.postgresql.enabled (eq .Values.postgresql.auth.password "CHANGE-ME-SECURE-PASSWORD") }}
{{- fail "postgresql.auth.password must not use the default placeholder value. Set a secure password for production" }}
{{- end }}
{{- if and .Values.postgresql.enabled .Values.postgresql.auth.password (not (regexMatch "^[a-zA-Z0-9._-]+$" .Values.postgresql.auth.password)) }}
{{- fail "postgresql.auth.password must only contain alphanumeric characters, hyphens, underscores, or periods to ensure DATABASE_URL compatibility. Generate with: openssl rand -base64 16 | tr -d '/+='" }}
{{- end }}
{{- end }}
{{- /* External database password validation - skip if using existing secret or ESO */ -}}
{{- if not (or $useExistingExternalDbSecret $useExternalSecrets) }}
{{- if and .Values.externalDatabase.enabled (not .Values.externalDatabase.password) }}
{{- fail "externalDatabase.password is required when using external database" }}
{{- end }}
{{- if and .Values.externalDatabase.enabled .Values.externalDatabase.password (not (regexMatch "^[a-zA-Z0-9._-]+$" .Values.externalDatabase.password)) }}
{{- fail "externalDatabase.password must only contain alphanumeric characters, hyphens, underscores, or periods to ensure DATABASE_URL compatibility." }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Get the app secrets name
Returns the name of the secret containing app credentials (auth, encryption keys)
*/}}
{{- define "crewmeld.appSecretName" -}}
{{- if and .Values.app.secrets .Values.app.secrets.existingSecret .Values.app.secrets.existingSecret.enabled -}}
{{- .Values.app.secrets.existingSecret.name -}}
{{- else -}}
{{- printf "%s-app-secrets" (include "crewmeld.fullname" .) -}}
{{- end -}}
{{- end }}

{{/*
Get the PostgreSQL secret name
Returns the name of the secret containing PostgreSQL password
*/}}
{{- define "crewmeld.postgresqlSecretName" -}}
{{- if and .Values.postgresql.auth.existingSecret .Values.postgresql.auth.existingSecret.enabled -}}
{{- .Values.postgresql.auth.existingSecret.name -}}
{{- else -}}
{{- printf "%s-postgresql-secret" (include "crewmeld.fullname" .) -}}
{{- end -}}
{{- end }}

{{/*
Get the PostgreSQL password key name
Returns the key name in the secret that contains the password
*/}}
{{- define "crewmeld.postgresqlPasswordKey" -}}
{{- if and .Values.postgresql.auth.existingSecret .Values.postgresql.auth.existingSecret.enabled -}}
{{- .Values.postgresql.auth.existingSecret.passwordKey | default "POSTGRES_PASSWORD" -}}
{{- else -}}
{{- print "POSTGRES_PASSWORD" -}}
{{- end -}}
{{- end }}

{{/*
Get the external database secret name
Returns the name of the secret containing external database password
*/}}
{{- define "crewmeld.externalDbSecretName" -}}
{{- if and .Values.externalDatabase.existingSecret .Values.externalDatabase.existingSecret.enabled -}}
{{- .Values.externalDatabase.existingSecret.name -}}
{{- else -}}
{{- printf "%s-external-db-secret" (include "crewmeld.fullname" .) -}}
{{- end -}}
{{- end }}

{{/*
Get the external database password key name
Returns the key name in the secret that contains the password
*/}}
{{- define "crewmeld.externalDbPasswordKey" -}}
{{- if and .Values.externalDatabase.existingSecret .Values.externalDatabase.existingSecret.enabled -}}
{{- .Values.externalDatabase.existingSecret.passwordKey | default "EXTERNAL_DB_PASSWORD" -}}
{{- else -}}
{{- print "EXTERNAL_DB_PASSWORD" -}}
{{- end -}}
{{- end }}

{{/*
Check if app secrets should be created by the chart
Returns true if we should create the app secrets (not using existing or ESO)
*/}}
{{- define "crewmeld.createAppSecrets" -}}
{{- $useExistingAppSecret := and .Values.app.secrets .Values.app.secrets.existingSecret .Values.app.secrets.existingSecret.enabled }}
{{- $useExternalSecrets := and .Values.externalSecrets .Values.externalSecrets.enabled }}
{{- if not (or $useExistingAppSecret $useExternalSecrets) -}}
true
{{- end -}}
{{- end }}

{{/*
Check if PostgreSQL secret should be created by the chart
Returns true if we should create the PostgreSQL secret (not using existing or ESO)
*/}}
{{- define "crewmeld.createPostgresqlSecret" -}}
{{- $useExistingSecret := and .Values.postgresql.auth.existingSecret .Values.postgresql.auth.existingSecret.enabled }}
{{- $useExternalSecrets := and .Values.externalSecrets .Values.externalSecrets.enabled }}
{{- if not (or $useExistingSecret $useExternalSecrets) -}}
true
{{- end -}}
{{- end }}

{{/*
Check if external database secret should be created by the chart
Returns true if we should create the external database secret (not using existing or ESO)
*/}}
{{- define "crewmeld.createExternalDbSecret" -}}
{{- $useExistingSecret := and .Values.externalDatabase.existingSecret .Values.externalDatabase.existingSecret.enabled }}
{{- $useExternalSecrets := and .Values.externalSecrets .Values.externalSecrets.enabled }}
{{- if not (or $useExistingSecret $useExternalSecrets) -}}
true
{{- end -}}
{{- end }}

{{/*
Ollama URL
*/}}
{{- define "crewmeld.ollamaUrl" -}}
{{- if .Values.ollama.enabled }}
{{- $serviceName := printf "%s-ollama" (include "crewmeld.fullname" .) }}
{{- $port := .Values.ollama.service.port }}
{{- printf "http://%s:%v" $serviceName $port }}
{{- else }}
{{- .Values.app.env.OLLAMA_URL | default "http://localhost:11434" }}
{{- end }}
{{- end }}

{{/*
Socket Server URL (internal)
*/}}
{{- define "crewmeld.socketServerUrl" -}}
{{- if .Values.realtime.enabled }}
{{- $serviceName := printf "%s-realtime" (include "crewmeld.fullname" .) }}
{{- $port := .Values.realtime.service.port }}
{{- printf "http://%s:%v" $serviceName $port }}
{{- else }}
{{- .Values.app.env.SOCKET_SERVER_URL | default "http://localhost:6102" }}
{{- end }}
{{- end }}

{{/*
Resource limits and requests
*/}}
{{- define "crewmeld.resources" -}}
{{- if .resources }}
resources:
  {{- if .resources.limits }}
  limits:
    {{- toYaml .resources.limits | nindent 4 }}
  {{- end }}
  {{- if .resources.requests }}
  requests:
    {{- toYaml .resources.requests | nindent 4 }}
  {{- end }}
{{- end }}
{{- end }}

{{/*
Security context
*/}}
{{- define "crewmeld.securityContext" -}}
{{- if .securityContext }}
securityContext:
  {{- toYaml .securityContext | nindent 2 }}
{{- end }}
{{- end }}

{{/*
Pod security context
*/}}
{{- define "crewmeld.podSecurityContext" -}}
{{- if .podSecurityContext }}
securityContext:
  {{- toYaml .podSecurityContext | nindent 2 }}
{{- end }}
{{- end }}

{{/*
Node selector
*/}}
{{- define "crewmeld.nodeSelector" -}}
{{- if .nodeSelector }}
nodeSelector:
  {{- toYaml .nodeSelector | nindent 2 }}
{{- end }}
{{- end }}

{{/*
Tolerations
*/}}
{{- define "crewmeld.tolerations" -}}
{{- if .tolerations }}
tolerations:
  {{- toYaml .tolerations | nindent 2 }}
{{- end }}
{{- end }}

{{/*
Affinity
*/}}
{{- define "crewmeld.affinity" -}}
{{- if .affinity }}
affinity:
  {{- toYaml .affinity | nindent 2 }}
{{- end }}
{{- end }}

{{/*
Redis URL helper
*/}}
{{- define "crewmeld.redisUrl" -}}
{{- if .Values.redis.enabled -}}
redis://:$(REDIS_PASSWORD)@{{ include "crewmeld.fullname" . }}-redis:{{ .Values.redis.service.port }}
{{- end -}}
{{- end -}}

{{/*
Redis labels
*/}}
{{- define "crewmeld.redis.labels" -}}
{{ include "crewmeld.labels" . }}
app.kubernetes.io/component: redis
{{- end }}

{{/*
Redis selector labels
*/}}
{{- define "crewmeld.redis.selectorLabels" -}}
{{ include "crewmeld.selectorLabels" . }}
app.kubernetes.io/component: redis
{{- end }}

{{/*
License mount enabled check
*/}}
{{- define "crewmeld.licenseEnabled" -}}
{{- if and .Values.license.enabled (or .Values.license.content .Values.license.existingSecret.enabled) -}}
true
{{- end -}}
{{- end -}}