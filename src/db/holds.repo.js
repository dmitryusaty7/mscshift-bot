// Репозиторий для работы с таблицей holds
function createHoldsRepo(pool) {
  return {
    createForShift,
  }

  // Создаём записи трюмов для смены
  async function createForShift({ shiftId, count }) {
    for (let number = 1; number <= count; number += 1) {
      const query = `
        INSERT INTO holds (shift_id, number)
        VALUES ($1, $2)
      `

      // eslint-disable-next-line no-await-in-loop
      await pool.query(query, [shiftId, number])
    }
  }
}

module.exports = { createHoldsRepo }
