# Docker Deployment Guide

This guide covers running SecretSentinel-ScannerRotator in Docker containers.

## Quick Start

### Build the image

```bash
docker build -t sentinel-scanner:latest .
```

### Run a basic scan

```bash
# Scan current directory in dry-run mode
docker run --rm -v "$(pwd):/workspace:ro" sentinel-scanner:latest scan /workspace --dry-run
```

### Using docker-compose

```bash
# Basic scan
docker-compose run --rm sentinel-scanner

# With custom command
docker-compose run --rm sentinel-scanner scan /workspace --rotator backend --dry-run

# Start metrics server
docker-compose up sentinel-metrics
```

## Container Services

The `docker-compose.yml` includes several pre-configured services:

### 1. sentinel-scanner (default)

Basic scanner with file backend, read-only workspace mount.

```bash
docker-compose run --rm sentinel-scanner scan /workspace --dry-run
```

### 2. sentinel-metrics

Metrics server with Prometheus endpoint on port 9095.

```bash
docker-compose up -d sentinel-metrics
curl http://localhost:9095/metrics
curl http://localhost:9095/healthz
```

### 3. sentinel-aws

AWS Secrets Manager backend integration.

**Prerequisites:**

- AWS credentials in `~/.aws/`
- Set `AWS_REGION` and `AWS_PROFILE` environment variables

```bash
AWS_REGION=us-east-1 AWS_PROFILE=default docker-compose run --rm sentinel-aws
```

### 4. sentinel-vault

HashiCorp Vault backend integration.

```bash
# Start Vault dev server
docker-compose up -d vault

# Run scanner with Vault backend
VAULT_TOKEN=dev-token docker-compose run --rm sentinel-vault
```

## Configuration

### Environment Variables

All `SENTINEL_*` environment variables are supported:

```bash
docker run --rm \
  -v "$(pwd):/workspace:ro" \
  -e SENTINEL_LOG_LEVEL=debug \
  -e SENTINEL_CACHE=/app/data/cache.json \
  -e SENTINEL_SCAN_CONCURRENCY=16 \
  sentinel-scanner:latest \
  scan /workspace --dry-run
```

### Persistent Data

Use volumes for cache and backend storage:

```bash
docker volume create sentinel-data

docker run --rm \
  -v "$(pwd):/workspace:ro" \
  -v sentinel-data:/app/data \
  -e SENTINEL_CACHE=/app/data/cache.json \
  -e SENTINEL_BACKEND_FILE=/app/data/secrets.json \
  sentinel-scanner:latest \
  scan /workspace --rotator backend --dry-run
```

### Custom Configuration

Mount config files:

```bash
docker run --rm \
  -v "$(pwd):/workspace:ro" \
  -v "$(pwd)/my-config.yaml:/app/config/custom.yaml:ro" \
  sentinel-scanner:latest \
  scan /workspace --config /app/config/custom.yaml --dry-run
```

## Security Considerations

### Non-root User

The container runs as user `sentinel` (UID 1001) by default:

```bash
# Verify user
docker run --rm sentinel-scanner:latest sh -c 'id'
```

### Read-only Workspace

Mount workspaces as read-only to prevent accidental modifications:

```bash
docker run --rm -v "$(pwd):/workspace:ro" sentinel-scanner:latest scan /workspace --dry-run
```

### Secrets Management

**Do NOT:**

- Commit secrets to `.env` files
- Pass secrets via command-line arguments (visible in logs)
- Mount sensitive credentials as read-write

**Do:**

- Use Docker secrets or external secret managers
- Mount AWS/Vault credentials as read-only
- Use environment variables for non-sensitive config

```bash
# Bad - secrets in command
docker run --rm -e VAULT_TOKEN=s.sensitive sentinel-scanner:latest

# Good - use Docker secrets or external injection
docker run --rm --env-file <(vault kv get -format=json secret/sentinel | jq -r '.data.data | to_entries[] | "\(.key)=\(.value)"') sentinel-scanner:latest
```

## Production Deployment

### Health Checks

The container includes a built-in health check:

```bash
docker run -d --name sentinel sentinel-scanner:latest scan /app --dry-run --metrics-server

# Check health
docker inspect --format='{{.State.Health.Status}}' sentinel
```

### Resource Limits

Set appropriate limits for production:

```bash
docker run --rm \
  --memory=512m \
  --cpus=2 \
  -v "$(pwd):/workspace:ro" \
  sentinel-scanner:latest \
  scan /workspace --dry-run
```

### Logging

Configure JSON logging for production:

```bash
docker run --rm \
  -v "$(pwd):/workspace:ro" \
  -e SENTINEL_LOG_LEVEL=info \
  sentinel-scanner:latest \
  scan /workspace --log-json --dry-run
```

## CI/CD Integration

### GitHub Actions

```yaml
- name: Scan for secrets
  run: |
    docker run --rm -v "${{ github.workspace }}:/workspace:ro" \
      sentinel-scanner:latest \
      scan /workspace --fail-on-findings --dry-run
```

### GitLab CI

```yaml
scan-secrets:
  image: sentinel-scanner:latest
  script:
    - sentinel scan . --fail-on-findings --dry-run
```

### Jenkins

```groovy
stage('Secret Scan') {
  agent {
    docker {
      image 'sentinel-scanner:latest'
      args '-v $WORKSPACE:/workspace:ro'
    }
  }
  steps {
    sh 'sentinel scan /workspace --fail-on-findings --dry-run'
  }
}
```

## Troubleshooting

### Permission Issues

If you encounter permission errors:

```bash
# Run as current user
docker run --rm --user $(id -u):$(id -g) \
  -v "$(pwd):/workspace:ro" \
  sentinel-scanner:latest \
  scan /workspace --dry-run
```

### Debug Mode

Enable verbose logging:

```bash
docker run --rm \
  -v "$(pwd):/workspace:ro" \
  -e SENTINEL_LOG_LEVEL=debug \
  sentinel-scanner:latest \
  scan /workspace --dry-run
```

### Interactive Shell

Access container shell for debugging:

```bash
docker run --rm -it \
  -v "$(pwd):/workspace:ro" \
  --entrypoint sh \
  sentinel-scanner:latest
```

## Building Custom Images

### Multi-arch Builds

```bash
docker buildx create --use
docker buildx build --platform linux/amd64,linux/arm64 -t sentinel-scanner:latest .
```

### Build with Custom Base

```dockerfile
FROM node:20-alpine AS builder
# ... existing builder stage ...

FROM gcr.io/distroless/nodejs20-debian12
# ... distroless production stage ...
```

## Maintenance

### Update Dependencies

Rebuild regularly to get security patches:

```bash
docker build --no-cache -t sentinel-scanner:latest .
```

### Cleanup

```bash
# Remove old images
docker image prune -a

# Remove volumes
docker volume prune
```

## Support

For issues or questions:

- GitHub Issues: https://github.com/sirhCC/Sentinel-ScannerRotator/issues
- Security: See SECURITY.md
