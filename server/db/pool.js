const { Pool } = require('pg');

let pool;

function getPool() {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('Missing DATABASE_URL');
    }

    pool = new Pool({
      connectionString,
      max: Number(process.env.PG_POOL_MAX || 10),
      ssl: process.env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: false },
    });
  }
  return pool;
}

module.exports = { getPool };

