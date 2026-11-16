# NoSQL Backup Strategy con MongoDB

App demo (Node.js + Express + MongoDB Atlas) que implementa una **estrategia de backup para una base de datos NoSQL**:

- Backups lógicos en **EJSON comprimido** (conserva tipos BSON: `ObjectId`, `Date`, `Decimal128`) con **checksum SHA-256** por colección.
- **Respaldo de índices** y restauración con **verificación de conteos**.
- **Política de retención** (conserva los N backups más recientes).
- **Backup diario automatizado** con GitHub Actions + **prueba de restauración** en una base temporal + **cifrado AES-256**.
- **Despliegue continuo** (CI/CD) a **Render** cuando las pruebas pasan.

## Arquitectura

```
 Desarrollador ──push──▶ GitHub ──▶ GitHub Actions
                                     ├─ ci-cd.yml : pruebas ▶ docker build ▶ deploy hook ▶ Render (app pública)
                                     └─ backup.yml: (cron diario) Atlas ▶ backup EJSON ▶ restore de prueba ▶ cifrado ▶ artefacto (30 días)

 Usuario ──HTTPS──▶ Render (Node.js/Express) ──▶ MongoDB Atlas (M0, gratis)
```

## Ejecutar en local

```bash
docker compose up -d --build
docker compose exec app node scripts/seed.js
```

Abrir http://localhost:3000 (token de admin: `cambia-este-token`).

Sin Docker para la app:

```bash
npm install
MONGODB_URI=mongodb://localhost:27017 npm run seed
MONGODB_URI=mongodb://localhost:27017 npm run backup
MONGODB_URI=mongodb://localhost:27017 DB_NAME=tienda_restaurada npm run restore
MONGODB_URI=mongodb://localhost:27017 npm test
```

## Endpoints

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/health` | Estado de la app y de la conexión a MongoDB |
| GET/POST | `/api/productos` | Listar / crear productos |
| DELETE | `/api/productos/:id` | Eliminar producto |
| GET/POST | `/api/backups` | Listar / crear backups (header `x-admin-token`) |

## Despliegue (paso a paso)

1. **MongoDB Atlas**: crear un cluster M0 gratis, un usuario de base de datos y permitir acceso de red `0.0.0.0/0`. Copiar la cadena `mongodb+srv://...`.
2. **Render**: *New → Blueprint* → seleccionar este repositorio (usa `render.yaml`). Ingresar `MONGODB_URI`. En *Settings → Deploy Hook* copiar la URL.
3. **GitHub → Settings → Secrets and variables → Actions**:
   - Secrets: `MONGODB_URI`, `RENDER_DEPLOY_HOOK`, `BACKUP_PASSPHRASE`
   - Variables: `APP_URL` (p. ej. `https://nosql-backup-strategy.onrender.com`)
4. Hacer `git push` a `main` → el workflow **CI/CD** prueba, construye y despliega.
5. En la pestaña *Actions* ejecutar **Backup programado de MongoDB** con *Run workflow* (luego corre solo cada día).

## Restaurar un backup descargado de GitHub Actions

```bash
openssl enc -d -aes-256-cbc -pbkdf2 -in backup-XXXX.tar.gz.enc -out backup.tar.gz -pass pass:TU_PASSPHRASE
mkdir -p backups && tar -xzf backup.tar.gz -C backups
MONGODB_URI="mongodb+srv://..." npm run restore
```

## Estructura

```
src/server.js         API + interfaz web
src/backup-lib.js     backup, restore, retención y checksums
scripts/              seed, backup, restore (CLI)
test/                 pruebas de ida y vuelta (backup → restore)
.github/workflows/    ci-cd.yml y backup.yml
render.yaml           infraestructura como código (Render)
articulo/             artículo para Medium / Dev.to / Hashnode
video/                guion del video (≤ 5 min)
```

## Licencia

MIT
