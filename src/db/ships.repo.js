// Репозиторий для работы с таблицей ships
const { randomUUID } = require('crypto')

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
    const id = randomUUID()
    const createdAt = new Date()
    const updatedAt = createdAt

    const query = `
      INSERT INTO ships (id, name, created_at, updated_at)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `

    const { rows } = await pool.query(query, [id, name, createdAt, updatedAt])
    return rows[0]
  }
}

module.exports = { createShipsRepo }
