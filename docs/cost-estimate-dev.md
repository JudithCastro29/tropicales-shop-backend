# Informe de estimación de costos – Entorno de desarrollo “tropicales-shop”

## 1. Introducción

El presente documento resume la estimación de costos mensuales del entorno de desarrollo **“tropicales-shop”** en AWS, tomando como base la configuración utilizada en la **AWS Pricing Calculator**.

El objetivo es cuantificar el costo aproximado de los recursos del entorno dev, considerando:

- La capa de red (**Amazon VPC**).
- La base de datos gestionada (**Amazon RDS**).
- Una instancia **Amazon EC2** utilizada como **bastion** para acceso de desarrolladores.

---

## 2. Alcance de la estimación

La estimación **incluye**:

- **Amazon VPC**: recursos de red básicos y uso de una dirección IPv4 pública.
- **Amazon RDS (dev)**: costo de cómputo de la base de datos MySQL en entorno de desarrollo.
- **Amazon EC2 bastion**: instancia utilizada únicamente como puente de acceso a la base de datos desde los equipos de los desarrolladores.

La estimación **no contempla** otros servicios que puedan existir en la arquitectura, tales como:

- Amazon ECS / Fargate
- Amazon S3
- Amazon CloudFront
- Amazon CloudWatch, Amazon SNS
- Otros servicios complementarios

---

## 3. Configuración general

- **Región:** `US East (Ohio)`
- **Entorno:** Desarrollo (dev)
- **Tráfico de datos (estimado en calculadora):**
  - DT Inbound: 0 TB/mes
  - DT Outbound: 0 TB/mes
  - DT Intra-Region: 0 TB/mes

---

## 4. Amazon VPC

### 4.1 Descripción

La VPC proporciona la red base para el entorno de desarrollo, incluyendo subredes, tablas de ruteo y el uso de al menos una dirección IPv4 pública asociada a los recursos.

En la calculadora se ha modelado sin tráfico significativo y sin componentes adicionales como NAT Gateway.

### 4.2 Configuración considerada

- Uso de 1 dirección IPv4 pública.
- Sin NAT Gateway configurado.
- Tráfico de datos (entrada/salida/intra-región) estimado en 0 TB/mes.

### 4.3 Costo estimado

- **Costo inicial:** `0,00 USD`
- **Costo mensual:** **`3,65 USD`**

Este valor corresponde al costo de los recursos de red mínimos y la IP pública asociada en la región `US East (Ohio)`.

---

## 5. Amazon RDS (entorno dev)

### 5.1 Descripción

La capa de base de datos se ejecuta sobre **Amazon RDS MySQL**, orientada a un uso de desarrollo con bajo consumo de recursos.  
En la calculadora, el costo de cómputo se ha modelado mediante una configuración equivalente a una instancia `t3.micro` con plan de ahorro, lo que reduce el costo mensual.

### 5.2 Configuración de cómputo (modelo de costo)

Configuración utilizada en la AWS Pricing Calculator (vista como “Advance EC2 instance” para modelar el cómputo de RDS):

- **Región:** US East (Ohio)
- **Tenancy:** Shared Instances
- **Operating system:** Linux
- **Workload:** Consistent
- **Number of instances:** 1
- **Advance EC2 instance:** `t3.micro` (equivalente de cómputo para la base de datos)
- **Pricing strategy:** Compute Savings Plans 3yr No Upfront
- **Enable monitoring:** Desactivado
- **Data Transfer:**
  - DT Inbound: Not selected (0 TB per month)
  - DT Outbound: Not selected (0 TB per month)
  - DT Intra-Region: 0 TB per month

### 5.3 Configuración de almacenamiento (situación real del entorno dev)

En el entorno `tropicales-shop-dev-rds` se utiliza:

- **Motor:** MySQL
- **Tipo de almacenamiento:** General Purpose SSD (**gp2**)
- **Almacenamiento asignado:** **20 GiB**
- **Autoscaling de almacenamiento:** habilitado, con tope máximo de **1000 GiB**
- **Espacio libre observado (métrica FreeStorageSpace):** aproximadamente **18,4 GiB**, lo que indica un uso muy bajo de almacenamiento en dev.

Esta configuración proporciona suficiente margen para el entorno de desarrollo, con capacidad de crecimiento automático si el uso de datos aumenta.

### 5.4 Costo estimado (cómputo RDS)

- **Costo inicial:** `0,00 USD`
- **Costo mensual:** **`3,80 USD`**

Este valor corresponde al costo mensual aproximado del **cómputo** de la base de datos en dev, modelado como una instancia `t3.micro` bajo **Compute Savings Plans 3 años sin pago inicial**.

---

## 6. Instancia Amazon EC2 de bastion

### 6.1 Descripción

Además de la base de datos, se utiliza una instancia **Amazon EC2** dedicada como **bastion**, es decir, un punto de acceso seguro para que los desarrolladores puedan conectarse a la base de datos desde sus equipos locales.

Esta instancia no forma parte de la lógica de la aplicación, sino de la infraestructura de acceso y operación del entorno dev.

### 6.2 Configuración en la calculadora

Configuración utilizada en la AWS Pricing Calculator para la instancia EC2 de bastion:

- **Región:** US East (Ohio)
- **Tenancy:** Shared Instances
- **Operating system:** Linux
- **Workload:** Consistent
- **Number of instances:** 1
- **Instance type:** `t3.micro`
- **Pricing strategy:** Compute Savings Plans 3yr No Upfront
- **Enable monitoring:** Desactivado
- **Data Transfer:**
  - DT Inbound: Not selected (0 TB per month)
  - DT Outbound: Not selected (0 TB per month)
  - DT Intra-Region: 0 TB per month

### 6.3 Costo estimado EC2 bastion

- **Costo inicial:** `0,00 USD`
- **Costo mensual:** **`3,80 USD`**

Esta cantidad representa el costo aproximado de mantener una instancia pequeña (`t3.micro`) dedicada al rol de bastion para el equipo de desarrollo.

---

## 7. Resumen de costos mensuales

La siguiente tabla resume los costos estimados para los componentes considerados:

| Servicio                                        | Costo inicial | Costo mensual |
| ----------------------------------------------- | ------------- | ------------- |
| Amazon VPC                                      | 0,00 USD      | **3,65 USD**  |
| Amazon RDS (cómputo dev, Savings Plan 3yr)      | 0,00 USD      | **3,80 USD**  |
| Amazon EC2 bastion (t3.micro, Savings Plan 3yr) | 0,00 USD      | **3,80 USD**  |

### 7.1 Total mensual estimado (incluyendo EC2 bastion)

> **Total mensual aproximado (VPC + RDS + EC2 bastion):**  
> 3,65 USD + 3,80 USD + 3,80 USD = **11,25 USD/mes**

---

## 8. Proyección anual

Suponiendo que la configuración se mantiene constante durante 12 meses:

- **Costo anual aproximado (VPC + RDS + EC2 bastion):**  
  11,25 USD × 12 ≈ **135,00 USD**

---

## 9. Conclusiones

1. El entorno de desarrollo **“tropicales-shop”** presenta un costo mensual estimado muy reducido, del orden de **11,25 USD/mes**, considerando VPC, base de datos RDS y una instancia EC2 de bastion.
2. La base de datos dev:
   - Se modela con cómputo equivalente a `t3.micro` bajo **Compute Savings Plans 3 años sin pago inicial**, con un costo aproximado de **3,80 USD/mes**.
   - Utiliza almacenamiento gp2 con **20 GiB asignados** y autoscaling hasta **1000 GiB**, con un uso actual bajo (FreeStorageSpace ~18,4 GiB libres), suficiente para las necesidades de desarrollo.
3. La VPC añade un costo moderado de **3,65 USD/mes**, asociado a los recursos de red e IP pública en `US East (Ohio)`.
4. La instancia **EC2 bastion** utilizada para acceso de los desarrolladores implica un costo adicional de **3,80 USD/mes**, manteniendo el entorno accesible de forma segura sin incrementar significativamente el costo total.
