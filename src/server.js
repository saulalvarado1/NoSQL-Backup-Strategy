const path = require('path');
const express = require('express');
const { ObjectId } = require('mongodb');
const { getDb } = require('./db');
const { crearBackup, listarBackups } = require('./backup-lib');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

const BACKUP_DIR = process.env.BACKUP_DIR || path.join(__dirname, '..', 'backups');
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';

// Salud del servicio y de la base de datos
app.get('/health', async (_req, res) => {
  try {
    const db = await getDb();
    await db.command({ ping: 1 });
    res.json({ estado: 'ok', baseDeDatos: 'conectada' });
  } catch (err) {
    res.status(503).json({ estado: 'error', detalle: err.message });
  }
});

// CRUD de productos
app.get('/api/productos', async (_req, res) => {
  const db = await getDb();
  res.json(await db.collection('productos').find().sort({ _id: -1 }).limit(100).toArray());
});

app.post('/api/productos', async (req, res) => {
  const { nombre, precio, stock } = req.body || {};
  if (!nombre || typeof nombre !== 'string') {
    return res.status(400).json({ error: 'El campo "nombre" es obligatorio' });
  }
  const doc = {
    nombre: nombre.trim(),
    precio: Number(precio) || 0,
    stock: Number.parseInt(stock, 10) || 0,
    creadoEn: new Date(),
  };
  const db = await getDb();
  const r = await db.collection('productos').insertOne(doc);
  res.status(201).json({ _id: r.insertedId, ...doc });
});

app.delete('/api/productos/:id', async (req, res) => {
  if (!ObjectId.isValid(req.params.id)) return res.status(400).json({ error: 'id inválido' });
  const db = await getDb();
  const r = await db.collection('productos').deleteOne({ _id: new ObjectId(req.params.id) });
  res.json({ eliminados: r.deletedCount });
});

// Backups (protegidos con token de administrador)
function soloAdmin(req, res, next) {
  if (!ADMIN_TOKEN || req.get('x-admin-token') !== ADMIN_TOKEN) {
    return res.status(401).json({ error: 'No autorizado' });
  }
  next();
}

app.get('/api/backups', soloAdmin, async (_req, res) => {
  res.json(await listarBackups(BACKUP_DIR));
});

app.post('/api/backups', soloAdmin, async (_req, res) => {
  const db = await getDb();
  const meta = await crearBackup(db, BACKUP_DIR, { retencion: 5 });
  res.status(201).json(meta);
});

const PORT = process.env.PORT || 3000;
if (require.main === module) {
  app.listen(PORT, () => console.log(`Servidor escuchando en http://localhost:${PORT}`));
}

module.exports = app;
