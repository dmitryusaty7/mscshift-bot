const { Pool } = require('pg')

// Создаём подключение к PostgreSQL
function createDbPool(dbConfig) {
  return new Pool({
    host: dbConfig.host,
    port: dbConfig.port,
    database: dbConfig.database,
    user: dbConfig.user,
    password: dbConfig.password,
  })
}

// Проверяем доступность БД
async function testDbConnection(pool) {
  await pool.query('SELECT 1 as ok')
}

module.exports = { createDbPool, testDbConnection }
