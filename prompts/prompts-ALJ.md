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

# Parte 2 — Ejecución en Claude Code

> A partir de aquí, las interacciones corresponden a la **sesión real de ejecución** en Claude Code (modelo Opus 4.8, 1M de contexto). El plan de la Parte 1 evolucionó al contacto con el código y con AWS: varias "decisiones consolidadas" se ajustaron (tests sin Postgres, sin Docker en la EC2, sin filtro `paths`, etc.). Se documentan los cambios y el porqué.

## Iteración 7 — Lectura del plan y preguntas de alcance

### Prompt del usuario

> Lee el archivo plan.md y comprendelo. Luego yo indicaré cuando ejecutar.
>
> *(y a continuación)* El plan está creado para completar la siguiente tarea: crear un pipeline en GitHub Actions que tras "push a una rama con un Pull Request abierto" pase tests de backend, genere un build y despliegue en EC2 [...]. **No asumas nada, hazme todas las preguntas. No se pueden instalar librerías fuera del pipeline, solo utilizar lo que hay e instalar lo que tenga que ver con CDK.**

### Restricción nueva y su impacto

La regla *"no instalar librerías fuera del pipeline, solo CDK"* modificó el plan:
- **Etapa 3**: `actionlint` / `yamllint` ya no se instalan → validación del YAML por otros medios.
- **Etapa 4**: `act` no se instala → SKIP.
- **CDK**: sí se permite `npm install` dentro de `infra/cdk/`.

### Preguntas formuladas y respuestas

| # | Pregunta | Respuesta |
|---|---|---|
| 1 | Validación del YAML / dry-run sin instalar | Usar herramientas **solo si ya están instaladas**; si no, SKIP. |
| 2 | VPC del stack CDK | **VPC default** (sin coste de red extra). |
| 3 | Región AWS | **us-east-1**. |
| 4 | `DATABASE_URL` en el deploy | **Solo en el `.env` de la EC2**; el workflow no la inyecta → 4 secretos efectivos. |

---

## Iteración 8 — Alineación con los requerimientos y prompts

### Prompt del usuario

> ¿El plan está alineado con los requerimientos ya entregados?
>
> *(y luego)* Los prompts los agregaremos al final.

### Conclusión

El plan cubre el 100% de lo técnico (trigger por `pull_request`, jobs `test → build → deploy`, `pipeline.yml`, deploy a EC2). Dos matices:
1. El entregable "documentar los prompts" se delega al usuario al final (este archivo).
2. El script CDK es un extra no pedido literalmente pero necesario (sin EC2 no hay dónde desplegar).

---

## Iteración 9 — Etapa 1: Descubrimiento del backend (read-only)

### Prompt del usuario

> Comienza con la etapa 1.

### Hallazgos (con evidencia leída del código)

- **Scripts npm**: `build: tsc`, `test: jest`, `start: node dist/index.js`. Deps clave: `express`, `@prisma/client ^5.13`, `typescript ^4.9`, `jest ^29` + `ts-jest`. **Sin campo `engines`**.
- **Build output**: `dist/` (confirmado en `tsconfig.json`).
- **Veredicto tests → NO necesitan Postgres**: los 4 `*.test.ts` usan `jest.mock('@prisma/client')` o mockean el servicio. Nunca llaman `$connect`. **Esto contradijo la suposición del plan original** (que asumía `services:` Postgres y `migrate deploy` en el job de test).
- **`jest.config.js` SÍ existe** (preset ts-jest) → `npm test` funciona.
- `schema.prisma`: `url` **hardcodeada** → habrá que cambiarla a `env("DATABASE_URL")`.
- `.env`: `DATABASE_URL` compuesta por interpolación de `DB_USER`/`DB_PASSWORD`/`DB_PORT`/`DB_NAME`.

### Cambio de rumbo respecto al plan

El job `test` **no llevará `services:` Postgres ni `migrate deploy`** (serían inútiles y romperían el job). Solo `npm ci → prisma generate (con DATABASE_URL dummy) → npm test`.

---

## Iteración 10 — Etapa 2: Script CDK para la EC2

### Prompt del usuario

> Continua. No debes asumir nada, pregúntame todo.

### Preguntas y respuestas

| # | Pregunta | Respuesta |
|---|---|---|
| 1 | ¿Docker en la EC2? | **Quitar Docker** (el deploy usa PM2 directo, no Docker). |
| 2 | Nombres de BD en CDK | **Alinear con el `.env`**: `dbUser=LTIdbUser`, `dbName=LTIdb`. |
| 3 | Tamaño EBS | **8 GB** (default del AMI). |
| 4 | Versión PostgreSQL | **PostgreSQL 16** vía repo PGDG. |

### Proyecto creado en `infra/cdk/`

`bin/cdk.ts`, `lib/lti-backend-stack.ts`, `cdk.json`, `tsconfig.json`, `package.json`, `README.md`. El stack: VPC default (`fromLookup`), Security Group (22 ← IP operador, 3010 ← mundo), EC2 `t2.micro` Ubuntu 22.04 vía SSM Parameter, Key Pair por nombre, UserData (Node 20 + PM2 + PostgreSQL 16, **sin Docker**), Elastic IP, y Outputs (`PublicIp`, `SshCommand`, `DatabaseUrl`).

### Problemas de síntesis resueltos (troubleshooting real)

1. **Node 24 + ts-node**: el *type-stripping* nativo de Node 24 rompía `ts-node`. Solución: compilar con `tsc` (`app: "npx tsc && node dist/bin/cdk.js"`).
2. **Colisión de `bin`**: `package.json` declaraba un bin `cdk` → `npx cdk` ejecutaba nuestro `.ts` en vez del CLI real. Solución: eliminar el campo `bin`.
3. **`Vpc.fromLookup` exige cuenta+región concretas** y, sin credenciales, llama a AWS. Para validar la síntesis offline se sembró un `cdk.context.json` dummy (luego eliminado y gitignored). `cdk synth` produjo el template completo correctamente.

---

## Iteración 11 — Cierre de Etapa 2: Nginx y VPC

### Prompt del usuario

> Continua.

### Dudas resueltas

| Duda | Decisión |
|---|---|
| El SG abría el puerto 80 pero no se instala Nginx | **Sin Nginx → cerrar el puerto 80**. Acceso directo por 3010 (PM2). |
| `cdk synth` real requiere credenciales por `fromLookup` | **Mantener VPC default** (no cambiar a VPC nueva). |

El SG quedó solo con 22 y 3010.

---

## Iteración 12 — Etapa 3: Escritura del workflow

### Prompt del usuario

> Continua y recuerda no asumir nada.

### Acciones

- **Cambio autorizado en `backend/`**: `schema.prisma` → `url = env("DATABASE_URL")` (única excepción).
- Creado `.github/workflows/pipeline.yml`: trigger `pull_request` (`opened`/`synchronize`/`reopened`) a `main`, **sin filtro `paths`** (para garantizar el disparo en cualquier push a la rama del PR). Jobs `test → build → deploy` encadenados con `needs:`.
- **Validación sin instalar nada**: `actionlint`/`yamllint`/`act` no instalados → SKIP. Se validó el YAML con `ruby -ryaml` (psych de macOS). Bien formado.
- Versiones de actions pineadas: `checkout@v4`, `setup-node@v4`, `upload-artifact@v4`, `download-artifact@v4`, `ssh-agent@v0.9.0`.

### Secretos efectivos (4)

`EC2_SSH_KEY`, `EC2_INSTANCE`, `EC2_SSH_USER` (=`ubuntu`), `EC2_DEPLOY_PATH` (=`/home/ubuntu/lti-backend`). `AWS_ACCESS_ID`/`AWS_ACCESS_KEY` se documentan por cumplimiento del README pero **el workflow no los referencia**.

---

## Iteración 13 — Etapa 4: Verificación local (dry-run)

### Prompt del usuario

> Déjalo *(el `ci.yml` vacío)*. Continúa y recuerda no asumir nada.

### Resultados de los 3 chequeos

1. **`act` test job → SKIP** (no instalado). Mitigado ejecutando `npm test` directo → **4/4 PASS**.
2. **Build manual → PASS**: `npm ci → prisma generate → npm run build`, `dist/index.js` generado.
3. **CDK smoke test → PASS**: `tsc` OK + `cdk synth` con context dummy.

### Hallazgo

Correr `build` antes de `test` localmente hacía que jest recogiera también los `dist/**/*.test.js` compilados (8 suites, 4 fallando). **No afecta al pipeline**: en CI, `test` corre sin `dist/` → 4/4 PASS. Decisión: no tocar `tsconfig.json` (el artifact incluye los tests compilados, inofensivo).

---

## Iteración 14 — Etapa 5: Documentación final

### Prompt del usuario

> Continua y recuerda no asumir nada.
>
> *(más tarde, al ver comandos git)* No hagas cambios en git. Continúa con la ejecución.

### Acciones

- `README.md`: sección **"Pipeline CI/CD"** (diagrama del flujo, tabla de secretos, referencia a `infra/cdk/README.md`, cómo monitorear en Actions).
- `.gitignore`: añadido bloque CDK (`node_modules/`, `cdk.out/`, `dist/`, `cdk.context.json`) y `*.pem`. **`.env` se dejó como estaba** (comentado a propósito; el `.env` ya estaba commiteado intencionalmente).
- Sin commit ni operaciones de git mutantes (a petición del usuario).

---

## Iteración 15 — Despliegue real del CDK

### Prompt del usuario

> Arranca el CDK y probemos que funciona.

### Preguntas y respuestas

| Pregunta | Respuesta |
|---|---|
| Key Pair | **Crear uno nuevo (`lti-key`)** y descargar el `.pem`. |
| `dbPassword` | **Generar una fuerte** (32 chars alfanuméricos; `<redactada>`). |
| Confirmar deploy (recursos facturables) | **Sí, bootstrap + deploy**. |

### Ejecución y troubleshooting real

1. Autenticación AWS (`aws login`) — cuenta `814305870495`, us-east-1.
2. Creado Key Pair `lti-key` (`.pem` con `chmod 400`).
3. `cdk bootstrap` — necesitó recibir el `--context` (también sintetiza la app).
4. **`cdk deploy` falló**: la cuenta **no tenía VPC default** en us-east-1. Se recreó con `aws ec2 create-default-vpc` y se reintentó.
5. **Deploy exitoso**. Outputs: `PublicIp=34.231.94.94`, `SshCommand`, `DatabaseUrl` (con password `<redactada>`).

### Verificación en la EC2 (SSH)

`cloud-init` done, **Node v20.20.2**, **PM2 7.0.1**, **PostgreSQL 16.14** activo, BD `LTIdb`/`LTIdbUser` con **conexión OK**, deploy dir creado. Se colocó el `.env` con `DATABASE_URL` (chmod 600).

> Prompt intermedio del usuario tras el fallo de la VPC: *"Mi bad. Try it again"*.

---

## Iteración 16 — Secrets, push y primer PR (en el fork)

### Prompt del usuario

> Sí *(configurar secrets + push + PR)*.
>
> *(luego)* Listo el push y las credenciales.

### Hallazgos

- **`gh` CLI no instalado** y no se instala (restricción) → no se pueden configurar los GitHub Secrets ni abrir el PR programáticamente. El usuario los configura en la web.
- Commit del pipeline + infra en rama `feature/cicd-pipeline`; el push lo hizo el usuario (en el entorno del agente no había credenciales git).

---

## Iteración 17 — Corrección de errores del pipeline en ejecución

### Prompts del usuario (logs pegados del job `deploy`)

> `Run ssh-keyscan -H *** ...` → `Error: Process completed with exit code 1`.
>
> `rsync ... "$SSH_USER@$SSH_HOST:$DEPLOY_PATH/"` → `Unexpected remote arg: :***` ... `rsync error (code 1)`.
>
> `rsync ... ./artifact/backend/ ...` → `change_dir ".../artifact/backend" failed: No such file or directory`.

### Tres bugs reales encontrados y arreglados

1. **SSH bloqueado por el SG**: el puerto 22 estaba restringido a la IP del operador; los runners de GitHub no entraban. → **Abrir el puerto 22 a `0.0.0.0/0`** (auth solo por clave `.pem`) vía edición del CDK + `cdk deploy`. (Decisión consciente; se preguntó al usuario.)
2. **Espacios en los secretos**: `EC2_INSTANCE`/`EC2_DEPLOY_PATH` pegados con salto de línea/espacio rompían `rsync`. → El job ahora **recorta whitespace** (`tr -d '[:space:]'`) y exporta a `GITHUB_ENV`.
3. **Ruta del artifact**: `upload-artifact@v4` **elimina el prefijo común `backend/`**; la fuente correcta del `rsync` es `./artifact/` (no `./artifact/backend/`). Además se añadió `--exclude='.env' --exclude='node_modules'` para que `--delete` no borre el `.env` con la `DATABASE_URL` de la EC2.

> Prompts del usuario en esta iteración: *"make the commit I will push"* y *"continua"*. Los commits los creó el agente; el push lo hizo el usuario.

---

## Iteración 18 — Rama limpia para el PR al repositorio padre

### Prompt del usuario

> Necesito que eliminemos la infra de esta rama para hacer el PR hacia la rama main del repositorio padre.

### Contexto

El trabajo completo (pipeline + infra) ya estaba en `feature/cicd-pipeline` y mergeado al `main` del fork (PR #1). Para el PR al **repo padre** (`LIDR-academy`) se usó una rama limpia `pipeline-ALJ` (desde el commit inicial).

### Decisiones y acciones

| Pregunta | Respuesta |
|---|---|
| Contenido del PR al padre | **Solo `pipeline.yml`** (schema y README originales). |
| Limpieza del working tree | Eliminar **infra/ + lti-key.pem + CLAUDE.md + plan.md**. |
| Scope del commit | `pipeline.yml` + `prompts-ALJ.md` + borrado de `prompts.md`. |

- `pipeline.yml` traído desde `main` (versión final con los 3 fixes).
- **`lti-key.pem` preservado fuera del repo** (`~/lti-key.pem`) en vez de borrarlo (es la clave privada de acceso a la EC2).
- `infra/`, `CLAUDE.md`, `plan.md` eliminados del working tree.
- Commit `d308642` en `pipeline-ALJ`, listo para el PR cross-fork a `LIDR-academy:main`.

### Nota sobre el comportamiento en el repo padre

`test` y `build` pasan; el job `deploy` **no se ejecuta con éxito en el PR al padre** porque los PRs desde un fork no reciben los secrets del repo base. La demostración del deploy real quedó en el fork.

---

## Iteración 19 — Documentación de los prompts

### Prompt del usuario

> Al archivo prompts-ALJ.md, agrégale todas nuestras interacciones, sigue el mismo patrón.

Esta Parte 2 es el resultado: la traza completa de la ejecución en Claude Code, con los prompts del usuario, las decisiones tomadas en cada pausa y los bugs reales encontrados y corregidos durante el despliegue y las ejecuciones del pipeline.

---

## Referencias

- Repositorio: https://github.com/nandilagos/AI4Devs-pipeline-202603SRII
- Template padre: https://github.com/LIDR-academy/AI4Devs-pipeline-202603SRII
- Template raíz: https://github.com/LIDR-academy/AI4Devs-pipeline-template