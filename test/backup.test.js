// Prueba de ida y vuelta: backup -> borrar datos -> restore -> comparar.
// Requiere un MongoDB accesible en MONGODB_URI (por defecto localhost:27017).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { MongoClient, ObjectId, Decimal128 } = require('mongodb');
const { crearBackup, restaurarBackup, listarBackups } = require('../src/backup-lib');

const URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';

test('backup y restore conservan documentos, tipos BSON e índices', async () => {
  const client = await new MongoClient(URI, { serverSelectionTimeoutMS: 5000 }).connect();
  const db = client.db('prueba_backup_' + Date.now());
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bk-'));
  try {
    const id = new ObjectId();
    const fecha = new Date('2026-01-01T10:00:00Z');
    await db.collection('items').insertMany([
      { _id: id, nombre: 'a', fecha, precio: Decimal128.fromString('19.99') },
      ...Array.from({ length: 2500 }, (_, i) => ({ n: i })),
    ]);
    await db.collection('items').createIndex({ nombre: 1 }, { name: 'idx_nombre' });

    const meta = await crearBackup(db, dir, { retencion: 3 });
    assert.strictEqual(meta.colecciones.items.documentos, 2501);

    await db.collection('items').drop();
    await restaurarBackup(db, path.join(dir, meta.id));

    const doc = await db.collection('items').findOne({ _id: id });
    assert.ok(doc.fecha instanceof Date);
    assert.strictEqual(doc.fecha.toISOString(), fecha.toISOString());
    assert.strictEqual(doc.precio.toString(), '19.99');
    assert.strictEqual(await db.collection('items').countDocuments(), 2501);
    const indices = (await db.collection('items').indexes()).map((i) => i.name);
    assert.ok(indices.includes('idx_nombre'));
  } finally {
    await db.dropDatabase();
    await client.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('la política de retención conserva solo los N backups más recientes', async () => {
  const client = await new MongoClient(URI, { serverSelectionTimeoutMS: 5000 }).connect();
  const db = client.db('prueba_retencion_' + Date.now());
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bk-'));
  try {
    await db.collection('x').insertOne({ a: 1 });
    for (let i = 0; i < 4; i++) {
      await crearBackup(db, dir, { retencion: 2 });
      await new Promise((r) => setTimeout(r, 15));
    }
    assert.strictEqual((await listarBackups(dir)).length, 2);
  } finally {
    await db.dropDatabase();
    await client.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('un backup alterado es rechazado por checksum', async () => {
  const client = await new MongoClient(URI, { serverSelectionTimeoutMS: 5000 }).connect();
  const db = client.db('prueba_checksum_' + Date.now());
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bk-'));
  try {
    await db.collection('x').insertOne({ a: 1 });
    const meta = await crearBackup(db, dir);
    fs.appendFileSync(path.join(dir, meta.id, 'x.jsonl.gz'), 'basura');
    await assert.rejects(restaurarBackup(db, path.join(dir, meta.id)), /Checksum inválido/);
  } finally {
    await db.dropDatabase();
    await client.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
