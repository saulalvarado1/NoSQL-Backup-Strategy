const { MongoClient } = require('mongodb');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DB_NAME = process.env.DB_NAME || 'tienda';

let client;

async function getDb() {
  if (!client) {
    client = new MongoClient(MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
    await client.connect();
  }
  return client.db(DB_NAME);
}

async function closeDb() {
  if (client) {
    await client.close();
    client = undefined;
  }
}

module.exports = { getDb, closeDb, DB_NAME };
