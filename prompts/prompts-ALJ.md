# Conversación: Diseño de Pipeline CI/CD para AI4Devs-pipeline-202603SRII

**Repositorio:** `nandilagos/AI4Devs-pipeline-202603SRII`
**Rol asumido:** Experto DevOps en AWS y GitHub Actions
**Fecha:** 14 de junio de 2026

---

## Iteración 1 — Análisis inicial del repositorio

### Prompt del usuario

> Eres un experto DevOps enfocado en AWS y GitHub. Actualmente estás trabajando en este repositorio: https://github.com/nandilagos/AI4Devs-pipeline-202603SRII
> Entra al repositorio y entiende su funcionamiento desde la perspectiva DevOps, el contexto y cómo está compuesto el proyecto.

### Hallazgos clave

**Contexto general**

- Módulo **AI4Devs-pipeline** del curso LIDR-academy, variante "202603 SRII".
- Tu fork está en estado inicial: **1 solo commit**, idéntico al template padre `LIDR-academy/AI4Devs-pipeline-202603SRII`, generado a su vez desde `LIDR-academy/AI4Devs-pipeline-template`.
- Aplicación base: **LTI - Talent Tracking System**.
- Stack: React (CRA) + Express/TypeScript + Prisma + PostgreSQL.
- La aplicación es el soporte; el entregable real es el pipeline CI/CD.

**Estado actual desde la perspectiva DevOps**

- El directorio `.github/workflows` existe pero **está vacío**. No hay ningún YAML de workflow definido.
- Infra como código casi inexistente: solo un `docker-compose.yml` de 12 líneas con Postgres local:

  ```yaml
  version: "3.1"
  services:
    db:
      image: postgres
      restart: always
      environment:
        POSTGRES_PASSWORD: ${DB_PASSWORD}
        POSTGRES_USER: ${DB_USER}
        POSTGRES_DB: ${DB_NAME}
      ports:
        - ${DB_PORT}:5432
  ```

- No hay Dockerfile (ni backend ni frontend), ni Terraform, ni CloudFormation, ni manifiestos de Kubernetes, ni configuración de Nginx/PM2 versionada.
- Hay un `.env` commiteado en el repo (red flag de seguridad heredada del template).
- Target de despliegue: EC2 cruda (Amazon Linux 2 o Ubuntu, `t2.micro`), provisionada manualmente según el README.
- Arquitectura "single-host monolítica": app y Postgres en la misma EC2.

**Composición del proyecto**

```
/
├── .github/workflows/   ← vacío (lo tienes que llenar)
├── backend/             ← Node + Express + TypeScript + Prisma
│   ├── src/             ← arquitectura hexagonal
│   ├── prisma/          ← schema + migraciones + seed.ts
│   ├── tests/
│   └── api-spec.yaml    ← contrato OpenAPI
├── frontend/            ← React (CRA)
│   ├── src/, public/, build/
├── prompts/             ← carpeta para prompts del ejercicio
├── docker-compose.yml   ← solo Postgres
├── package.json         ← raíz, mínimo
├── .env                 ← variables de DB (presente en repo)
└── README.md            ← guía + checklist del PR
```

**Lo que pide el ejercicio**

- Tres secretos prescriptivos: `AWS_ACCESS_ID`, `AWS_ACCESS_KEY`, `EC2_INSTANCE`.
- Checklist del PR: build sin errores, tests pasando, pipeline verde, deploy exitoso en AWS, evidencia visual.

**Gaps detectados**

1. `.env` en el repo es un riesgo.
2. Sin Dockerfile.
3. Postgres en la misma EC2 es frágil.
4. Sin OIDC entre GitHub y AWS (template pide Access Keys de larga duración).
5. Sin estrategia de migración de DB.
6. Trigger del workflow no definido.
7. Monorepo manual sin workspaces npm.

---

## Iteración 2 — Definición de la misión y solicitud de plan

### Prompt del usuario

> Tu misión en este ejercicio es crear un pipeline en GitHub Actions que, tras el trigger "push a una rama con un Pull Request abierto", siga los siguientes pasos:
>
> - Pase unos tests de backend.
> - Genere un build del backend.
> - Despliegue el backend en un EC2.
>
> Para ello, debes seguir estos pasos:
>
> - Configurar el workflow de GitHub Actions en un archivo `.github/workflows/pipeline.yml`.
> - Documentar los prompts utilizados para generar cada paso del pipeline:
>   - Tests de backend.
>   - Generación del build del backend.
>   - Despliegue del backend en EC2.
> - Asegúrate de que el pipeline se dispare con un push a una rama con un Pull Request abierto.
>
> Diseña un plan para completar esta tarea que sea ejecutable en Claude Code, no asumas nada, pregúntame cualquier duda.

### Preguntas bloqueantes formuladas

1. **Gating del deploy**: ¿estricto al enunciado (deploy en cada PR), pragmático (deploy solo en push a main), o mixto (PR a staging)?
2. **Estado de la EC2**: ¿ya existe configurada, o el pipeline / un script previo la provisiona?
3. **Detalles de acceso SSH**: SO, usuario, ruta de despliegue, nombre del secreto SSH, ubicación de Postgres.
4. **Tests del backend**: ¿requieren base de datos viva o son unitarios con mocks?
5. **Autenticación a AWS**: ¿Access Keys del README o OIDC?
6. **Estrategia de transferencia del artefacto**: (a) `rsync` de `dist/`, (b) `tar` + `scp`, (c) Docker + ECR, (d) `git pull` en EC2.

### Preguntas con default propuesto

7. **Migraciones Prisma**: `npx prisma migrate deploy` antes de `pm2 reload`.
8. **Health check post-deploy**: `curl` al backend desde el runner.
9. **Versión de Node**: 20 LTS.
10. **Organización de prompts**: `prompts/pipeline/01-tests.md`, `02-build.md`, `03-deploy.md`, `00-overview.md`.

---

## Iteración 3 — Respuestas del usuario

| # | Pregunta | Respuesta |
|---|---|---|
| 1 | Gating del deploy | **A** — Estricto al enunciado: tests + build + deploy en cada PR. |
| 2 | Estado de la EC2 | No existe. **No es parte del pipeline.** Generar un script CDK aparte para crearla y probarla. |
| 3 | Acceso SSH | No existe. Cubrirlo con el script CDK. |
| 4 | Tests requieren DB | Sí. Levantar un Docker dentro de la action para correr los tests. |
| 5 | Auth AWS | Como dice el README (`AWS_ACCESS_ID` + `AWS_ACCESS_KEY`). |
| 6 | Transferencia del artefacto | **A** — Compilar en runner, `rsync` de `dist/` + `package.json` + `prisma/`. |
| 7 | Migraciones Prisma | OK |
| 8 | Health check | Omitir |
| 9 | Versión de Node | 20 |
| 10 | Carpeta `prompts/` | No hacer nada |

---

## Iteración 4 — Observaciones sobre las respuestas

**Sobre R5 (auth AWS por Access Keys)**

El README pide `AWS_ACCESS_ID` + `AWS_ACCESS_KEY`, pero en este pipeline en concreto **no se invoca la AWS CLI ni el SDK** — el deploy es SSH puro con `rsync`/`scp`. Esos dos secretos *no se van a usar en el `pipeline.yml`*. El secreto crítico real es el SSH key. Se documentan en GitHub Secrets para cumplir con el README, pero el workflow no los referencia.

**Sobre R10 (no hacer nada en prompts)**

El enunciado del ejercicio sí pedía "documentar los prompts utilizados". Decisión registrada del usuario: fuera del scope de esta entrega.

---

## Iteración 5 — Plan ejecutable en 5 etapas

### Decisiones consolidadas (la "verdad" del proyecto)

- **Trigger**: `pull_request` (eventos `opened`, `synchronize`, `reopened`) contra `main`. Los tres jobs corren en cada push a la rama de un PR abierto, encadenados con `needs:`.
- **Deploy target**: EC2 única (Ubuntu 22.04 LTS, `t2.micro`), provisionada por separado con AWS CDK en TypeScript. App y Postgres en la misma instancia.
- **Estrategia de despliegue**: compilar en runner → `rsync` de `dist/`, `package.json`, `package-lock.json` y `prisma/` → en la EC2: `npm ci --omit=dev`, `npx prisma migrate deploy`, `pm2 reload` (o `pm2 start` la primera vez).
- **Tests**: `services:` sidecar de Postgres en el runner.
- **Node**: versión 20 LTS en runner y EC2.
- **Auth a AWS**: no aplica en el workflow.
- **Secretos efectivos**: `EC2_INSTANCE`, `EC2_SSH_USER` (=`ubuntu`), `EC2_SSH_KEY`, `EC2_DEPLOY_PATH` (=`/home/ubuntu/lti-backend`), `DATABASE_URL`.
- **Sin health-check post-deploy.**
- **Sin documentación en `prompts/`.**

### Etapa 1 — Descubrimiento del backend (read-only)

**Objetivo**: confirmar el estado real del código antes de escribir nada.

**Acciones**:
1. Leer `backend/package.json` y listar: scripts `build`, `test`, `start`, dependencias clave, versión de Node.
2. Leer `backend/tsconfig.json` y confirmar directorio de salida (esperado: `dist/`).
3. Listar `backend/tests/`, abrir 1-2 archivos representativos. Confirmar uso de Prisma, expectativa de `DATABASE_URL`, setup/teardown de DB.
4. Leer `backend/prisma/schema.prisma`: provider y env var.
5. Leer `.env` del repo y registrar variables.

**Pausa**: scripts npm, directorio de build, veredicto sobre Postgres en tests, env vars esperadas, hallazgos inesperados, Supuestos hechos, Dudas detectadas.

### Etapa 2 — Script CDK para provisionar la EC2

**Objetivo**: producir un proyecto CDK TypeScript autocontenido en `infra/cdk/`.

**El stack debe crear**:
1. VPC (default o nueva — decisión en pausa).
2. Security Group: puerto 22 desde IP del usuario (`--context myIp=`), 3010 y 80 abiertos.
3. EC2 `t2.micro` Ubuntu 22.04 LTS vía SSM Parameter (no AMI hardcodeada).
4. Key Pair referenciado por nombre (`--context keyName=`). El stack no genera la clave privada.
5. UserData script: Node.js 20 LTS, PM2 global, Docker + plugin compose, PostgreSQL 16 nativo, directorio `/home/ubuntu/lti-backend`.
6. Elastic IP asociado.
7. Outputs: IP pública, comando SSH, `DATABASE_URL` sugerida.

**Documentación**: `infra/cdk/README.md` con prerequisitos, comandos exactos (`npm install`, `cdk bootstrap`, `cdk deploy --context ...`), verificación post-deploy, comando de destrucción, nota sobre costos de EIP huérfano.

**Validación local**: `npx cdk synth` debe pasar sin errores. No ejecutar `cdk deploy`.

**Pausa**: árbol de archivos, output de `cdk synth`, decisión de VPC, parámetros de contexto, estimación de costos, riesgos, Supuestos, Dudas.

### Etapa 3 — Escritura del workflow

**Objetivo**: crear `.github/workflows/pipeline.yml`.

**Estructura**:

```yaml
name: Backend CI/CD Pipeline

on:
  pull_request:
    types: [opened, synchronize, reopened]
    branches: [main]
    paths:
      - 'backend/**'
      - '.github/workflows/pipeline.yml'

jobs:
  test:   ...
  build:  ...  # needs: test
  deploy: ...  # needs: build
```

**Job `test`**:
- `services:` con `postgres:16`, healthcheck, env vars `POSTGRES_USER=postgres`, `POSTGRES_PASSWORD=postgres`, `POSTGRES_DB=lti_test`.
- Steps: `checkout@v4` → `setup-node@v4` (Node 20, cache npm) → `npm ci` en `backend/` → `prisma generate` → `prisma migrate deploy` → `npm test`.
- `DATABASE_URL: postgresql://postgres:postgres@localhost:5432/lti_test`.

**Job `build`**:
- `needs: test`. Build en `backend/`, sube artifact `backend-build` con `dist/`, `package.json`, `package-lock.json`, `prisma/`.

**Job `deploy`**:
- `needs: build`.
- Descarga artifact → `webfactory/ssh-agent@v0.9.0` → `ssh-keyscan` → `rsync -avz --delete` → SSH remoto con `npm ci --omit=dev && npx prisma migrate deploy && (pm2 reload lti-backend || pm2 start dist/index.js --name lti-backend)`.
- El `.env` en EC2 lo coloca el usuario manualmente la primera vez.

**Validación**: `actionlint` y `yamllint` sin errores.

**Pausa**: YAML completo, output de linters, lista de secretos, mención de los secretos del README sin uso real, Supuestos, Dudas.

### Etapa 4 — Verificación local (dry-run)

**Objetivo**: detectar errores antes del primer push.

**Acciones**:
1. Test job con `act`: `act pull_request -j test` (si Docker está disponible).
2. Build job manual: `cd backend && npm ci && npx prisma generate && npm run build`.
3. CDK smoke test: `npx cdk synth` otra vez.

**Pausa**: resultado de cada chequeo (PASS/FAIL/SKIP), análisis de errores si los hay, propuesta de fix sin aplicar, Supuestos, Dudas.

### Etapa 5 — Documentación final y entrega

**Objetivo**: dejar el repo en estado "abrir PR".

**Acciones**:
1. Actualizar `README.md` raíz con sección "Pipeline CI/CD" (diagrama textual, tabla de secretos, referencia al CDK, monitoreo en Actions).
2. Verificar `.gitignore`: `infra/cdk/node_modules/`, `infra/cdk/cdk.out/`, `*.pem`, `.env`.
3. No commitear. Solo dejar cambios visibles.

**Pausa final**: lista de archivos creados/modificados, `git diff --stat`, comando de commit sugerido, lista numerada de tareas manuales pendientes del usuario (AWS CLI, Key Pair, `cdk deploy`, `.env` en EC2, configurar secretos en GitHub, push, abrir PR).

### Reglas de oro para Claude Code

1. No avanzar de etapa sin pausa explícita y "OK".
2. No instalar dependencias globales sin avisar.
3. No commitear nada. Solo `git add`.
4. No tocar `backend/`, `frontend/`, ni el código de la app.
5. No hardcodear secretos.
6. No inventar nombres de secretos, paths o variables.
7. Cada pausa incluye "Supuestos hechos" y "Dudas detectadas".

---

## Iteración 6 — Prompt final para Claude Code

El plan completo fue empaquetado en un bloque markdown único, autocontenido, listo para pegar como primer mensaje en Claude Code. Estructura:

- Misión
- Contexto del repositorio
- Decisiones consolidadas (workflow, tests, build/deploy, auth AWS, secretos, provisioning CDK, lo que NO se toca)
- Reglas de oro
- Las 5 etapas con criterios de pausa y campos obligatorios de "Supuestos" y "Dudas"
- Instrucción final: "Comienza ahora por la Etapa 1"

El prompt define explícitamente para cada etapa: objetivo, acciones, restricciones, qué entregar en la pausa. Claude Code ejecuta la Etapa 1, entrega el resumen, se detiene. El usuario responde "OK" y avanza a la siguiente.

---

## Referencias

- Repositorio: https://github.com/nandilagos/AI4Devs-pipeline-202603SRII
- Template padre: https://github.com/LIDR-academy/AI4Devs-pipeline-202603SRII
- Template raíz: https://github.com/LIDR-academy/AI4Devs-pipeline-template