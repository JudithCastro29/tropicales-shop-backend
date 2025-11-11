# Guía de Troubleshooting – tropicales-shop (entorno dev)

Esta guía resume pasos básicos para diagnosticar problemas comunes en la arquitectura **tropicales-shop (dev)**.

---

## 1. No se puede acceder al frontend

### Síntomas

- El navegador muestra error al entrar a la URL de CloudFront.
- Timeout o error 4xx/5xx desde CloudFront.

### Pasos a revisar

1. **CloudFront**

   - Verificar que la distribución `tropicales-shop-dev-cf-frontend` está en estado `Deployed`.
   - Comprobar que el dominio utilizado corresponde a la distribución correcta.

2. **Origin S3**

   - Revisar que el bucket `tropicales-shop-dev-s3-frontend` contiene el build de Angular (`dist/frontend/browser`).
   - Verificar que el origin configurado en CloudFront apunta a este bucket.
   - Confirmar que el índice (`index.html`) existe en el bucket.

3. **Deploy reciente**
   - Confirmar que se ejecutó el `./deploy-tropicales.sh` correctamente.
   - Asegurar que se ejecutó la invalidación de CloudFront:
     - `aws cloudfront create-invalidation --distribution-id <ID> --paths "/*"`.

---

## 2. El frontend carga, pero las llamadas a la API fallan

### Síntomas

- En la consola del navegador:
  - Errores al llamar a `http://<ALB-DNS>/api/...`.
  - Respuestas 5xx o timeouts.

### Pasos a revisar

1. **DNS / URL base de la API**

   - Verificar que la SPA Angular apunta al **DNS del ALB** correcto.
   - Comprobar que el esquema (http/https) coincide con el configurado en el ALB.

2. **ALB**

   - Revisar el ALB `tropicales-shop-dev-alb`:
     - Listener 80 habilitado.
     - Target Group asociado con targets `healthy`.
   - Verificar el SG `tropicales-shop-dev-alb-sg`:
     - Permite HTTP 80 desde `0.0.0.0/0` (al menos en dev).

3. **ECS Fargate Service**

   - Ir a ECS → cluster `tropicales-shop-dev-ecs-cluster`.
   - Verificar que el service `tropicales-shop-dev-ecs-service-backend` tiene tareas `RUNNING`.
   - Revisar eventos recientes del servicio (errores de despliegue / permisos).

4. **Logs de backend**
   - Ir a CloudWatch Logs → log group `/ecs/tropicales-shop-dev-ecs-td-backend`.
   - Buscar excepciones, errores de conexión a DB, errores de puerto, etc.

---

## 3. La API no puede conectarse a la base de datos

### Síntomas

- Logs del backend muestran errores como:
  - `ECONNREFUSED`, `timeout`, `access denied` al conectar a MySQL.

### Pasos a revisar

1. **Security Group de RDS**

   - Confirmar que el SG `tropicales-shop-dev-rds-sg` permite MySQL 3306 **solo** desde:
     - SG `tropicales-shop-dev-sgr-ecs-app` (backend ECS).
     - (Y SG del bastion, si se usa para administración).

2. **Variables de entorno de ECS**

   - Verificar en la Task Definition `tropicales-shop-dev-ecs-td-backend`:
     - `DB_HOST` apunta al endpoint correcto de `tropicales-shop-dev-rds`:
       - `tropicales-shop-dev-rds.ch2s8smos70f.us-east-2.rds.amazonaws.com`
     - `DB_PORT=3306`.
     - `DB_USER` y `DB_PASS` correctos.
     - `DB_NAME=tienda`.

3. **Prueba desde Bastion**
   - Conectarse por SSH al bastion EC2.
   - Si desde Bastion se conecta:
     - El problema está en ECS (vars de entorno, SG de ECS, etc.).
   - Si desde Bastion **no** se conecta:
     - Revisar SG de RDS y rutas de red.

---

## 4. No puedo acceder al RDS desde DBeaver (túnel SSH)

### Síntomas

- DBeaver no conecta a `127.0.0.1:3307`.

### Pasos a revisar

1. **Conexión SSH al bastion**

   - Verificar que se puede acceder por SSH a la EC2 pública (bastion):
     - Security Group del bastion permite SSH (22) desde tu IP.
     - Se utiliza el key pair correcto.

2. **Configuración del túnel**

   - Confirmar que el túnel está bien configurado:
     - Local: `127.0.0.1:3307`.
     - Remoto: `<endpoint-RDS>:3306`.

   ```bash
   ssh -i ~/.ssh/tropicales-shop-dev \
   -L 3307:<ENDPOINT_RDS>:3306 \
   ec2-user@<IP_PUBLICA_EC2>
   ssh -i ~/.ssh/tropicales-shop-dev \
   -L 3307:tropicales-shop-dev-rds.ch2s8smos70f.us-east-2.rds.amazonaws.com:3306 \
   ec2-user@18.223.237.205
   ```

3. **Configuración en DBeaver**

- Host: `127.0.0.1`.
- Puerto: `3307`.
- Usuario: `dev_user`.
- Base de datos: `tienda`.

4. **Security Group de RDS**

- Debe permitir MySQL 3306 **desde el SG del bastion**.

---

## 5. Alarmas de CloudWatch / correos de SNS

### Síntomas

- Llegan correos desde el topic SNS `tropicales-shop-dev-sns-alerts`.
- Alarmas en estado `ALARM` en CloudWatch.

### Pasos a revisar

1. **Identificar la alarma**

- Ir a CloudWatch → Alarms.
- Ver qué alarma se disparó:
  - `tropicales-shop-dev-ecs-cpu-high`.
  - `tropicales-shop-dev-alb-5xx-errors`.
  - `tropicales-shop-dev-rds-low-storage`

2. **Analizar causa**

- Si es CPU alta ECS:
  - Revisar logs en `/ecs/tropicales-shop-dev-ecs-td-backend`.
  - Ver si hay loops, carga inesperada, pocos recursos asignados.
- Si son errores 5xx ALB:
  - Examinar logs de backend y health checks.
  - Revisar si la app lanza excepciones o si hay problemas de conexión a RDS (RDS puede estar detenida temporalmente).

3. **Acción correctiva**

- Ajustar recursos (CPU/memoria).
- Revisar límites de auto scaling.
- Corregir bugs en el backend si aplican.
- Inciar RDS.

---

## 6. No se levantan tasks Fargate

### Síntomas

- Revisar service, verificando que `desired = 1`.
- Service ECS `tropicales-shop-dev-ecs-service-backend` con `desired = 1`, pero `running = 0`.
- Eventos muestran errores.

### Pasos a revisar

1. **Eventos del servicio ECS**

- Ver mensajes como:
  - Falta de permisos en task execution role.
  - Problemas al descargar imagen de ECR.
  - Subnets o SG mal referenciados.

2. **Task Execution Role**

- Confirmar que `tropicales-shop-dev-ecs-task-exec-role` tiene:
  - `AmazonECSTaskExecutionRolePolicy`.

3. **Acceso a ECR**

- Verificar que la imagen `tropicales-shop-dev-ecr-backend:dev` existe en ECR.
- Revisar si la región coincide entre ECS y ECR.

4. **Subnets y SG**

- Service en subnets privadas válidas.
- SG `tropicales-shop-dev-sgr-ecs-app` aplicado correctamente.

---

Esta guía cubre los problemas más comunes en el entorno **dev** de tropicales-shop.

```
