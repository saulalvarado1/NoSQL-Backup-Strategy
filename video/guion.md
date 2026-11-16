# Guion del video (máx. 5 minutos)

**Título sugerido:** "Estrategia de Backup NoSQL con MongoDB Atlas, GitHub Actions y Render"
**Plataforma:** YouTube (público o no listado), TikTok o Facebook.
**Herramienta de grabación:** OBS Studio o la grabadora de Windows (Win + Alt + R).

| Tiempo | En pantalla | Qué decir |
|---|---|---|
| 0:00 – 0:20 | Portada del artículo | "Hola, soy ___. Les muestro cómo implementé una estrategia de backup para una base NoSQL usando MongoDB Atlas, GitHub Actions y Render." |
| 0:20 – 0:50 | Diagrama de arquitectura (README) | "Una réplica no es un backup. Aplico la regla 3-2-1, con RPO de 24 horas y RTO menor a 5 minutos." |
| 0:50 – 1:40 | VS Code: `src/backup-lib.js` | "Cada colección se exporta en EJSON comprimido, que conserva ObjectId, Date y Decimal128. Guardo índices y un hash SHA-256. La restauración valida el hash, recrea índices y compara conteos." |
| 1:40 – 2:10 | Terminal: `npm test` | "Las pruebas hacen un ciclo backup, borrado y restore, y comprueban que un backup alterado se rechaza." |
| 2:10 – 3:00 | GitHub: repo público → Actions → CI/CD | "En cada push, GitHub Actions prueba, construye la imagen Docker y despliega en Render mediante un deploy hook." |
| 3:00 – 3:40 | Actions → Backup programado (ejecución verde, artefacto) | "Cada noche se saca el backup de Atlas, se restaura en una base temporal para comprobar que sirve, se cifra con AES-256 y se guarda 30 días." |
| 3:40 – 4:40 | App en Render + Atlas | **Demo de desastre:** mostrar productos → borrar la colección en Atlas → app vacía → `npm run restore` con el backup → recargar: los datos regresan. |
| 4:40 – 5:00 | Enlaces en pantalla | "El repositorio, la app y el artículo están en la descripción. ¡Gracias!" |

## Descripción para el video

```
Estrategia de backup para MongoDB (NoSQL): backups EJSON con checksum, verificación automática por restauración,
cifrado AES-256, retención y despliegue continuo con GitHub Actions + Render + MongoDB Atlas.

Artículo: <ENLACE_ARTICULO>
Repositorio: https://github.com/saulalvarado1/NoSQL-Backup-Strategy
App: https://nosql-backup-strategy-d819.onrender.com
```

## Comandos para la demo de desastre

```bash
# 1) En Atlas (Data Explorer o mongosh) simular el desastre
db.productos.deleteMany({})

# 2) Descargar el artefacto del último backup desde GitHub Actions, descifrar y restaurar
openssl enc -d -aes-256-cbc -pbkdf2 -in backup-XXXX.tar.gz.enc -out backup.tar.gz -pass pass:TU_PASSPHRASE
mkdir -p backups && tar -xzf backup.tar.gz -C backups
MONGODB_URI="mongodb+srv://..." npm run restore
```
