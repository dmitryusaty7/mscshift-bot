// Репозиторий для работы с таблицей shifts
const { randomUUID } = require('crypto')

function createShiftsRepo(pool) {
  return {
    findDuplicate,
    createShift,
  }

  // Проверяем, есть ли смена с такой датой, бригадиром и судном
  async function findDuplicate({ brigadierId, shipId, date }) {
    const query = `
      SELECT id
      FROM shifts
      WHERE brigadier_id = $1
        AND ship_id = $2
        AND date = $3
      LIMIT 1
    `

    const { rows } = await pool.query(query, [brigadierId, shipId, date])
    return rows[0] || null
  }

  // Создаём новую смену со всеми флагами незаполненными
  async function createShift({ date, brigadierId, shipId, holdsCount }) {
    const id = randomUUID()
    const createdAt = new Date()
    const updatedAt = createdAt

    const query = `
      INSERT INTO shifts (
        id,
        date,
        brigadier_id,
        ship_id,
        holds_count,
        crew_filled,
        wages_filled,
        materials_filled,
        expenses_filled,
        photos_filled,
        created_at,
        updated_at
      )
      VALUES (
        $1, $2, $3, $4, $5,
        false, false, false, false, false,
        $6, $7
      )
      RETURNING *
    `

    const { rows } = await pool.query(query, [
      id,
      date,
      brigadierId,
      shipId,
      holdsCount,
      createdAt,
      updatedAt,
    ])

    return rows[0]
  }
}

module.exports = { createShiftsRepo }
