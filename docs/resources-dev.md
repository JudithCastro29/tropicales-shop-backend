# Lista de recursos – tropicales-shop (entorno dev)

Este documento lista los recursos principales creados en AWS para el entorno **dev** del proyecto **tropicales-shop**.

---

## 1. Red (Networking)ecs

### 1.1 VPC

- **Nombre**: `tropicales-shop-dev-vpc`
- **CIDR**: `10.0.0.0/16`
- **AZs utilizadas**: `use2-az1 (us-east-2a)`, `use2-az2 (us-east-2b)`

### 1.2 Subnets

- **Subnets públicas**

  - `tropicales-shop-dev-public-a` ( `10.0.1.0/24`, AZ `us-east-2a`)
  - `tropicales-shop-dev-public-b` ( `10.0.2.0/24`, AZ `us-east-2b`)

- **Subnets privadas (App + DB)**
  - `tropicales-shop-dev-private-a` ( `10.0.3.0/24`, AZ `us-east-2a`)
  - `tropicales-shop-dev-private-b` ( `10.0.4.0/24`, AZ `us-east-2b`)

### 1.3 Gateways y Route Tables

- **Internet Gateway**

  - `tropicales-shop-dev-igw` asociado a la VPC.

- **Route Tables**
  - `tropicales-shop-dev-public-rt` → tabla de ruteo pública que envía todo el tráfico de salida (0.0.0.0/0) hacia el Internet Gateway (IGW), permitiendo acceso a internet a las subnets asociadas.
  - `tropicales-shop-dev-private-rt` → solo ruta 10.0.0.0/16 local, sin 0.0.0.0/0, usada por las subnets privadas sin acceso directo a internet.

---

## 2. Capa de presentación

### 2.1 Amazon CloudFront

- **Distribución**

  - Nombre lógico: `tropicales-shop-dev-cf-frontend`.
  - Domain: `https://d25ywqiyuq14r9.cloudfront.net`.
  - Función principal: punto de entrada único para el frontend Angular y las llamadas a la API.

- **Origins configurados**

  1. **Origin S3 – Frontend**
     - `tropicales-shop-dev-s3-frontend.s3.us-east-2.amazonaws.com`
     - Uso: servir la aplicación Angular estática (`index.html`, JS, CSS, assets).
  2. **Origin ALB – Backend**
     - `tropicales-shop-dev-alb-2003296475.us-east-2.elb.amazonaws.com`
     - Uso: servir el backend Node.js/Express desplegado en ECS Fargate (rutas `/health`, `/api/products`, `/api/orders`, etc.).

- **Behaviors (comportamientos)**

  - **Default behavior**
    - Path pattern: `*`
    - Origin: S3 (`tropicales-shop-dev-s3-frontend`)
    - Sirve la SPA de Angular.
  - **Behavior para API** (concepto)
    - Path pattern: `/api/*`
    - Origin: ALB
    - Permite que las llamadas a `https://d25ywqiyuq14r9.cloudfront.net/api/...` se enruten al backend.

- **Política de protocolo**

  - Acceso al usuario final siempre por **HTTPS** usando el dominio de CloudFront.
  - CloudFront se encarga de terminar TLS y luego comunicarse con los orígenes (S3 y ALB) usando HTTP interno.
  - De esta forma, el tráfico entre el cliente y CloudFront va cifrado, incluso en este entorno dev.

- **Ventajas**
  - Único endpoint público para la aplicación (`https://d25ywqiyuq14r9.cloudfront.net`).
  - Cacheo del contenido estático en edge locations (mejor latencia).
  - Posibilidad futura de aplicar WAF, reglas de seguridad y optimizaciones directamente en CloudFront.

### 2.2 Amazon S3 – Frontend

- **Bucket**
  - `tropicales-shop-dev-s3-frontend`.
- **Uso**
  - Almacena el build estático de Angular (`index.html`, JS, CSS, assets).

---

## 3. Compute y aplicación

### 3.1 Application Load Balancer

- **Nombre**: `tropicales-shop-dev-alb`
- **Tipo**: Application Load Balancer
- **Subnets**: subnets públicas A y B.
- **Listeners**:
  - HTTP 80 → target group del backend.
- **Target Group**:
  - Nombre: `tropicales-shop-dev-tg-ecs-back`
  - Tipo: IP (para Fargate).
  - Puerto: 80.

### 3.2 ECS Cluster y Servicio

- **Cluster ECS**

  - Nombre: `tropicales-shop-dev-ecs-cluster`.
  - Tipo: Solo Fargate (no usa instancias EC2 administradas).
  - Uso: ejecutar el backend Node.js/Express del proyecto tropicales-shop en modo serverless.

- **Service ECS**

  - Nombre: `tropicales-shop-dev-ecs-service-backend`.
  - Launch type: **FARGATE** con modo de red `awsvpc`.
  - Subnets: **subnets públicas** de la VPC `tropicales-shop-dev-vpc` (una por AZ para alta disponibilidad).
  - Security Group asociado: `tropicales-shop-dev-sgr-ecs-app`
  - Desired tasks:
    - En modo demo: `1` tarea (para tener la app siempre disponible).
    - En modo ahorro de costos: `0` tareas (cuando no se está usando el entorno dev).
  - Auto Scaling:
    - Service Auto Scaling configurado con una política de **target tracking** sobre CPU (≈70 %), permitiendo escalar hasta 2 tareas si la carga lo requiere.

- **Task Definition (Definición de tarea)**
  - Nombre: `tropicales-shop-dev-ecs-td-backend`.
  - Launch type: Fargate.
  - CPU / Memoria:
    - `0.5 vCPU`
    - `1 GiB` de memoria.
  - Network mode: `awsvpc`.
  - **Contenedor principal**
    - Nombre: `tropicales-shop-backend`.
    - Imagen:
      - `341098451732.dkr.ecr.us-east-2.amazonaws.com/tropicales-shop-dev-ecr-backend:dev`
      - Imagen construida a partir del Dockerfile del backend Node.js.
    - Puerto del contenedor:
      - `8080` (expone la API y la ruta `/health`).
    - Variables de entorno:
      - `PORT=8080`
      - `DB_HOST=<endpoint de RDS>`
      - `DB_PORT=3306`
      - `DB_USER=admin`
      - `DB_PASS=********`
      - `DB_NAME=tienda`
  - **Task execution role**
    - Nombre: `tropicales-shop-dev-ecs-task-exec-role`..
    - Política asociada: `AmazonECSTaskExecutionRolePolicy`.
    - Permisos principales:
      - Descargar la imagen desde ECR.
      - Enviar logs del contenedor a CloudWatch Logs.
    - No se usan access keys estáticas dentro del contenedor; la autenticación a servicios AWS se hace vía este rol, siguiendo el principio de menor privilegio.

### 3.3 Amazon ECR

- **Repositorio**
  - `tropicales-shop-dev-ecr-backend`.
- **Uso**
  - Almacena la imagen Docker del backend Node.js/Express.

---

## 4. Base de datos

### 4.1 Amazon RDS MySQL

- **Instancia**

  - Nombre: `tropicales-shop-dev-rds`.
  - Engine: MySQL.
  - Clase de instancia: `db.t4g.micro` para dev.

- **Acceso**

  - Subnets: privadas.
  - Security Group: `tropicales-shop-dev-rds-sg`.
  - Puerto: 3306.

- **Esquema**
  - Base de datos: `tienda`.
  - Tablas:
    - `products`
    - `customers`
    - `orders`
    - `order_items`

---

## 5. Administración y acceso

### 5.1 Bastion Host (EC2)

- **Instancia**

  - Nombre: `tropicales-shop-dev-app-ec2`.
  - Sistema operativo: Amazon Linux 2023.
  - Tipo de instancia: `t3.micro` (uso de baja capacidad para entorno dev).
  - Subnet: pública (dentro de `tropicales-shop-dev-vpc`).
  - Security Group: `tropicales-shop-dev-sg-bastion`.
  - Acceso:
    - SSH permitido solo desde IPs de administración (mi IP pública).
    - Sin puertos abiertos al público para aplicaciones (no sirve tráfico web).

- **Rol IAM asociado**

  - Instance role: `tropicales-shop-dev-app-ec2-role`.
  - Uso:
    - Permite que la instancia hable con ECR (pull/push de imágenes).
    - Evita usar access keys en archivos dentro del servidor.

- **Uso actual (bastion / administración)**

  - La instancia se utiliza únicamente como:
    - **Bastion host** para entrar por SSH a la VPC.
    - Punto de salto para acceso a la base de datos RDS mediante túnel SSH.
  - Ejemplo de túnel SSH:
    ```bash
    ssh -i ~/.ssh/tropicales-shop-dev \
      -L 3307:tropicales-shop-dev-rds.ch2s8smos70f.us-east-2.rds.amazonaws.com:3306 \
      ec2-user@<IP_PUBLICA_EC2>
    ```
    - DBeaver se conecta a `127.0.0.1:3307` como si la base estuviera local.

- **Relación con el Auto Scaling Group original**
  - Al inicio del proyecto, esta instancia formaba parte de la capa de aplicación y estaba asociada al Auto Scaling Group:
    - `tropicales-shop-dev-app-asg` (1–2 instancias corriendo el backend sobre EC2).
  - Después de migrar el backend a ECS Fargate, el ASG se dejó con capacidad:
    - `min = 0`, `desired = 0`, `max = 0`
  - Desde ese momento, la EC2 se usa solo como bastion/administración, y **no** como servidor de aplicación.

---

## 6. Seguridad (IAM / Security Groups)

### 6.1 IAM Identity Center

- **Grupos**
  - `tropicales-shop-developers` (solo lectura).
  - `tropicales-shop-administrators` (admin/ops).

### 6.2 IAM Roles

- `tropicales-shop-dev-app-ec2-role` (EC2 Bastion).
- `tropicales-shop-dev-ecs-task-exec-role` (ECS Task Execution).

### 6.3 Security Groups

- `tropicales-shop-dev-sg-alb`

  -**Descripción:** Grupo de seguridad para el **ALB público** de `tropicales-shop` (recibe HTTP desde Internet y envía tráfico al backend ECS).

  - **Inbound**
    - Permite tráfico **HTTP (TCP 80)** desde `0.0.0.0/0`.
      - Comentario: cualquier usuario de Internet puede entrar por HTTP al ALB.
  - **Outbound**
    - Permite **todo el tráfico saliente** (`All traffic`, `All`, `0.0.0.0/0`), lo que permite al ALB reenviar tráfico hacia las instancias/servicios de backend (ECS) y otros destinos según la configuración del Target Group.

- `tropicales-shop-dev-sg-rds`

  - Grupo de seguridad asociado a la **base de datos RDS MySQL** del proyecto `tropicales-shop` en entorno **dev**.
    Su objetivo principal es:

  - Permitir únicamente conexiones entrantes al puerto **3306 (MySQL)** desde los security groups autorizados (ECS/EC2).
  - Restringir el acceso directo desde Internet a la base de datos.
  - Permitir que la base de datos pueda iniciar conexiones salientes hacia Internet si es necesario (por ejemplo, para parches o conexiones externas).

- `tropicales-shop-dev-sgr-ecs-app`

  - **Descripción:** Security group para tareas **ECS Fargate** de la capa de aplicación (backend) de `tropicales-shop-dev`.
  - **Inbound**
    - Custom TCP **8080** desde `tropicales-shop-dev-alb-sg` (`sg-0e71ce3f132ddca2e`).
      - Solo el ALB puede enviar tráfico HTTP de aplicación hacia las tareas ECS.
  - **Outbound**

    - **All traffic**, todos los puertos, hacia `0.0.0.0/0`.

      - Permite que las tareas ECS salgan a:

        - RDS (puerto 3306) según las reglas del SG de RDS.

- `tropicales-shop-dev-ecs-sg`

  - **Descripción:** Grupo de seguridad para las tareas EC2 (backend Node.js) de `tropicales-shop-dev`.
    Acepta tráfico HTTP 8080 solo desde el ALB y se puede conectar a RDS MySQL.
  - **Inbound**
    - Custom TCP **8080** desde `tropicales-shop-dev-alb-sg` (`sg-0e71ce3f132ddca2e`).
      - Las tareas ECS/EC2 **no son accesibles directamente desde Internet**, solo a través del ALB.
    - SSH (**TCP 22**) desde `191.97.15.107/32`.
      - Permite acceso administrativo directo desde una IP de administración concreta (para conectarse a la bd or bastion).
  - **Outbound**
    - 1 regla (por defecto suele ser **All traffic** hacia `0.0.0.0/0`).
      - Permite salidas hacia RDS MySQL y otros servicios externos según se requiera.


---

## 7. Observabilidad

### 7.1 CloudWatch

- **Dashboards**

  - `tropicales-shop-dev-dashboard`.

- **Log groups**

  - `tropicales-shop-dev-cw-log-group-backend`

- **Alarmas**
  - CPU alta en ECS.
  - 5xx elevados en ALB.
  - FreeStorageSpace bajo en RDS.

### 7.2 SNS

- **Topic**
  - `tropicales-shop-dev-sns-alerts`.
- **Suscripciones**
  - Emails de operadores CloudOps / Trainees.
