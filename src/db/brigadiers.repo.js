// Репозиторий для работы с таблицей brigadiers
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
    const status = 'active'

    const query = `
      INSERT INTO brigadiers (telegram_id, first_name, last_name, status)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `

    const { rows } = await pool.query(query, [telegramId, firstName, lastName, status])
    return rows[0]
  }
}

module.exports = { createBrigadiersRepo }
