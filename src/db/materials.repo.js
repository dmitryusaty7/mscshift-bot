// Репозиторий для работы с расходом материалов смены
// TODO: Review for merge — все операции строго работают с фактическим расходом
function createMaterialsRepo(pool) {
  // TODO: Review for merge — экспортируем доступные методы
  return {
    ensureShiftMaterials,
    getShiftMaterials,
    updateMaterialUsed,
    markMaterialsFilled,
  }

  // TODO: Review for merge — гарантируем наличие строки материалов для смены
  async function ensureShiftMaterials(shiftId) {
    await ensureShiftMaterialsRow(pool, shiftId)
    return { shift_id: shiftId }
  }

  // TODO: Review for merge — загружаем текущие значения расхода материалов
  async function getShiftMaterials(shiftId) {
    const query = `
      -- Загружаем текущие значения расхода материалов
      SELECT
        pvd_3m_used,
        pvd_6m_used,
        pvd_12m_used,
        pvd_14m_used,
        pvh_tubes_used,
        tape_used
      FROM public.shift_materials
      WHERE shift_id = $1
      LIMIT 1
    `

    const { rows } = await pool.query(query, [shiftId])
    return rows[0] || null
  }

  // TODO: Review for merge — сохраняем расход материала по указанному полю
  async function updateMaterialUsed({ shiftId, column, value }) {
    const allowedColumns = new Set([
      'pvd_3m_used',
      'pvd_6m_used',
      'pvd_12m_used',
      'pvd_14m_used',
      'pvh_tubes_used',
      'tape_used',
    ])

    if (!allowedColumns.has(column)) {
      throw new Error('Попытка обновить недопустимое поле материалов')
    }

    await ensureShiftMaterialsRow(pool, shiftId)

    const query = `
      -- Сохраняем фактический расход выбранного материала
      UPDATE public.shift_materials
      SET ${column} = $2,
          updated_at = now()
      WHERE shift_id = $1
    `

    const res = await pool.query(query, [shiftId, value])

    // TODO: Review for merge — если строка не обновилась, гарантируем её наличие и повторяем запрос
    if (res.rowCount === 0) {
      await ensureShiftMaterialsRow(pool, shiftId)
      await pool.query(
        `
          -- Повторное сохранение расхода материала после гарантирования строки
          UPDATE public.shift_materials
          SET ${column} = $2,
              updated_at = now()
          WHERE shift_id = $1
        `,
        [shiftId, value]
      )
    }

    return true
  }

  // TODO: Review for merge — отмечаем раздел материалов заполненным
  async function markMaterialsFilled(shiftId) {
    const query = `
      -- Фиксируем факт заполнения материалов
      UPDATE public.shifts
      SET is_materials_filled = true,
          updated_at = now()
      WHERE id = $1
    `

    await pool.query(query, [shiftId])
    return true
  }
}

// TODO: Review for merge — гарантируем наличие строки материалов для смены
async function ensureShiftMaterialsRow(db, shiftId) {
  // Русский комментарий: без этой вставки UPDATE может не затронуть ни одной строки при отсутствии записи
  await db.query(
    `
      -- Гарантируем наличие строки материалов для текущей смены
      INSERT INTO public.shift_materials (shift_id)
      VALUES ($1)
      ON CONFLICT (shift_id) DO NOTHING;
    `,
    [shiftId]
  )
}

module.exports = { createMaterialsRepo, ensureShiftMaterialsRow }
