# LTI Backend — Infraestructura (AWS CDK)

Proyecto CDK (TypeScript) **autocontenido** que provisiona la EC2 sobre la que el
pipeline de GitHub Actions despliega el backend de LTI.

> **No forma parte del pipeline.** Se ejecuta **manualmente** por el operador, una
> sola vez, antes de que el pipeline pueda desplegar.

## Qué crea el stack

- **VPC**: la **VPC default** de la cuenta (`Vpc.fromLookup({ isDefault: true })`). Sin NAT Gateway, sin coste de red extra.
- **Security Group**:
  - `22/tcp` (SSH) restringido a tu IP (`--context myIp=`).
  - `3010/tcp` (app backend) abierto a `0.0.0.0/0`. El backend se sirve directo con PM2 en `http://<ip>:3010`.
  - **Sin Nginx** y **sin puerto 80** (no hay reverse proxy en esta demo).
- **EC2 `t2.micro`**, Ubuntu **22.04 LTS** resuelto desde un parámetro público SSM (sin AMI id hardcodeada). Disco root **8 GB** (default del AMI).
- **UserData** instala, sin Docker:
  - Node.js **20 LTS** (NodeSource)
  - **PM2** global
  - **PostgreSQL 16** (repo oficial PGDG), escuchando solo en `localhost`, con rol y base de datos creados a partir de `--context`.
  - Directorio de despliegue `/home/ubuntu/lti-backend` con `chown ubuntu:ubuntu`.
- **Elastic IP** asociada a la instancia (la IP pública sobrevive a stop/start).

El **Key Pair NO lo crea el stack**: debes crearlo antes en la consola de AWS y pasar su nombre por `--context keyName=`.

## Parámetros `--context`

| Context | Obligatorio | Default | Ejemplo |
|---|---|---|---|
| `keyName` | **Sí** | — | `--context keyName=lti-key` |
| `myIp` | **Sí** (CIDR) | — | `--context myIp=203.0.113.10/32` |
| `dbPassword` | **Sí** (secreto) | — | `--context dbPassword=<pwd>` |
| `dbUser` | No | `LTIdbUser` | `--context dbUser=LTIdbUser` |
| `dbName` | No | `LTIdb` | `--context dbName=LTIdb` |

> Los defaults de `dbUser`/`dbName` están **alineados con el `.env` del repo** para que el `DATABASE_URL` de la EC2 coincida sin retoques. **Evita comillas simples (`'`) en `dbPassword`** (se inyecta en un comando SQL).

## Prerrequisitos

1. **AWS CLI configurado** con credenciales con permisos suficientes (EC2, VPC, EIP, CloudFormation, SSM read). Verifica con `aws sts get-caller-identity`.
2. **Node.js 20+** y **npm**.
3. **CDK**: se usa vía `npx` (no requiere instalación global; viene como devDependency).
4. **Key Pair** ya creado en la consola de AWS, en la **región `us-east-1`**, con el `.pem` descargado.

## Comandos

```sh
cd infra/cdk
npm install

# Solo la primera vez por cuenta/región:
npx cdk bootstrap

# Validar la plantilla sin desplegar:
npx cdk synth \
  --context keyName=<tu-key> --context myIp=<tu-ip>/32 \
  --context dbPassword=<pwd>

# Desplegar:
npx cdk deploy \
  --context keyName=<tu-key> \
  --context myIp=<tu-ip>/32 \
  --context dbUser=LTIdbUser \
  --context dbPassword=<pwd> \
  --context dbName=LTIdb
```

La región está fijada a **`us-east-1`** en `bin/cdk.ts` (override con `CDK_DEFAULT_REGION`). La cuenta se toma de las credenciales activas del AWS CLI.

> **Nota sobre `cdk synth` y el lookup de la VPC default**: el stack usa `Vpc.fromLookup`, que necesita **credenciales AWS** para consultar la VPC real la primera vez (el resultado se cachea en `cdk.context.json`, que está en `.gitignore`). Por eso, un `cdk synth` **sin credenciales** fallará con *"no credentials have been configured"*. Esto es esperado: ejecuta `synth`/`deploy` con tu AWS CLI configurado. La compilación TypeScript (`npx tsc`) sí valida el código sin credenciales.

## Outputs

Tras `cdk deploy` la consola imprime:

- **`PublicIp`** — IP pública (del Elastic IP).
- **`SshCommand`** — comando SSH listo para copiar: `ssh -i <keyName>.pem ubuntu@<ip>`.
- **`DatabaseUrl`** — `postgresql://<dbUser>:<dbPassword>@localhost:5432/<dbName>`, para colocar en `/home/ubuntu/lti-backend/.env` de la instancia.

## Verificación post-deploy

UserData tarda ~2-4 min tras el `deploy`. Luego, vía SSH:

```sh
ssh -i <keyName>.pem ubuntu@<ip>
node -v                       # v20.x
pm2 -v                        # versión de PM2
psql --version                # psql (PostgreSQL) 16.x
systemctl status postgresql   # active (exited/running)
# Comprobar la conexión a la BD:
psql "postgresql://LTIdbUser:<pwd>@localhost:5432/LTIdb" -c '\conninfo'
```

> Si los comandos aún no responden, UserData no terminó. Revisa `sudo tail -f /var/log/cloud-init-output.log`.

## Destruir

```sh
cd infra/cdk
npx cdk destroy --context keyName=<tu-key> --context myIp=<tu-ip>/32 --context dbPassword=<pwd>
```

> **Coste — Elastic IP huérfano**: un EIP **asociado a una instancia en marcha es gratis**, pero un EIP **suelto** (instancia parada/terminada sin liberar el EIP) **se factura por hora**. `cdk destroy` libera el EIP junto con la instancia. Si terminas la EC2 por fuera de CDK, **libera el EIP manualmente** para no incurrir en cargos.

## Notas de coste

- `t2.micro` (750 h/mes) y 8 GB EBS gp2 están dentro del **free-tier** los primeros 12 meses.
- Fuera de free-tier: `t2.micro` ≈ **$8–9/mes** + EBS 8 GB ≈ **$0.80/mes** + EIP asociado **$0** + tráfico mínimo. Total aproximado **~$9–10/mes**.
