// Репозиторий для работы с таблицей holds
function createHoldsRepo(pool) {
  return {
    createForShift,
    ensureForShift,
    getHoldsWithCounts,
    findById,
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

  // TODO: Review for merge — убеждаемся, что нужное количество трюмов создано для смены
  async function ensureForShift({ shiftId, count }) {
    const { rows } = await pool.query(
      'SELECT number FROM holds WHERE shift_id = $1 ORDER BY number ASC',
      [shiftId],
    )

    const existingNumbers = new Set(rows.map((row) => Number(row.number)))

    for (let number = 1; number <= count; number += 1) {
      if (existingNumbers.has(number)) {
        // TODO: Review for merge — трюм уже есть, пропускаем вставку
        // eslint-disable-next-line no-continue
        continue
      }

      const insertQuery = `
        INSERT INTO holds (shift_id, number)
        VALUES ($1, $2)
      `

      // eslint-disable-next-line no-await-in-loop
      await pool.query(insertQuery, [shiftId, number])
    }
  }

  // TODO: Review for merge — получаем список трюмов с количеством фото
  async function getHoldsWithCounts(shiftId) {
    const query = `
      SELECT h.id,
             h.number,
             COALESCE(p.cnt, 0) AS photos_count
      FROM holds h
      LEFT JOIN (
        SELECT hold_id, COUNT(*)::int AS cnt
        FROM hold_photos
        WHERE shift_id = $1
        GROUP BY hold_id
      ) p ON p.hold_id = h.id
      WHERE h.shift_id = $1
      ORDER BY h.number
    `

    const { rows } = await pool.query(query, [shiftId])
    return rows
  }

  // TODO: Review for merge — ищем трюм по идентификатору
  async function findById(id) {
    const { rows } = await pool.query(
      'SELECT id, shift_id, number FROM holds WHERE id = $1 LIMIT 1',
      [id],
    )

    return rows[0] || null
  }
}

module.exports = { createHoldsRepo }
