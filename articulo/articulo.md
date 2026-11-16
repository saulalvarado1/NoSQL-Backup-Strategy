---
title: "Estrategia de Backup para Bases de Datos NoSQL: MongoDB Atlas + GitHub Actions + Render"
tags: mongodb, nosql, backup, devops
---

# Estrategia de Backup para Bases de Datos NoSQL: MongoDB Atlas + GitHub Actions + Render

> **Repositorio:** https://github.com/saulalvarado1/NoSQL-Backup-Strategy
> **App desplegada:** https://nosql-backup-strategy.onrender.com
> **Video (≤ 5 min):** https://youtu.be/XXXXXXXXXXX
> **Autor(a):** NOMBRE — Curso de Base de Datos II

## 1. ¿Por qué hablar de backups en NoSQL?

Es común pensar que una base de datos NoSQL gestionada "ya está respaldada" porque tiene réplicas. Pero **una réplica no es un backup**: si alguien ejecuta `db.productos.deleteMany({})` por error, el borrado se replica en segundos a todos los nodos. Un backup es una **copia independiente en el tiempo** que permite volver a un estado anterior.

En este artículo construyo una aplicación pequeña (una tienda con productos y clientes) sobre **MongoDB Atlas** y le implemento una estrategia de backup completa y **automatizada**, con código abierto y desplegada en la nube.

## 2. Tipos de backup en MongoDB

| Tipo | Herramienta | Ventajas | Desventajas |
|---|---|---|---|
| **Lógico** | `mongodump`, export EJSON | Portátil, granular por colección, legible | Más lento en bases grandes |
| **Físico / snapshot** | Snapshots de disco, Atlas Cloud Backup | Muy rápido, consistente | Ligado al proveedor, requiere planes de pago en Atlas |
| **Continuo (PITR)** | Oplog, Atlas Continuous Backup | Restaurar a un segundo exacto | Costo y complejidad |

El plan gratuito de Atlas (M0) **no incluye** Cloud Backup, así que implementamos un **backup lógico propio**, que además nos da una copia **fuera del proveedor** de la base de datos.

## 3. La estrategia: regla 3-2-1 + métricas RPO/RTO

- **3 copias** de los datos: la base en Atlas (con su replica set), el backup en GitHub Actions y una copia descargable/cifrada.
- **2 medios distintos**: el cluster de Atlas y el almacenamiento de artefactos de GitHub.
- **1 copia fuera del sitio**: el backup vive en otro proveedor (GitHub), no en Atlas.

Objetivos definidos para la app:

- **RPO** (cuántos datos podemos perder): **24 horas** → backup diario.
- **RTO** (cuánto tardamos en recuperar): **< 5 minutos** → un comando `npm run restore`.
- **Retención**: 30 días (artefactos) y los últimos N backups en el servidor.

## 4. Arquitectura

```
 Desarrollador ──push──▶ GitHub ──▶ GitHub Actions
                                     ├─ CI/CD : pruebas ▶ docker build ▶ deploy ▶ Render
                                     └─ Backup: cron diario ▶ export EJSON ▶ restore de prueba ▶ cifrado AES-256 ▶ artefacto

 Usuario ──HTTPS──▶ Render (Node.js/Express) ──▶ MongoDB Atlas (M0)
```

## 5. El backup: EJSON + gzip + checksum

Exportar con `JSON.stringify` perdería tipos: un `ObjectId` o un `Decimal128` se convertirían en texto. Por eso uso **Extended JSON (EJSON) canónico**, que guarda el tipo BSON de cada valor. Cada colección se escribe como un archivo `.jsonl.gz` (un documento por línea), en *streaming* para no cargar todo en memoria:

```js
async function* lineas() {
  for await (const doc of cursor) {
    documentos++;
    yield EJSON.stringify(doc, { relaxed: false }) + '\n';
  }
}
await pipeline(Readable.from(lineas()), zlib.createGzip(), fs.createWriteStream(archivo));
```

Junto a los datos se guarda un `metadata.json` con el **número de documentos**, los **índices** y el **hash SHA-256** de cada archivo:

```json
{
  "id": "2026-11-16T05-00-00-000Z",
  "baseDeDatos": "tienda",
  "colecciones": {
    "productos": { "documentos": 5, "indices": [{ "name": "idx_nombre", "key": { "nombre": 1 } }], "sha256": "862dcd12…" }
  }
}
```

Al final se aplica la **política de retención**: se borran los backups más antiguos que excedan el límite.

## 6. La restauración: un backup que no se prueba no existe

La restauración hace tres cosas:

1. **Verifica la integridad**: recalcula el SHA-256 de cada archivo. Si alguien alteró o corrompió el backup, se detiene **antes** de tocar la base.
2. **Inserta en lotes de 1000** documentos y **recrea los índices**.
3. **Compara los conteos** con los de `metadata.json`.

```js
const actual = await sha256(path.join(dirBackup, info.archivo));
if (actual !== info.sha256) throw new Error(`Checksum inválido en la colección "${nombre}"`);
```

Las pruebas automatizadas (`npm test`) hacen un ciclo completo backup → borrar → restore y comprueban que `Date`, `Decimal128`, `ObjectId` e índices llegan intactos, que la retención funciona y que un backup alterado es rechazado.

## 7. Automatización con GitHub Actions

### 7.1 Backup diario verificado (`backup.yml`)

```yaml
on:
  schedule:
    - cron: "0 5 * * *"   # diario
  workflow_dispatch:
jobs:
  backup:
    runs-on: ubuntu-latest
    services:
      mongo-verificacion:          # base temporal para probar la restauración
        image: mongo:7
        ports: ["27018:27017"]
    steps:
      - run: node scripts/backup.js ./backups 1        # desde Atlas
      - run: node scripts/restore.js                   # hacia la base temporal
      - run: openssl enc -aes-256-cbc -pbkdf2 ...      # cifrado
      - uses: actions/upload-artifact@v4               # retención 30 días
```

Cada noche el workflow saca el backup de Atlas, **lo restaura en un MongoDB efímero para demostrar que sirve**, lo cifra con AES-256 y lo guarda como artefacto durante 30 días. Las credenciales viven en **GitHub Secrets**, nunca en el código.

### 7.2 Despliegue continuo (`ci-cd.yml`)

En cada `push` a `main`: se ejecutan las pruebas contra un MongoDB de servicio, se construye la imagen Docker y, si todo pasa, se llama al **deploy hook de Render**. Luego el pipeline espera a que `/health` responda para confirmar el despliegue.

## 8. Publicación en la nube

- **Base de datos:** MongoDB Atlas M0 (SaaS, gratis).
- **Aplicación:** Render Web Service (plan free) usando el `Dockerfile` y el blueprint `render.yaml` (infraestructura como código).
- **CI/CD y backups:** GitHub Actions.

## 9. Demostración de recuperación ante desastre

1. Abro la app y veo 5 productos.
2. Simulo el desastre: `db.productos.deleteMany({})` en Atlas → la tienda queda vacía.
3. Descargo el último artefacto de backup, lo descifro y ejecuto `npm run restore`.
4. En segundos la app vuelve a mostrar los 5 productos, con sus índices. **RTO cumplido.**

## 10. Buenas prácticas y lecciones aprendidas

- **Réplica ≠ backup.** Los errores humanos se replican.
- **Probar la restauración automáticamente**, no solo generar archivos.
- **Checksums** para detectar corrupción o manipulación.
- **Cifrar** los backups y guardar las claves en un gestor de secretos.
- **Guardar una copia fuera del proveedor** de la base de datos.
- Para bases grandes o RPO de minutos, pasar a **Atlas Cloud Backup / PITR** o `mongodump --oplog` sobre un replica set.

## 11. Conclusión

Con herramientas gratuitas (Atlas M0, GitHub Actions y Render) se puede implementar una estrategia de backup seria para una base NoSQL: **automatizada, verificada, cifrada, con retención y fuera del proveedor**. El código completo está en el repositorio, listo para clonar y adaptar.

---

**Referencias**

- MongoDB Docs — *Backup Methods for a Self-Managed Deployment*.
- MongoDB Docs — *MongoDB Extended JSON (v2)*.
- GitHub Docs — *Events that trigger workflows: schedule*.
- Render Docs — *Deploy Hooks* y *Blueprint Spec*.
