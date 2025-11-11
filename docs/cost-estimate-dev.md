# Estimación de costos – tropicales-shop (entorno dev)

> **Disclaimer:** Estos son valores de ejemplo aproximados para un entorno de desarrollo pequeño.  
> Los costos reales dependen de la región, tamaño de instancias, horas de uso, tráfico real, etc.

---

## 1. Supuestos generales

- Región: `us-east-1`.
- Entorno dev activo ~**100 horas/mes** (apagando recursos fuera del horario de trabajo).
- Tráfico bajo (uso de laboratorio / demo interna).
- Tamaños pequeños (t3.micro, db.t3.micro, pocas tareas Fargate).

---

## 2. Networking

- **VPC + subnets + route tables + IGW**: sin costo directo.
- **NAT Gateway**:
  - 1 NAT Gateway para dev.
  - ~100 horas/mes → costo aproximado: **~3–5 USD/mes** (ejemplo, muy reducido).

*(Si mantienes NAT encendido 24/7, el costo sube bastante más, en la realidad ronda decenas de USD/mes.)*

---

## 3. Compute

### 3.1 ECS Fargate

Supongamos:

- 1 tarea Fargate (`0.25 vCPU`, `0.5–1 GB RAM`).
- Activa ~100 horas/mes.

Costo aproximado:

- vCPU + memoria: **~2–5 USD/mes** en dev (muy orientativo).

### 3.2 Bastion EC2

- Tipo: `t3.micro`.
- ~100 horas/mes.
- Costo aproximado: **~1–3 USD/mes**.

*(Si la instancia permanece 24/7 el costo aumenta.)*

---

## 4. Almacenamiento y base de datos

### 4.1 RDS MySQL

- Clase: `db.t3.micro`.
- Almacenamiento: 20 GB aprox.
- Uso continuo (DB suele estar encendida 24/7).

Costo aproximado:

- Instancia + almacenamiento: **~15–25 USD/mes** (dev pequeño).

### 4.2 S3 (frontend + assets)

- Almacenamiento: muy bajo (ej. < 1 GB).
- Requests: bajos (uso interno / demo).

Costo aproximado:

- **< 1 USD/mes**.

---

## 5. CloudFront

- Tráfico muy bajo (demos internas).
- Datos transferidos menores a unos pocos GB/mes.

Costo aproximado:

- **1–3 USD/mes** en dev (muy orientativo).

---

## 6. CloudWatch + SNS

### 6.1 CloudWatch Logs y métricas

- Logs de ECS + métricas de ALB y RDS.
- Retención corta (ej. 7–14 días).

Costo aproximado:

- **1–5 USD/mes**, según cantidad de logs.

### 6.2 SNS

- Notificaciones por email muy pocas.
- Uso típico de laboratorio → costo prácticamente **cero** o centavos.

---

## 7. Costos totales aproximados (dev pequeño)

Sumando los componentes (solo como orden de magnitud):

- NAT Gateway: ~3–5 USD
- ECS Fargate: ~2–5 USD
- Bastion EC2: ~1–3 USD
- RDS MySQL: ~15–25 USD
- S3 + CloudFront: ~2–4 USD
- CloudWatch + SNS: ~1–5 USD

**Total estimado dev:**  
Entre **~25 y ~45 USD/mes** (muy aproximado, solo como referencia).

> En la presentación del Reto, más que el número exacto, lo importante es que muestres:
> - Qué servicios consumen más.
> - Qué podrías apagar fuera de horario para ahorrar.
> - Qué cambiarías al pasar a prod (tamaños, Multi-AZ, backup, etc.).

---

## 8. Optimización y próximos pasos

- Apagar EC2 Bastion fuera de horario laboral.
- Reducir horas de ejecución de tareas ECS en dev cuando no se usen.
- Ajustar retención de logs en CloudWatch.
- Evaluar si realmente necesitas NAT Gateway siempre activo en dev.
