// Репозиторий для работы с таблицей brigadiers
function createBrigadiersRepo(pool) {
  return {
    findByTelegramId,
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
}

module.exports = { createBrigadiersRepo }
