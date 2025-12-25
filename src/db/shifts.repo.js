// Репозиторий для работы с таблицей shifts
function createShiftsRepo(pool) {
  return {
    findDuplicate,
    createShiftWithHolds,
    countActiveByBrigadier,
    getActiveByBrigadier,
    findActiveByIdAndBrigadier,
    markPhotosFilled,
    getByIdWithShip,
    saveGroupMessageId,
    closeShift,
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
    const client = await pool.connect()

    try {
      await client.query('BEGIN')

      const shiftQuery = `
        INSERT INTO shifts (
          date,
          brigadier_id,
          ship_id,
          holds_count,
          is_crew_filled,
          is_salary_filled,
          is_materials_filled,
          is_expenses_filled,
          is_photos_filled,
          is_closed,
          group_message_id,
          photo_report_url,
          created_at,
          updated_at
        )
        VALUES (
          $1, $2, $3, $4,
          false, false, false, false, false,
          false,
          NULL,
          NULL,
          DEFAULT,
          DEFAULT
        )
        RETURNING *
      `

      const { rows } = await client.query(shiftQuery, [date, brigadierId, shipId, holdsCount])

      const holdQuery = `
        INSERT INTO holds (shift_id, number)
        VALUES ($1, $2)
      `

      for (let number = 1; number <= holdsCount; number += 1) {
        // eslint-disable-next-line no-await-in-loop
        await client.query(holdQuery, [rows[0].id, number])
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
      SELECT s.id,
             s.date,
             s.holds_count,
             s.is_closed,
             sh.name AS ship_name,
             s.is_crew_filled,
             s.is_salary_filled,
             s.is_materials_filled,
             s.is_expenses_filled,
             s.is_photos_filled
      FROM shifts s
      JOIN ships sh ON sh.id = s.ship_id
      WHERE s.brigadier_id = $1 AND s.is_closed = false
      ORDER BY s.date DESC
    `

    const { rows } = await pool.query(query, [brigadierId])
    return rows
  }

  // Ищем активную смену по идентификатору и бригадиру
  async function findActiveByIdAndBrigadier({ shiftId, brigadierId }) {
    const query = `
      SELECT s.id,
             s.date,
             s.holds_count,
             s.is_crew_filled,
             s.is_salary_filled,
             s.is_materials_filled,
             s.is_expenses_filled,
             s.is_photos_filled,
             sh.name AS ship_name
      FROM shifts s
      JOIN ships sh ON sh.id = s.ship_id
      WHERE s.id = $1
        AND s.brigadier_id = $2
        AND s.is_closed = false
      LIMIT 1
    `

    const { rows } = await pool.query(query, [shiftId, brigadierId])
    return rows[0] || null
  }

  // Завершаем смену, отмечая её как закрытую
  async function closeShift(shiftId) {
    const query = `
      UPDATE shifts
      SET is_closed = true,
          updated_at = now()
      WHERE id = $1
      RETURNING *
    `

    const { rows } = await pool.query(query, [shiftId])
    return rows[0] || null
  }

  // TODO: Review for merge — отмечаем блок фото заполненным
  async function markPhotosFilled(shiftId) {
    const query = `
      UPDATE shifts
      SET is_photos_filled = true,
          updated_at = now()
      WHERE id = $1
    `

    await pool.query(query, [shiftId])
  }

  // Загружаем смену с названием судна по идентификатору
  async function getByIdWithShip(shiftId) {
    const query = `
      SELECT s.id,
             s.date,
             s.brigadier_id,
             s.ship_id,
             s.holds_count,
             s.is_closed,
             s.group_message_id,
             sh.name AS ship_name
      FROM shifts s
      JOIN ships sh ON sh.id = s.ship_id
      WHERE s.id = $1
      LIMIT 1
    `

    const { rows } = await pool.query(query, [shiftId])
    return rows[0] || null
  }

  // Сохраняем идентификатор группового сообщения с отчётом
  async function saveGroupMessageId({ shiftId, messageId }) {
    const query = `
      UPDATE shifts
      SET group_message_id = $2,
          updated_at = now()
      WHERE id = $1
    `

    await pool.query(query, [shiftId, messageId])
  }
}

module.exports = { createShiftsRepo }
