// Репозиторий для работы с таблицей ships
function createShipsRepo(pool) {
  return {
    findByName,
    create,
  }

  // Ищем судно по точному названию
  async function findByName(name) {
    const query = `
      SELECT *
      FROM ships
      WHERE name = $1
      LIMIT 1
    `

    const { rows } = await pool.query(query, [name])
    return rows[0] || null
  }

  // Создаём запись судна, если его ещё нет
  async function create({ name }) {
    const query = `
      INSERT INTO ships (name, status)
      VALUES ($1, $2)
      RETURNING *
    `

    const { rows } = await pool.query(query, [name, 'active'])
    return rows[0]
  }
}

module.exports = { createShipsRepo }
