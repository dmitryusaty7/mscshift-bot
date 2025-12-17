// Репозиторий для работы с таблицей holds
const { randomUUID } = require('crypto')

function createHoldsRepo(pool) {
  return {
    createForShift,
  }

  // Создаём записи трюмов для смены
  async function createForShift({ shiftId, count }) {
    const createdAt = new Date()
    const updatedAt = createdAt

    for (let number = 1; number <= count; number += 1) {
      const id = randomUUID()
      const query = `
        INSERT INTO holds (id, shift_id, number, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5)
      `

      // eslint-disable-next-line no-await-in-loop
      await pool.query(query, [id, shiftId, number, createdAt, updatedAt])
    }
  }
}

module.exports = { createHoldsRepo }
