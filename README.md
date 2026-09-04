# infra-stack-demo

A minimal backend (Node.js) + Postgres stack deployed to Kubernetes, with a
GitHub Actions CI/CD pipeline (hosted runner only, no self-hosted runner),
Kubernetes Secrets as the reliability improvement, and one intentional
failure to debug live.

## What's inside

```
infra-stack-demo/
├── app/
│   ├── server.js          -> tiny Express API, /healthz and /items
│   ├── package.json
│   └── Dockerfile
├── k8s/
│   ├── 00-secret.yaml               -> DB credentials (Secret)
│   ├── 01-postgres-deployment.yaml
│   ├── 02-postgres-service.yaml
│   ├── 03-backend-deployment.yaml   -> the WORKING backend config
│   ├── 04-backend-service.yaml
│   └── 99-backend-BROKEN-demo.yaml  -> intentionally broken, for the failure demo
└── .github/workflows/deploy.yml     -> CI/CD pipeline
```

---

## Part 1 — One-time setup (before recording anything)

Install these once, locally:
- Docker Desktop (or Docker Engine)
- kubectl: https://kubernetes.io/docs/tasks/tools/
- kind: https://kind.sigs.k8s.io/docs/user/quick-start/#installation
- A GitHub account (for the CI/CD part)

Check everything is installed:

```bash
docker --version
kubectl version --client
kind version
```

---

## Part 2 — Local Kubernetes deployment (this is your "Live Demo" section)

### 1. Create the cluster

```bash
kind create cluster --name infra-stack-demo
```

### 2. Build the Docker image and load it into the kind cluster

kind clusters run inside Docker and don't share your host's Docker images,
so after building you load the image directly into the cluster. This avoids
needing a container registry at all.

```bash
cd infra-stack-demo
docker build -t backend:latest ./app
kind load docker-image backend:latest --name infra-stack-demo
```

### 3. Deploy everything

```bash
kubectl apply -f k8s/00-secret.yaml
kubectl apply -f k8s/01-postgres-deployment.yaml
kubectl apply -f k8s/02-postgres-service.yaml
kubectl apply -f k8s/03-backend-deployment.yaml
kubectl apply -f k8s/04-backend-service.yaml
```

### 4. Confirm it's running

```bash
kubectl get pods
kubectl get deployments
kubectl get svc
```

Wait until backend and postgres pods show `Running` / `1/1`.

### 5. Talk to the app

```bash
kubectl port-forward svc/backend 3000:3000
```

In another terminal:

```bash
curl http://localhost:3000/healthz
curl http://localhost:3000/items
```

`/items` proves the backend actually reached Postgres (it returns
`server_time` from the database).

**Record this part** — pods running, `curl` responses — for the "Live Demo" section.

---

## Part 3 — CI/CD pipeline (GitHub Actions, hosted runner only)

### 1. Push the project to GitHub

```bash
cd infra-stack-demo
git init
git add .
git commit -m "initial commit: backend + k8s manifests + ci/cd"
git branch -M main
git remote add origin https://github.com/<your-username>/<your-repo>.git
git push -u origin main
```

### 2. What happens automatically

On every push to `main`, `.github/workflows/deploy.yml` runs on GitHub's
standard `ubuntu-latest` hosted runner (no self-hosted runner needed) and:
1. builds the Docker image,
2. spins up a throwaway Kubernetes cluster (KinD) inside the runner,
3. loads the image straight into that cluster (no registry required),
4. applies all the manifests in `k8s/`,
5. waits for both deployments to roll out,
6. curls `/healthz` and `/items` to prove the deployment actually works.

### 3. Show it in your video

Go to your repo's **Actions** tab, open the latest run, and show the green
checkmarks with the build/deploy/smoke-test steps expanded.

**Record this part** for the "CI/CD Execution" section.

---

## Part 4 — Reliability improvement: Kubernetes Secrets

Look at `k8s/00-secret.yaml` and `k8s/03-backend-deployment.yaml`:

```bash
kubectl get secret db-credentials -o yaml
```

**Explain on camera:**
- **Why chosen:** it's the simplest, highest-impact fix for the most common
  real mistake — hardcoding DB passwords into deployment YAML or source code.
- **What problem it solves:** credentials aren't sitting in plain text in
  the Deployment spec or committed to git.
- **Tradeoff:** a Kubernetes Secret is only base64-encoded, not encrypted,
  by default — anyone with `kubectl get secret -o yaml` access to the
  cluster can read it. In real production you'd add encryption at rest,
  or use something like Sealed Secrets / HashiCorp Vault / AWS Secrets Manager
  on top of this.

---

## Part 5 — Intentional failure simulation (this is the most important section)

### 1. Break it on purpose

```bash
kubectl apply -f k8s/99-backend-BROKEN-demo.yaml
```

This changes `DB_HOST` to a wrong value (`postgres-wrong-name`).

### 2. Show the failure

```bash
kubectl get pods
```

You'll see the backend pods erroring out or restarting.

### 3. Debug it live

```bash
kubectl describe pod <backend-pod-name>
kubectl logs <backend-pod-name>
```

- `describe` shows Kubernetes-level events (image, scheduling, restarts).
- `logs` shows the actual application error — the Postgres connection
  failing because `DB_HOST` doesn't resolve to a real service.

**Talk through your reasoning out loud here:** "pod is restarting → check
events → nothing wrong with scheduling/image → check logs → app-level DB
connection error → check env vars → found the wrong hostname."

### 4. Fix it

```bash
kubectl apply -f k8s/03-backend-deployment.yaml
kubectl rollout status deployment/backend
```

### 5. Confirm it's healthy again

```bash
kubectl get pods
kubectl port-forward svc/backend 3000:3000
curl http://localhost:3000/items
```

**Record all of steps 1–5** for the "Failure Debugging Walkthrough" section.

---

## Part 6 — Tradeoff discussion (talk through this on camera)

What was intentionally simplified:
- **Postgres storage uses `emptyDir`**, not a PersistentVolume — data is
  lost if the pod restarts. Fine for a demo, not for production.
- **No readiness/liveness probes** — Kubernetes doesn't automatically know
  if the app is actually healthy, only if the process is alive.
- **No ingress/TLS** — accessed via `port-forward` / NodePort only.
- **Single-node cluster** (kind) instead of a multi-node,
  multi-AZ cluster.
- **Secrets are base64, not encrypted** at rest.

What would break at scale:
- Losing the Postgres pod loses all data (no PersistentVolume).
- No autoscaling means traffic spikes could overwhelm the 2 backend replicas.
- No probes means Kubernetes could keep routing traffic to a pod that's
  technically running but can't reach the database.

What you'd improve in real production:
- PersistentVolume/StatefulSet for Postgres (or a managed DB like RDS/Cloud SQL).
- Add readiness/liveness probes and an HPA for autoscaling.
- Real secret management (Vault, Sealed Secrets, or cloud-native secret managers).
- Ingress + TLS instead of port-forward/NodePort.
- Multi-node cluster with proper resource quotas and monitoring (Prometheus/Grafana).

---

## Full command list (copy-paste order)

```bash
# local deploy
kind create cluster --name infra-stack-demo
docker build -t backend:latest ./app
kind load docker-image backend:latest --name infra-stack-demo
kubectl apply -f k8s/00-secret.yaml
kubectl apply -f k8s/01-postgres-deployment.yaml
kubectl apply -f k8s/02-postgres-service.yaml
kubectl apply -f k8s/03-backend-deployment.yaml
kubectl apply -f k8s/04-backend-service.yaml
kubectl get pods
kubectl port-forward svc/backend 3000:3000 &
curl http://localhost:3000/healthz
curl http://localhost:3000/items

# push for CI/CD
git init
git add .
git commit -m "initial commit"
git branch -M main
git remote add origin https://github.com/<your-username>/<your-repo>.git
git push -u origin main

# failure simulation
kubectl apply -f k8s/99-backend-BROKEN-demo.yaml
kubectl get pods
kubectl describe pod <backend-pod-name>
kubectl logs <backend-pod-name>
kubectl apply -f k8s/03-backend-deployment.yaml
kubectl rollout status deployment/backend
curl http://localhost:3000/items

# cleanup (optional, once you're done recording)
kind delete cluster --name infra-stack-demo
```
