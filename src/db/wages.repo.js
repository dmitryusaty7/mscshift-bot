// Репозиторий для работы с заработной платой
function createWagesRepo(pool) {
  // TODO: Review for merge — экспортируем доступные методы
  return {
    ensureShiftWages,
    getShiftWages,
    getWorkerWages,
    upsertRoleAmount,
    upsertWorkerWage,
    recalcWorkersTotal,
    markSalaryFilled,
    deleteWorkerWage,
    invalidateSalaryFlag,
  }

  // TODO: Review for merge — создаём запись shift_wages, если её ещё нет
  async function ensureShiftWages(shiftId) {
    const query = `
      INSERT INTO shift_wages (shift_id)
      VALUES ($1)
      ON CONFLICT (shift_id) DO NOTHING
      RETURNING shift_id
    `

    const { rows } = await pool.query(query, [shiftId])
    return rows[0] || null
  }

  // TODO: Review for merge — получаем агрегированные суммы смены
  async function getShiftWages(shiftId) {
    const query = `
      SELECT shift_id,
             brigadier_amount,
             deputy_amount,
             driver_amount,
             workers_total
      FROM shift_wages
      WHERE shift_id = $1
      LIMIT 1
    `

    const { rows } = await pool.query(query, [shiftId])
    return rows[0] || null
  }

  // TODO: Review for merge — получаем суммы по рабочим
  async function getWorkerWages(shiftId) {
    const query = `
      SELECT worker_id, amount
      FROM shift_worker_wages
      WHERE shift_id = $1
      ORDER BY worker_id
    `

    const { rows } = await pool.query(query, [shiftId])
    return rows
  }

  // TODO: Review for merge — сохраняем сумму для роли в shift_wages
  async function upsertRoleAmount({ shiftId, role, amount }) {
    const columns = {
      brigadier: 'brigadier_amount',
      deputy: 'deputy_amount',
      driver: 'driver_amount',
    }

    const column = columns[role]

    if (!column) {
      throw new Error('Неизвестная роль для сохранения зарплаты')
    }

    const query = `
      INSERT INTO shift_wages (shift_id, ${column})
      VALUES ($1, $2)
      ON CONFLICT (shift_id) DO UPDATE
        SET ${column} = EXCLUDED.${column},
            updated_at = now()
      RETURNING shift_id
    `

    await pool.query(query, [shiftId, amount])
    return true
  }

  // TODO: Review for merge — сохраняем сумму для рабочего
  async function upsertWorkerWage({ shiftId, workerId, amount }) {
    const query = `
      INSERT INTO shift_worker_wages (shift_id, worker_id, amount)
      VALUES ($1, $2, $3)
      ON CONFLICT (shift_id, worker_id) DO UPDATE
        SET amount = EXCLUDED.amount
    `

    await pool.query(query, [shiftId, workerId, amount])
    return true
  }

  // TODO: Review for merge — пересчитываем итог по рабочим в shift_wages
  async function recalcWorkersTotal(shiftId) {
    await ensureShiftWages(shiftId)
    const query = `
      UPDATE shift_wages sw
      SET workers_total = COALESCE((
        SELECT SUM(amount) FROM shift_worker_wages WHERE shift_id = $1
      ), 0),
          updated_at = now()
      WHERE sw.shift_id = $1
      RETURNING workers_total
    `

    const { rows } = await pool.query(query, [shiftId])
    return rows[0]?.workers_total ?? 0
  }

  // TODO: Review for merge — отмечаем раздел зарплаты заполненным
  async function markSalaryFilled(shiftId) {
    const query = `
      UPDATE shifts
      SET is_salary_filled = true,
          updated_at = now()
      WHERE id = $1
    `

    await pool.query(query, [shiftId])
    return true
  }

  // TODO: Review for merge — удаляем сумму рабочего при его удалении
  async function deleteWorkerWage({ shiftId, workerId }) {
    const query = 'DELETE FROM shift_worker_wages WHERE shift_id = $1 AND worker_id = $2'
    await pool.query(query, [shiftId, workerId])
    return true
  }

  // TODO: Review for merge — сбрасываем флаг заполненности зарплаты
  async function invalidateSalaryFlag(shiftId) {
    const query = `
      UPDATE shifts
      SET is_salary_filled = false,
          updated_at = now()
      WHERE id = $1
    `

    await pool.query(query, [shiftId])
    return true
  }
}

module.exports = { createWagesRepo }
