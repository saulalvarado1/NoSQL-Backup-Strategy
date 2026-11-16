#!/usr/bin/env node
// Uso: MONGODB_URI=... node scripts/restore.js [directorio-del-backup]
// Sin argumento restaura el backup más reciente de ./backups
const fs = require('fs');
const path = require('path');
const { getDb, closeDb } = require('../src/db');
const { restaurarBackup } = require('../src/backup-lib');

function masReciente(base) {
  const dirs = fs
    .readdirSync(base)
    .filter((d) => fs.existsSync(path.join(base, d, 'metadata.json')))
    .sort();
  if (!dirs.length) throw new Error(`No hay backups en ${base}`);
  return path.join(base, dirs[dirs.length - 1]);
}

(async () => {
  try {
    const base = process.env.BACKUP_DIR || path.join(__dirname, '..', 'backups');
    const dir = process.argv[2] || masReciente(base);
    const db = await getDb();
    const r = await restaurarBackup(db, dir);
    console.log(`Backup ${r.backup} restaurado y verificado:`, r.restaurados);
  } catch (err) {
    console.error('Error en la restauración:', err.message);
    process.exitCode = 1;
  } finally {
    await closeDb();
  }
})();
