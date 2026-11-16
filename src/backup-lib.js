/**
 * Librería de backup lógico para MongoDB.
 *
 * Formato de un backup:
 *   backups/<AAAA-MM-DDTHH-MM-SSZ>/
 *     ├── <coleccion>.jsonl.gz   (un documento EJSON por línea, comprimido)
 *     └── metadata.json          (conteos, índices y checksum SHA-256 de cada archivo)
 *
 * EJSON (Extended JSON) conserva los tipos de BSON (ObjectId, Date, Decimal128...),
 * por lo que la restauración es fiel al original.
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const readline = require('readline');
const { pipeline } = require('stream/promises');
const { Readable } = require('stream');
const { EJSON } = require('mongodb').BSON;

function marcaDeTiempo() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function sha256(archivo) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    fs.createReadStream(archivo)
      .on('data', (d) => hash.update(d))
      .on('end', () => resolve(hash.digest('hex')))
      .on('error', reject);
  });
}

async function crearBackup(db, dirBase, { retencion = 7 } = {}) {
  const id = marcaDeTiempo();
  const destino = path.join(dirBase, id);
  fs.mkdirSync(destino, { recursive: true });

  const colecciones = (await db.listCollections({ type: 'collection' }).toArray())
    .map((c) => c.name)
    .filter((n) => !n.startsWith('system.'));

  const meta = { id, baseDeDatos: db.databaseName, creadoEn: new Date().toISOString(), colecciones: {} };

  for (const nombre of colecciones) {
    const archivo = path.join(destino, `${nombre}.jsonl.gz`);
    const cursor = db.collection(nombre).find();
    let documentos = 0;

    async function* lineas() {
      for await (const doc of cursor) {
        documentos++;
        yield EJSON.stringify(doc, { relaxed: false }) + '\n';
      }
    }
    await pipeline(Readable.from(lineas()), zlib.createGzip(), fs.createWriteStream(archivo));

    const indices = (await db.collection(nombre).indexes()).filter((i) => i.name !== '_id_');
    meta.colecciones[nombre] = {
      documentos,
      indices,
      archivo: path.basename(archivo),
      sha256: await sha256(archivo),
    };
  }

  fs.writeFileSync(path.join(destino, 'metadata.json'), JSON.stringify(meta, null, 2));
  aplicarRetencion(dirBase, retencion);
  return meta;
}

/** Política de retención: conserva solo los N backups más recientes. */
function aplicarRetencion(dirBase, retencion) {
  const dirs = fs
    .readdirSync(dirBase, { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join(dirBase, d.name, 'metadata.json')))
    .map((d) => d.name)
    .sort()
    .reverse();
  for (const viejo of dirs.slice(retencion)) {
    fs.rmSync(path.join(dirBase, viejo), { recursive: true, force: true });
  }
}

async function listarBackups(dirBase) {
  if (!fs.existsSync(dirBase)) return [];
  return fs
    .readdirSync(dirBase)
    .filter((d) => fs.existsSync(path.join(dirBase, d, 'metadata.json')))
    .sort()
    .reverse()
    .map((d) => JSON.parse(fs.readFileSync(path.join(dirBase, d, 'metadata.json'), 'utf8')));
}

/**
 * Restaura un backup. Verifica checksums antes de tocar la base de datos
 * y comprueba los conteos al terminar.
 */
async function restaurarBackup(db, dirBackup, { borrarAntes = true } = {}) {
  const meta = JSON.parse(fs.readFileSync(path.join(dirBackup, 'metadata.json'), 'utf8'));

  // 1) Verificación de integridad
  for (const [nombre, info] of Object.entries(meta.colecciones)) {
    const actual = await sha256(path.join(dirBackup, info.archivo));
    if (actual !== info.sha256) throw new Error(`Checksum inválido en la colección "${nombre}"`);
  }

  // 2) Restauración
  const resultado = {};
  for (const [nombre, info] of Object.entries(meta.colecciones)) {
    const col = db.collection(nombre);
    if (borrarAntes) await col.deleteMany({});

    const rl = readline.createInterface({
      input: fs.createReadStream(path.join(dirBackup, info.archivo)).pipe(zlib.createGunzip()),
      crlfDelay: Infinity,
    });
    let lote = [];
    let total = 0;
    for await (const linea of rl) {
      if (!linea.trim()) continue;
      lote.push(EJSON.parse(linea, { relaxed: false }));
      if (lote.length === 1000) {
        await col.insertMany(lote, { ordered: false });
        total += lote.length;
        lote = [];
      }
    }
    if (lote.length) {
      await col.insertMany(lote, { ordered: false });
      total += lote.length;
    }

    for (const idx of info.indices) {
      const { key, v, ns, ...opciones } = idx;
      await col.createIndex(key, opciones);
    }

    // 3) Verificación de conteos
    const enBd = await col.countDocuments();
    if (enBd !== info.documentos) {
      throw new Error(`"${nombre}": se esperaban ${info.documentos} documentos y hay ${enBd}`);
    }
    resultado[nombre] = total;
  }
  return { backup: meta.id, restaurados: resultado };
}

module.exports = { crearBackup, restaurarBackup, listarBackups, aplicarRetencion };
