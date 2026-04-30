#!/bin/sh
set -e

SHARED_DIR="/shared"
KUBECONFIG_PATH="$SHARED_DIR/kubeconfig.yaml"
AUTOGEN_PATH="$SHARED_DIR/autogen.env"
RBAC_PATH="/app/scripts/k8s-rbac.yaml"

echo "⏳ Waiting for k3s kubeconfig at $KUBECONFIG_PATH..."
while [ ! -f "$KUBECONFIG_PATH" ]; do
  sleep 2
done

sed -i 's|https://127.0.0.1:6443|https://k3s:6443|g' "$KUBECONFIG_PATH" 2>/dev/null || true
# Remove certificate-authority-data and enable insecure-skip-tls-verify so kubectl
# works against k3s certificates that may not include the 'k3s' hostname SAN.
sed -i '/certificate-authority-data:/d' "$KUBECONFIG_PATH"
sed -i 's|server: https://k3s:6443|server: https://k3s:6443\n    insecure-skip-tls-verify: true|' "$KUBECONFIG_PATH"
export KUBECONFIG="$KUBECONFIG_PATH"

echo "⏳ Waiting for k3s API readiness..."
until kubectl get nodes 2>/dev/null | grep -q ' Ready '; do
  sleep 2
done
echo "✅ k3s API ready."

# === Self-healing: clean up stale state from previous k3s container lifecycles ===
# Every 'docker compose up --force-recreate k3s' creates a new container with a new
# hostname → new node entry in etcd. Old nodes become NotReady but linger, causing:
#   - local-path-provisioner pods stuck on dead nodes → PVC Pending forever
#   - PVCs pinned to old nodes via volume.kubernetes.io/selected-node annotation
# This block cleans that up so k3s self-heals on recreate.

STALE_NODES=$(kubectl get nodes --no-headers 2>/dev/null | awk '/NotReady/ {print $1}')
if [ -n "$STALE_NODES" ]; then
  echo "🧹 Cleaning up stale NotReady nodes..."
  for node in $STALE_NODES; do
    echo "    deleting node $node"
    kubectl delete node "$node" --force --grace-period=0 2>/dev/null || true
  done

  echo "🧹 Evicting pods stuck on deleted nodes..."
  kubectl get pods -A --field-selector=status.phase=Pending -o jsonpath='{range .items[*]}{.metadata.namespace} {.metadata.name}{"\n"}{end}' 2>/dev/null | \
    while read -r ns name; do
      [ -z "$ns" ] && continue
      kubectl -n "$ns" delete pod "$name" --force --grace-period=0 2>/dev/null || true
    done
  # Delete Terminating pods too (stuck in Terminating on dead nodes)
  kubectl get pods -A -o jsonpath='{range .items[?(@.metadata.deletionTimestamp)]}{.metadata.namespace} {.metadata.name}{"\n"}{end}' 2>/dev/null | \
    while read -r ns name; do
      [ -z "$ns" ] && continue
      kubectl -n "$ns" delete pod "$name" --force --grace-period=0 2>/dev/null || true
    done

  echo "🧹 Clearing stale selected-node annotation on Pending PVCs..."
  kubectl get pvc -A -o jsonpath='{range .items[?(@.status.phase=="Pending")]}{.metadata.namespace} {.metadata.name}{"\n"}{end}' 2>/dev/null | \
    while read -r ns name; do
      [ -z "$ns" ] && continue
      kubectl -n "$ns" annotate pvc "$name" volume.kubernetes.io/selected-node- 2>/dev/null || true
    done

  echo "✅ Self-healing complete."
fi

NS="${K8S_DEPLOY_NAMESPACE:-crewmeld-skills}"

echo "📦 Ensuring namespace '$NS'..."
kubectl get ns "$NS" >/dev/null 2>&1 || kubectl create ns "$NS"

echo "🔐 Applying RBAC manifest (includes PVC crewmeld-deps-cache)..."
kubectl -n "$NS" apply -f "$RBAC_PATH"

echo "🎫 Creating token for crewmeld-deployer (duration 8760h)..."
TOKEN=$(kubectl -n "$NS" create token crewmeld-deployer --duration=8760h)

if [ -z "$HOST_IP" ]; then
  # 1. Try resolving host.docker.internal — IPv4 only. Docker Desktop on Windows/WSL2
  #    writes both IPv4 and IPv6 entries to /etc/hosts, and glibc's `getent hosts`
  #    prefers IPv6 per RFC 3484 — breaking the downstream `http://IP:port` URL
  #    format (IPv6 literals require brackets). `ahostsv4` forces IPv4 resolution.
  HOST_IP=$(getent ahostsv4 host.docker.internal 2>/dev/null | awk '{print $1}' | head -1)

  # 2. Fallback: default route gateway (docker bridge → host), IPv4 only
  if [ -z "$HOST_IP" ]; then
    HOST_IP=$(ip -4 route show default 2>/dev/null | awk '/default/ {print $3}' | head -1)
  fi

  # 3. Fallback: ip route get (forced IPv4)
  if [ -z "$HOST_IP" ]; then
    HOST_IP=$(ip -4 route get 1.1.1.1 2>/dev/null | awk 'NR==1{print $7}')
  fi

  # 4. Last resort
  if [ -z "$HOST_IP" ]; then
    HOST_IP=127.0.0.1
    echo "⚠️  Could not auto-detect HOST_IP, falling back to 127.0.0.1 (skill pods may not reach host services)"
  fi
  echo "🌐 Auto-detected HOST_IP=$HOST_IP"
else
  echo "🌐 Using provided HOST_IP=$HOST_IP"
fi

MINIO_PORT="${MINIO_API_PORT:-9000}"
MINIO_AK="${MINIO_ACCESS_KEY:-rag_flow}"
MINIO_SK="${MINIO_SECRET_KEY:-infini_rag_flow}"
MINIO_BUCKET="${MINIO_BUCKET:-tool-files}"
WARM_POOL="${K8S_WARM_POOL_SIZE:-3}"

cat > "$AUTOGEN_PATH" <<EOF
K8S_API_SERVER=https://k3s:6443
K8S_API_TOKEN=$TOKEN
K8S_DEPLOY_NAMESPACE=$NS
K8S_NODE_IP=$HOST_IP
K8S_SKIP_TLS_VERIFY=true
K8S_WARM_POOL_SIZE=$WARM_POOL
MINIO_ENDPOINT=http://$HOST_IP:$MINIO_PORT
MINIO_ACCESS_KEY=$MINIO_AK
MINIO_SECRET_KEY=$MINIO_SK
MINIO_BUCKET=$MINIO_BUCKET
MINIO_PUBLIC_URL=http://$HOST_IP:$MINIO_PORT
EOF

echo "✅ autogen.env written to $AUTOGEN_PATH"
cat "$AUTOGEN_PATH" | sed 's/\(K8S_API_TOKEN=\).*/\1<redacted>/'

# === Pre-pull skill base images into k3s containerd ===
# Skill pods use imagePullPolicy: IfNotPresent — pre-pulling here just speeds up
# the first cold start. Failure is non-fatal (runtime will pull on demand) but
# logged loudly so users see registry reachability problems early.
# Per-image timeout is generous (30m) because some images (python:3.x, ~1GB)
# can take a long time on slow links / VPN; a single network hiccup must not
# silently kill the prepull.
PREPULL_IMAGES="${K8S_PREPULL_IMAGES:-node:22-bookworm python:3.12-bookworm}"
PREPULL_TIMEOUT="${K8S_PREPULL_TIMEOUT:-1800s}"

# Snapshot the kubelet's reported image cache once; check membership locally.
# kubelet reports cached images on Node.status.images[*].names[*] using both
# canonical and short refs (e.g. both "docker.io/library/node:20" and "node:20").
NODE_IMAGES=$(kubectl get nodes -o jsonpath='{.items[*].status.images[*].names[*]}' 2>/dev/null || echo "")

for img in $PREPULL_IMAGES; do
  # Skip if the kubelet already reports this image cached on any node.
  # Normalize the user-friendly form to the canonical containerd ref so cache
  # hits work whether the user wrote "node:20" or "docker.io/library/node:20".
  case "$img" in
    *"/"*) canonical="docker.io/$img" ;;
    *)     canonical="docker.io/library/$img" ;;
  esac
  case "$img" in
    *.*/*|localhost*|*:[0-9]*/*) canonical="$img" ;;  # already has a registry
  esac
  if echo "$NODE_IMAGES" | tr ' ' '\n' | grep -qFx "$img" \
     || echo "$NODE_IMAGES" | tr ' ' '\n' | grep -qFx "$canonical"; then
    echo "⏭  $img already cached on k3s node, skipping prepull"
    continue
  fi

  # Normalize image ref to a valid k8s container name (RFC 1123 label, no dots).
  # `kubectl run` uses NAME as both pod name AND container name; container names
  # forbid `.`, so versions like python:3.11 must become python-3-11.
  probe_name="image-prepull-$(echo "$img" | tr ':/.' '---' | tr '[:upper:]' '[:lower:]' | cut -c 1-50)"
  # Best-effort cleanup; ignore "not found" but show other errors
  kubectl -n kube-system delete pod "$probe_name" --force --grace-period=0 --ignore-not-found=true 2>&1 \
    | grep -v "^$" || true
  # Wait for the apiserver to actually drop the object so the next `run` doesn't AlreadyExists
  kubectl -n kube-system wait --for=delete pod/"$probe_name" --timeout=30s 2>/dev/null || true

  echo "📦 Pre-pulling image $img into k3s (timeout $PREPULL_TIMEOUT)..."
  # NO error suppression: if `kubectl run` fails (AlreadyExists, validation, RBAC,
  # connection error, etc.) we want to see exactly why instead of misleading
  # "pods not found" later from the describe step.
  if ! run_out=$(kubectl -n kube-system run "$probe_name" \
                   --image="$img" \
                   --image-pull-policy=IfNotPresent \
                   --restart=Never \
                   --command -- /bin/sh -c "exit 0" 2>&1); then
    echo "❌ kubectl run failed for $img:"
    echo "$run_out" | sed 's/^/    /'
    continue
  fi

  if kubectl -n kube-system wait --for=jsonpath='{.status.phase}'=Succeeded \
       pod/"$probe_name" --timeout="$PREPULL_TIMEOUT" 2>/dev/null; then
    echo "✅ $img ready on k3s node"
    kubectl -n kube-system delete pod "$probe_name" --force --grace-period=0 --ignore-not-found=true 2>/dev/null || true
  else
    echo "⚠️  Pre-pull of $img did not complete within $PREPULL_TIMEOUT"
    echo "    Pod status:"
    kubectl -n kube-system get pod "$probe_name" -o wide 2>&1 | sed 's/^/    /'
    echo "    Last events:"
    kubectl -n kube-system describe pod "$probe_name" 2>&1 | tail -25 | sed 's/^/    /'
    kubectl -n kube-system delete pod "$probe_name" --force --grace-period=0 --ignore-not-found=true 2>/dev/null || true
  fi
done

echo "🎉 k3s-init complete."
