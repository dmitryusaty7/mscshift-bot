// Репозиторий для работы с таблицей shifts
const { randomUUID } = require('crypto')

function createShiftsRepo(pool) {
  return {
    findDuplicate,
    createShiftWithHolds,
    countActiveByBrigadier,
    getActiveByBrigadier,
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

  // Создаём новую смену и связанные трюмы в транзакции
  async function createShiftWithHolds({ date, brigadierId, shipId, holdsCount }) {
    const id = randomUUID()
    const createdAt = new Date()
    const updatedAt = createdAt

    const client = await pool.connect()

    try {
      await client.query('BEGIN')

      const shiftQuery = `
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
          is_closed,
          created_at,
          updated_at
        )
        VALUES (
          $1, $2, $3, $4, $5,
          false, false, false, false, false,
          false,
          $6, $7
        )
        RETURNING *
      `

      const { rows } = await client.query(shiftQuery, [
        id,
        date,
        brigadierId,
        shipId,
        holdsCount,
        createdAt,
        updatedAt,
      ])

      const holdQuery = `
        INSERT INTO holds (id, shift_id, number, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5)
      `

      for (let number = 1; number <= holdsCount; number += 1) {
        const holdId = randomUUID()
        // eslint-disable-next-line no-await-in-loop
        await client.query(holdQuery, [holdId, id, number, createdAt, updatedAt])
      }

      await client.query('COMMIT')

      return rows[0]
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }

  // Считаем активные смены бригадира
  async function countActiveByBrigadier(brigadierId) {
    const query = `
      SELECT COUNT(*) AS total
      FROM shifts
      WHERE brigadier_id = $1 AND is_closed = false
    `

    const { rows } = await pool.query(query, [brigadierId])
    return Number.parseInt(rows[0]?.total ?? '0', 10)
  }

  // Получаем активные смены с названиями судов
  async function getActiveByBrigadier(brigadierId) {
    const query = `
      SELECT s.id, s.date, s.holds_count, sh.name AS ship_name, s.crew_filled, s.wages_filled, s.materials_filled, s.expenses_filled, s.photos_filled
      FROM shifts s
      JOIN ships sh ON sh.id = s.ship_id
      WHERE s.brigadier_id = $1 AND s.is_closed = false
      ORDER BY s.date DESC
    `

    const { rows } = await pool.query(query, [brigadierId])
    return rows
  }
}

module.exports = { createShiftsRepo }
