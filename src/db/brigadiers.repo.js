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

  // Создаём нового бригадира
  async function create({ firstName, lastName, telegramId }) {
    const query = `
      INSERT INTO brigadiers (first_name, last_name, telegram_id)
      VALUES ($1, $2, $3)
      RETURNING *
    `

    const { rows } = await pool.query(query, [firstName, lastName, telegramId])
    return rows[0]
  }
}

module.exports = { createBrigadiersRepo }
