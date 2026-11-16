#!/usr/bin/env node
// Uso: MONGODB_URI=... node scripts/backup.js [directorio] [retencion]
const path = require('path');
const { getDb, closeDb } = require('../src/db');
const { crearBackup } = require('../src/backup-lib');

(async () => {
  const dir = process.argv[2] || process.env.BACKUP_DIR || path.join(__dirname, '..', 'backups');
  const retencion = Number(process.argv[3] || process.env.BACKUP_RETENTION || 7);
  try {
    const db = await getDb();
    const meta = await crearBackup(db, dir, { retencion });
    console.log(`Backup ${meta.id} creado en ${dir}`);
    for (const [c, i] of Object.entries(meta.colecciones)) {
      console.log(`  - ${c}: ${i.documentos} documentos (sha256 ${i.sha256.slice(0, 12)}…)`);
    }
  } catch (err) {
    console.error('Error en el backup:', err.message);
    process.exitCode = 1;
  } finally {
    await closeDb();
  }
})();
