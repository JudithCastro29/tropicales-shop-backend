# Arquitectura – tropicales-shop (entorno dev)

## 1. Descripción general del proyecto

El proyecto tropicales-shop implementa una arquitectura web de tres capas en AWS para una tienda online simple:

- **Frontend**: SPA en Angular servida desde **Amazon S3** detrás de **Amazon CloudFront** (HTTPS).
- **Backend**: API REST en **Node.js/Express**, ejecutándose en **ECS Fargate** detrás de un Application Load Balancer (ALB).
- **Base de datos**: **Amazon RDS MySQL** en subred privada.

El objetivo principal del reto es demostrar:

- Diseño de red seguro (**VPC, subnets, Security Groups**).
- Despliegue de compute en **EC2** y posterior migración a contenedores (**ECS Fargate**).
- Uso de servicios gestionados (**RDS, CloudFront, ECS, ECR**).
- Monitoreo, alarmas y buenas prácticas de **seguridad / IAM**.

---

## 2. Arquitectura general

### 2.1 Diagrama lógico

![Diagrama básico de arquitectura](../docs/diagrams/tropicales-shop-dev-arch.png)

#### Capa de presentación

- Flujo principal: **Usuario → Internet → CloudFront → S3 (frontend Angular)**.
- El frontend es una SPA que consume la API vía: `http://tropicales-shop-dev-alb-2003296475.us-east-2.elb.amazonaws.com/api/...`

#### Capa de aplicación

- **Application Load Balancer (ALB)** público en subredes públicas.
- **ECS Fargate Service**:
  - Imagen almacenada en **ECR**.
  - API Node.js/Express exponiendo endpoints como:
    - `/health`
    - `/api/products`
    - `/api/orders`

#### Capa de datos

- **RDS MySQL** en subredes privadas.
- El Security Group de RDS **solo permite tráfico** desde el SG de la capa app (ECS).

#### Acceso de administración

- **EC2 pública (bastion)** en subred pública:

  - Acceso SSH desde IP personal.
  - Usada para túnel SSH hacia RDS y pruebas internas.

- **Túnel SSH**:
  - `localhost:3307 → RDS:3306`
  - El cliente local (DBeaver) se conecta a `127.0.0.1:3307`.

---

## 3. Red y seguridad

### 3.1 VPC y subredes

- **VPC**: `tropicales-shop-dev-vpc`.
- **Subredes públicas**:
  - Alojan el **ALB** y la **EC2 bastion**.
- **Subredes privadas**:
  - Alojan **ECS Fargate** (backend).
  - Alojan **RDS MySQL** (base de datos).
- **Internet Gateway**:
  - Asociado a la VPC para tráfico de Internet desde/hacia subnets públicas.
- **Route Tables**:
  - **Públicas**: envía todo el tráfico de salida (0.0.0.0/0) hacia el Internet Gateway (IGW), permitiendo acceso a internet a las subnets asociadas.
  - **Privadas**: ruta 10.0.0.0/16 local, sin 0.0.0.0/0, usada por las subnets privadas sin acceso directo a internet.

### 3.2 Security Groups

- **ALB – `tropicales-shop-dev-sg-alb`**

  - **Inbound**:
    - HTTP (TCP 80) desde `0.0.0.0/0`.
      - Cualquier cliente de Internet puede acceder al ALB por HTTP.
  - **Outbound**:
    - `All traffic` hacia `0.0.0.0/0`.
      - Permite al ALB reenviar tráfico hacia los targets (ECS/EC2 backend) según el Target Group.

- **App ECS – `tropicales-shop-dev-sgr-ecs-app`**

  - **Inbound**:
    - Custom TCP **8080** solo desde el SG del ALB (`tropicales-shop-dev-sg-alb`).
      - Las tareas ECS **no son accesibles directamente desde Internet**, solo a través del ALB.
  - **Outbound**:
    - `All traffic` hacia `0.0.0.0/0`.
      - Permite tráfico saliente hacia RDS (según reglas del SG de RDS), ECR, CloudWatch Logs/Metrics y otros servicios de AWS que necesite la app.

- **App EC2 – `tropicales-shop-dev-ecs-sg`**

  - **Inbound**:
    - Custom TCP **8080** desde `tropicales-shop-dev-sg-alb`.
      - El backend EC2 solo recibe tráfico de aplicación desde el ALB.
    - SSH (TCP 22) desde `191.97.15.107/32`.
      - Acceso administrativo controlado desde una IP concreta (para administración/bastion).
  - **Outbound**:
    - `All traffic` hacia `0.0.0.0/0`.
      - Permite conexiones salientes hacia RDS y otros servicios externos/AWS.

- **RDS – `tropicales-shop-dev-sg-rds`**
  - **Inbound**:
    - TCP **3306 (MySQL)** solo desde los SG autorizados (por ejemplo `tropicales-shop-dev-sgr-ecs-app` y/o `tropicales-shop-dev-ecs-sg`, y opcionalmente el SG de bastion si aplica).
      - La base de datos solo acepta conexiones desde la capa de aplicación / bastion autorizados.
  - **Outbound**:
    - `All traffic` (por defecto) hacia `0.0.0.0/0`.
      - Permite conexiones salientes si fueran necesarias (parches, telemetría, etc.).
  - **Acceso directo desde Internet**:
    - **No permitido** (no hay reglas desde `0.0.0.0/0` ni asociación con un ALB público).

### 3.3 Patrón de acceso a base de datos

- **RDS no es público**
- Acceso de desarrollo:
  - EC2 pública como **bastion**.
  - Túnel SSH hacia RDS.
  - Usuario limitado `dev_user` con permisos sobre `tienda.*` (base de datos).

**Justificación:**

- Mantener RDS aislada en subred privada.
- Accesos de administración controlados por **SSH + IAM + key pair**.

---

## 4. Backend / Compute

### 4.1 Evolución EC2 → Fargate

#### Fase inicial (EC2)

- Backend Node.js desplegado en **EC2**:
  - SO: **Amazon Linux 2023**.
  - Código en: `/opt/tropicales-shop/app`.
  - Proceso gestionado con **pm2** escuchando en puerto 8080.
  - El ALB apuntaba a esta instancia mediante un **Target Group tipo instance**.

#### Fase final (ECS Fargate)

- El backend se **dockeriza** y se migra a **ECS Fargate**:
  - La EC2 queda solo como **bastion / host de administración**.
  - El ALB ahora apunta a un **Target Group IP** donde se registran las tasks Fargate.

> Historia de evolución:
> “La capa de aplicación evolucionó de un servidor EC2 tradicional a una solución basada en contenedores con ECS Fargate, manteniendo la misma VPC, ALB y RDS.”

### 4.2 Contenedores y ECR

**Dockerfile backend (resumen):**

- Base: `node:20-alpine`.
- `WORKDIR /opt/tropicales-shop/app`.
- `COPY package*.json` + `npm ci --only=production`.
- `COPY . .`
- `EXPOSE 8080`
- `CMD ["node", "index.js"]`

**Amazon ECR:**

- Repositorio: `tropicales-shop-dev-ecr-backend`.
- Tag de imagen: `:dev`.

**Uso de EC2 en el flujo de build:**

- La EC2 se usó para:
  - Construir la imagen Docker.
  - Autenticarse en ECR (`aws ecr get-login-password`).
  - Pushear la imagen al repositorio ECR.

### 4.3 ECS Fargate

**Cluster**

- `tropicales-shop-dev-ecs-cluster` (solo Fargate).

**Task Definition**

- Nombre: `tropicales-shop-dev-ecs-td-backend`.
- Launch type: `FARGATE`.
- CPU / Memoria: `0.5 vCPU / 1 GB`.
- Network mode: `awsvpc`.

**Contenedor**

- Nombre: `tropicales-shop-backend`.
- Imagen: `.../tropicales-shop-dev-ecr-backend:dev` (ECR).
- Puerto contenedor: `8080`.
- Variables de entorno típicas:
  - `PORT=8080`
  - `DB_HOST`
  - `DB_PORT`
  - `DB_USER`
  - `DB_PASS`
  - `DB_NAME`
- Logs:
  - Driver `awslogs` a log group:
    - `/ecs/tropicales-shop-dev-ecs-td-backend`.

**Service ECS**

- Nombre: `tropicales-shop-dev-ecs-service-backend`.
- Tipo: Fargate, `awsvpc`.
- Subnets: privadas.
- SG: `tropicales-shop-dev-sgr-ecs-app`.
- Integrado con ALB mediante **Target Group IP**.
- Health check: endpoint `/health`.

**Auto Scaling del Service**

- Policy: `tropicales-shop-dev-ecs-cpu-scaling`.
- Tipo: **Target Tracking**.
- Métrica: `ECSServiceAverageCPUUtilization`.
- Target: `70%`.

Valores de capacidad (modo demo / ahorro):

- `min = 0`
- `desired = 0` cuando no se está presentando para minimizar costos.
- Para demo/presentación: se ajusta `desired = 1`.

---

## 5. Base de datos – RDS MySQL

- Instancia: `tropicales-shop-dev-rds`.
- Engine: **MySQL 8.0.42**.
- Clase: `db.t4g.micro`.
- Subnet group privado: `tropicales-shop-dev-db-subnet-group`.

### 5.1 Esquema `tienda`

El esquema `tienda` modela una tienda en línea sencilla que permite gestionar productos, clientes y órdenes de compra.

![Diagrama base de datos](../docs/diagrams/db-diagram-tienda.png)

- **Tabla `products`**  
  Contiene el catálogo de productos disponibles en la tienda.

  - `id`: identificador único del producto.
  - `name`: nombre del producto.
  - `price`: precio unitario.
  - `image_key`: ruta o clave de la imagen del producto (por ejemplo, en un bucket de almacenamiento).
  - `category`: categoría del producto (por ejemplo: _Sustrato_, _Fertilizante_, _Macetas_, _Herramientas_).

- **Tabla `customers`**  
  Almacena los datos de los clientes.

  - Datos principales: nombre, correo electrónico, dirección y teléfono.
  - Se utiliza para asociar cada orden a un cliente específico.

- **Tabla `orders`**  
  Representa el encabezado de cada orden de compra.

  - Referencia a un cliente (`customer_id`).
  - Estado de la orden (por ejemplo: `PENDING`, `PAID`, `CANCELLED`).
  - Montos de la orden: `subtotal`, `tax`, `total`.
  - Fecha de creación de la orden.

- **Tabla `order_items`**  
  Contiene el detalle de los productos incluidos en cada orden.
  - Referencia a la orden (`order_id`) y al producto (`product_id`).
  - Nombre del producto en el momento de la compra.
  - Precio unitario, cantidad y total por línea.

Estas tablas soportan el flujo básico de órdenes de compra: un cliente (`customers`) realiza una orden (`orders`) que contiene uno o varios productos (`products`), registrados en el detalle de la orden (`order_items`).

### 5.2 Conexión desde backend

Variables `.env`:

```env
DB_HOST=tropicales-shop-dev-rds.ch2s8smos70f.us-east-2.rds.amazonaws.com
DB_PORT=3306
DB_USER=admin
DB_PASS=********
DB_NAME=tienda
```

### 5.3 Backups y snapshots

- **Automated backups**:
  - Habilitados.
  - Retention: 7 días.
- **Manual snapshot**:
  - `tropicales-shop-dev-rds-snap-YYYYMMDD`.
  - Uso: backup puntual antes de cambios importantes y como evidencia del reto.
  - Se tiene un snapshot inicial que contiene datos de prueba `tropicales-shop-dev-rds-initial`

> **Justificación**:
> “Con automated backups y al menos un snapshot manual, puedo hacer point-in-time recovery de la base de datos dev y tengo un respaldo explícito antes de cambios.”

---

## 6. Frontend – S3 + CloudFront

### 6.1 S3

- **Bucket**: `tropicales-shop-dev-s3-frontend`.
- **Uso**:
  - Hosting de la app Angular (`dist/frontend/browser`).
  - También aloja las imágenes de productos en `assets/products/....`
- **Nota**: En un entorno productivo se podría separar:
  - Un bucket para frontend.
  - Un bucket para imágenes de productos con subida automática (implementando en la app un módulo para creación de productos).
    En dev se mantienen juntos por simplicidad y costo mínimo.

### 6.2 CloudFront

- **Distribución**: `tropicales-shop-dev-cf-frontend`.
- **Origin**: bucket S3 frontend.
- **Comportamiento por defecto**:
  - Sirve la SPA Angular.
  - HTTPS habilitado (certificado de Amazon por defecto).
- **Flujo de deploy frontend (CLI)**:

```bash
ng build --configuration production
./deploy-tropicales.sh
```

## 7. Seguridad: IAM y acceso

### 7.1 IAM Roles principales

- **Roles de IAM Identity Center**
  - **`AWSReservedSSO_tropicales-shop-Ps-admin_*`**: Permiso: **AdministratorAccess**. Uso: administración total de la cuenta (solo para _owner_).
  - **`AWSReservedSSO_tropicales-shop-Ps-devs_*`**: Permiso: **AIOpsReadOnlyAccess**. Uso: perfiles de desarrollador / observador (lectura de recursos, sin cambios).
- **EC2 Instance Role**
  - **Nombre**: `tropicales-shop-dev-app-ec2-role`.
  - **Entidad de confianza**: `ec2.amazonaws.com`.
  - **Políticas (ejemplo)**: `AmazonEC2ContainerRegistryPowerUser` → pull/push a ECR.
  - **Beneficio**: La instancia EC2 se autentica contra ECR sin guardar _access keys_ en disco.
- **ECS Task Execution Role**
  - **Nombre**: `tropicales-shop-dev-ecs-task-exec-role`.
  - **Entidad de confianza**: `ecs-tasks.amazonaws.com`.
  - **Política**: `AmazonECSTaskExecutionRolePolicy`.
  - **Uso**:
    - Descargar imágenes desde ECR.
    - Enviar logs a CloudWatch Logs.
    - Evitar credenciales dentro del contenedor.

### 7.2 Usuarios IAM y MFA

- **Cuenta root**: **MFA habilitado**. No se usa para trabajo diario.
- **Acceso operativo**: A través de **IAM Identity Center** con grupos:
  - `tropicales-shop-developers`.
  - `tropicales-shop-administrators`.

---

## 8. Monitoreo y alertas

### 8.1 CloudWatch Dashboards

- **Dashboard**: `tropicales-shop-dev-dashboard`.
- **Widgets principales**:
  - **`CPUUtilization`** – ECS Service Backend.
  - **`HTTPCode_Target_5XX_Count`** + **`RequestCount`** – Target Group del ALB.
  - **`FreeStorageSpace`** – RDS MySQL.
- **Propósito**:
  - Ver comportamiento del backend bajo carga.
  - Detectar errores 5xx en la capa de aplicación.
  - Monitorear espacio disponible en RDS.

### 8.2 Alarmas CloudWatch + SNS

- **Topic SNS**: `tropicales-shop-dev-sns-alerts`.
- **Suscripción**: correo `judithcastro063@gmail.com`.
- **Alarmas configuradas**:
  - **`tropicales-shop-dev-ecs-cpu-high`**
    - Métrica: `ECSServiceAverageCPUUtilization`.
    - Condición: $\ge$ **70%** durante 5 minutos.
    - Acción: notificación al topic SNS. (La misma métrica se usa en la política de Auto Scaling del servicio ECS).
  - **`tropicales-shop-dev-alb-5xx-errors`**
    - Métrica: `HTTPCode_ELB_5XX_Count` del ALB.
    - Condición: $\ge$ **1** en una ventana de 5 minutos.
    - Acción: notificación al topic SNS.
- **Uso**: Detectar errores de infraestructura y aplicación, y dar visibilidad temprana sobre problemas en backend o RDS.
