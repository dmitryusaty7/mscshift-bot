// Репозиторий для работы с таблицей brigadiers
const { randomUUID } = require('crypto')

function createBrigadiersRepo(pool) {
  return {
    findByTelegramId,
    create,
  }

  // Ищем бригадира по telegram_id
  async function findByTelegramId(telegramId) {
    const query = `
      SELECT *
      FROM brigadiers
      WHERE telegram_id = $1
      LIMIT 1
    `

    const { rows } = await pool.query(query, [telegramId])
    return rows[0] || null
  }

  // Создаём запись бригадира
  async function create({ telegramId, firstName, lastName }) {
    const id = randomUUID()
    const createdAt = new Date()

    const query = `
      INSERT INTO brigadiers (id, telegram_id, first_name, last_name, created_at)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `

    const { rows } = await pool.query(query, [id, telegramId, firstName, lastName, createdAt])
    return rows[0]
  }
}

module.exports = { createBrigadiersRepo }
