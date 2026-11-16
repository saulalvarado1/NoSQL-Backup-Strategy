#!/usr/bin/env node
// Carga datos de ejemplo para la demo
const { getDb, closeDb } = require('../src/db');

const productos = [
  { nombre: 'Laptop', precio: 3200.5, stock: 12 },
  { nombre: 'Mouse inalámbrico', precio: 45.9, stock: 150 },
  { nombre: 'Teclado mecánico', precio: 210, stock: 40 },
  { nombre: 'Monitor 27"', precio: 980, stock: 18 },
  { nombre: 'Disco SSD 1TB', precio: 320, stock: 60 },
];

(async () => {
  try {
    const db = await getDb();
    await db.collection('productos').deleteMany({});
    await db.collection('productos').insertMany(productos.map((p) => ({ ...p, creadoEn: new Date() })));
    await db.collection('productos').createIndex({ nombre: 1 }, { name: 'idx_nombre' });
    await db.collection('clientes').deleteMany({});
    await db.collection('clientes').insertMany([
      { nombre: 'Ana Torres', email: 'ana@example.com', compras: 3 },
      { nombre: 'Luis Quispe', email: 'luis@example.com', compras: 1 },
    ]);
    await db.collection('clientes').createIndex({ email: 1 }, { unique: true, name: 'idx_email' });
    console.log('Datos de ejemplo cargados.');
  } catch (err) {
    console.error(err.message);
    process.exitCode = 1;
  } finally {
    await closeDb();
  }
})();
