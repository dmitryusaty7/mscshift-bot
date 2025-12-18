// Репозиторий для работы с таблицами состава бригады
function createCrewRepo(pool) {
  return {
    getCrewByShift,
    findOrCreateDriver,
    findOrCreateWorker,
    upsertDriver,
    updateDeputy,
    clearDeputy,
    addWorkerToShift,
    removeWorkerFromShift,
    recalcCrewFilled,
  }

  // Получаем текущий состав бригады по смене
  async function getCrewByShift(shiftId) {
    const crewQuery = `
      SELECT sc.shift_id,
             sc.driver_id,
             d.full_name     AS driver_full_name,
             sc.deputy_worker_id,
             dw.full_name    AS deputy_full_name
      FROM shift_crew sc
      LEFT JOIN drivers d ON d.id = sc.driver_id
      LEFT JOIN workers dw ON dw.id = sc.deputy_worker_id
      WHERE sc.shift_id = $1
      LIMIT 1
    `

    const workersQuery = `
      SELECT sw.worker_id, w.full_name
      FROM shift_workers sw
      JOIN workers w ON w.id = sw.worker_id
      WHERE sw.shift_id = $1
      ORDER BY w.full_name
    `

    const [crewResult, workersResult] = await Promise.all([
      pool.query(crewQuery, [shiftId]),
      pool.query(workersQuery, [shiftId]),
    ])

    const crewRow = crewResult.rows[0]

    return {
      driver: crewRow?.driver_id
        ? { id: crewRow.driver_id, fullName: crewRow.driver_full_name }
        : null,
      deputy: crewRow?.deputy_worker_id
        ? { id: crewRow.deputy_worker_id, fullName: crewRow.deputy_full_name }
        : null,
      workers: workersResult.rows.map((row) => ({ id: row.worker_id, fullName: row.full_name })),
    }
  }

  // Ищем или создаём водителя по ФИО
  async function findOrCreateDriver(fullName) {
    const existing = await pool.query(
      'SELECT id FROM drivers WHERE LOWER(full_name) = LOWER($1) LIMIT 1',
      [fullName],
    )

    if (existing.rows[0]) {
      return existing.rows[0]
    }

    const { rows } = await pool.query(
      'INSERT INTO drivers (full_name, status) VALUES ($1, $2) RETURNING id',
      [fullName, 'active'],
    )

    return rows[0]
  }

  // Ищем или создаём рабочего по ФИО
  async function findOrCreateWorker(fullName) {
    const existing = await pool.query(
      'SELECT id FROM workers WHERE LOWER(full_name) = LOWER($1) LIMIT 1',
      [fullName],
    )

    if (existing.rows[0]) {
      return existing.rows[0]
    }

    const { rows } = await pool.query(
      'INSERT INTO workers (full_name, status) VALUES ($1, $2) RETURNING id',
      [fullName, 'active'],
    )

    return rows[0]
  }

  // Обновляем или создаём запись shift_crew с водителем (и опционально заместителем)
  async function upsertDriver({ shiftId, driverId, deputyWorkerId = null }) {
    const query = `
      INSERT INTO shift_crew (shift_id, driver_id, deputy_worker_id)
      VALUES ($1, $2, $3)
      ON CONFLICT (shift_id) DO UPDATE
        SET driver_id = EXCLUDED.driver_id,
            deputy_worker_id = COALESCE(EXCLUDED.deputy_worker_id, shift_crew.deputy_worker_id),
            updated_at = now()
      RETURNING driver_id, deputy_worker_id
    `

    const { rows } = await pool.query(query, [shiftId, driverId, deputyWorkerId])
    return rows[0]
  }

  // Обновляем заместителя в shift_crew, если запись уже создана
  async function updateDeputy({ shiftId, deputyWorkerId }) {
    const query = `
      UPDATE shift_crew
      SET deputy_worker_id = $2,
          updated_at = now()
      WHERE shift_id = $1
      RETURNING driver_id, deputy_worker_id
    `

    const { rows } = await pool.query(query, [shiftId, deputyWorkerId])
    return rows[0] || null
  }

  // Сбрасываем заместителя
  async function clearDeputy(shiftId) {
    const query = `
      UPDATE shift_crew
      SET deputy_worker_id = NULL,
          updated_at = now()
      WHERE shift_id = $1
      RETURNING driver_id, deputy_worker_id
    `

    const { rows } = await pool.query(query, [shiftId])
    return rows[0] || null
  }

  // Добавляем рабочего к смене
  async function addWorkerToShift({ shiftId, workerId }) {
    const query = `
      INSERT INTO shift_workers (shift_id, worker_id)
      VALUES ($1, $2)
      ON CONFLICT (shift_id, worker_id) DO NOTHING
      RETURNING id
    `

    const { rows } = await pool.query(query, [shiftId, workerId])
    return Boolean(rows[0])
  }

  // Удаляем рабочего из смены
  async function removeWorkerFromShift({ shiftId, workerId }) {
    const query = 'DELETE FROM shift_workers WHERE shift_id = $1 AND worker_id = $2'
    const result = await pool.query(query, [shiftId, workerId])
    return result.rowCount > 0
  }

  // Пересчитываем флаг заполненности состава
  async function recalcCrewFilled(shiftId) {
    const query = `
      UPDATE shifts s
      SET is_crew_filled = (
        EXISTS (
          SELECT 1 FROM shift_crew sc
          WHERE sc.shift_id = s.id AND sc.driver_id IS NOT NULL
        )
        AND EXISTS (
          SELECT 1 FROM shift_workers sw
          WHERE sw.shift_id = s.id
        )
      ),
      updated_at = now()
      WHERE s.id = $1
      RETURNING is_crew_filled
    `

    const { rows } = await pool.query(query, [shiftId])
    return Boolean(rows[0]?.is_crew_filled)
  }
}

module.exports = { createCrewRepo }
