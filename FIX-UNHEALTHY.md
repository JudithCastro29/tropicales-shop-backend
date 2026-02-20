# 🔧 FIX: Backend Unhealthy - Solución

## ❌ Problema Detectado

```
Target Health: Unhealthy
Reason: Request timed out
```

El ALB no puede alcanzar las tasks de ECS en el puerto 8080.

## ✅ Solución Aplicada

**Cambio en `index.js`:**
```javascript
// ANTES (solo escucha en localhost)
app.listen(port, () => console.log(`API lista en puerto ${port}`));

// DESPUÉS (escucha en todas las interfaces)
app.listen(port, '0.0.0.0', () => console.log(`API lista en puerto ${port} (0.0.0.0)`));
```

**Por qué es necesario:**
- En ECS Fargate, el contenedor necesita escuchar en `0.0.0.0` (todas las interfaces)
- Si solo escucha en `localhost`, el ALB no puede alcanzarlo
- El health check falla con "Request timed out"

## 🚀 Pasos para Aplicar el Fix

### 1. Reconstruir la Imagen Docker

```powershell
cd c:\jfc-ecommerce\tropicales-shop-backend

# Login a ECR
aws ecr get-login-password --region us-east-1 --profile pra_chaptercloudops_lab | docker login --username AWS --password-stdin 840021737375.dkr.ecr.us-east-1.amazonaws.com

# Build
docker build -t jfc-ecommerce-dev-ecr-ecommerce-api:latest .

# Tag
docker tag jfc-ecommerce-dev-ecr-ecommerce-api:latest 840021737375.dkr.ecr.us-east-1.amazonaws.com/jfc-ecommerce-dev-ecr-ecommerce-api:latest

# Push
docker push 840021737375.dkr.ecr.us-east-1.amazonaws.com/jfc-ecommerce-dev-ecr-ecommerce-api:latest
```

### 2. Forzar Redespliegue en ECS

```powershell
# Opción A: Desde AWS CLI
aws ecs update-service `
  --cluster jfc-ecommerce-dev-ecs-api `
  --service jfc-ecommerce-dev-ecs-api-core `
  --force-new-deployment `
  --region us-east-1 `
  --profile pra_chaptercloudops_lab

# Opción B: Desde AWS Console
# 1. Ir a ECS > Clusters > jfc-ecommerce-dev-ecs-api
# 2. Click en el servicio "api-core"
# 3. Click "Update Service"
# 4. Check "Force new deployment"
# 5. Click "Update"
```

### 3. Verificar el Despliegue

```powershell
# Ver el estado del servicio
aws ecs describe-services `
  --cluster jfc-ecommerce-dev-ecs-api `
  --services jfc-ecommerce-dev-ecs-api-core `
  --region us-east-1 `
  --profile pra_chaptercloudops_lab `
  --query 'services[0].{Status:status,Running:runningCount,Desired:desiredCount}'

# Ver los logs de las nuevas tasks
aws logs tail /ecs/jfc-ecommerce-dev-ecs-api-core --follow --region us-east-1 --profile pra_chaptercloudops_lab
```

### 4. Verificar Target Health

```powershell
# Esperar 2-3 minutos y verificar en AWS Console:
# EC2 > Load Balancers > Target Groups > jfc-ecommerce-dev-tg-api
# Debería mostrar: Status = Healthy
```

## 🔍 Verificación Rápida

### Verificar que el contenedor escucha en 0.0.0.0

```powershell
# Conectarse a una task (ECS Exec debe estar habilitado)
aws ecs execute-command `
  --cluster jfc-ecommerce-dev-ecs-api `
  --task <TASK_ID> `
  --container app `
  --interactive `
  --command "/bin/sh" `
  --region us-east-1 `
  --profile pra_chaptercloudops_lab

# Dentro del contenedor:
netstat -tuln | grep 8080
# Debería mostrar: 0.0.0.0:8080 (no 127.0.0.1:8080)
```

### Test manual del health check

```powershell
# Desde tu máquina local (a través de CloudFront)
curl https://d34n3l01pbxebj.cloudfront.net/api/health

# Debería responder: "ok"
```

## 📋 Checklist de Verificación

- [ ] Código actualizado en `index.js` (escucha en 0.0.0.0)
- [ ] Imagen Docker reconstruida
- [ ] Imagen pusheada a ECR
- [ ] Servicio ECS forzado a redesplegar
- [ ] Tasks nuevas están running
- [ ] Target Health = Healthy
- [ ] Health check responde correctamente
- [ ] CloudFront puede alcanzar el backend

## ⏱️ Tiempo Estimado

- Build + Push: 2-3 minutos
- Redespliegue ECS: 3-5 minutos
- Health checks: 1-2 minutos
- **Total: ~10 minutos**

## 🐛 Si Sigue Fallando

### 1. Verificar Security Groups

```powershell
# El SG del ALB debe permitir salida al puerto 8080
# El SG de ECS debe permitir entrada desde el ALB en puerto 8080
```

### 2. Verificar Subnets

```
- Backend tasks: private_backend subnets (10.0.2.0/23, 10.0.4.0/23)
- ALB: public subnets (10.0.0.0/24, 10.0.1.0/24)
- Debe haber conectividad entre ellas
```

### 3. Verificar VPC Endpoints

```
- Las tasks necesitan acceder a:
  - ECR (para pull de imagen)
  - Secrets Manager (para credenciales DB)
  - SSM (para DB_HOST)
  - CloudWatch Logs (para logs)
```

### 4. Verificar Logs de la Task

```powershell
# Ver logs de la task
aws logs tail /ecs/jfc-ecommerce-dev-ecs-api-core --follow --region us-east-1 --profile pra_chaptercloudops_lab

# Buscar:
# ✅ "API lista en puerto 8080 (0.0.0.0)"
# ❌ Errores de conexión a DB
# ❌ Errores de permisos
```

## 📞 Comandos Útiles

```powershell
# Ver tasks running
aws ecs list-tasks --cluster jfc-ecommerce-dev-ecs-api --region us-east-1 --profile pra_chaptercloudops_lab

# Describir una task específica
aws ecs describe-tasks --cluster jfc-ecommerce-dev-ecs-api --tasks <TASK_ARN> --region us-east-1 --profile pra_chaptercloudops_lab

# Ver eventos del servicio
aws ecs describe-services --cluster jfc-ecommerce-dev-ecs-api --services jfc-ecommerce-dev-ecs-api-core --region us-east-1 --profile pra_chaptercloudops_lab --query 'services[0].events[0:5]'
```

## ✅ Resultado Esperado

Después de aplicar el fix:

```
Target Health:
  10.0.3.207:8080 - Healthy
  10.0.5.191:8080 - Healthy

CloudFront:
  https://d34n3l01pbxebj.cloudfront.net/api/health → "ok"
  https://d34n3l01pbxebj.cloudfront.net/api/products → [...]
```
