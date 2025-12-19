// TODO: Review for merge — репозиторий расходов смены
// Русский комментарий: все операции работают через БД, чтобы избежать несогласованности в клиентах
function createExpensesRepo(pool) {
  // TODO: Review for merge — экспортируем доступные методы
  return {
    ensureShiftExpenses,
    getShiftExpenses,
    updateExpenseAmount,
    updateOtherComment,
    updateExpensesFilled,
  }

  // TODO: Review for merge — гарантируем наличие строки расходов при входе в блок
  async function ensureShiftExpenses(shiftId) {
    await pool.query(
      `
        -- Гарантируем наличие строки расходов для смены
        INSERT INTO public.shift_expenses (shift_id)
        VALUES ($1)
        ON CONFLICT (shift_id) DO NOTHING;
      `,
      [shiftId]
    )
  }

  // TODO: Review for merge — загружаем текущие значения расходов для хаба
  async function getShiftExpenses(shiftId) {
    const { rows } = await pool.query(
      `
        -- Получаем текущие значения расходов
        SELECT food, materials, taxi, other, other_comment, total_expenses
        FROM public.shift_expenses
        WHERE shift_id = $1;
      `,
      [shiftId]
    )

    return rows[0] || null
  }

  // TODO: Review for merge — обновляем сумму выбранной категории и пересчитываем итог
  async function updateExpenseAmount({ shiftId, column, value }) {
    const allowed = new Set(['food', 'materials', 'taxi', 'other'])

    if (!allowed.has(column)) {
      throw new Error('Недопустимое поле расходов для обновления')
    }

    await ensureShiftExpenses(shiftId)

    const query = `
      -- Обновляем сумму расходов и пересчитываем общий итог
      UPDATE public.shift_expenses
      SET ${column} = $2,
          total_expenses = COALESCE(food, 0) + COALESCE(materials, 0) + COALESCE(taxi, 0) + COALESCE(other, 0),
          updated_at = now()
      WHERE shift_id = $1;
    `

    const res = await pool.query(query, [shiftId, value])

    if (res.rowCount === 0) {
      // Русский комментарий: при отсутствующей строке повторяем после ensure
      await ensureShiftExpenses(shiftId)
      await pool.query(query, [shiftId, value])
    }
  }

  // TODO: Review for merge — сохраняем комментарий к прочим расходам
  async function updateOtherComment({ shiftId, comment }) {
    await ensureShiftExpenses(shiftId)

    await pool.query(
      `
        -- Сохраняем комментарий к прочим расходам
        UPDATE public.shift_expenses
        SET other_comment = $2,
            updated_at = now()
        WHERE shift_id = $1;
      `,
      [shiftId, comment]
    )
  }

  // TODO: Review for merge — отмечаем блок расходов заполненным при наличии всех сумм
  async function updateExpensesFilled(shiftId) {
    const { rows } = await pool.query(
      `
        -- Проверяем наличие всех сумм расходов
        SELECT (food IS NOT NULL) AS has_food,
               (materials IS NOT NULL) AS has_materials,
               (taxi IS NOT NULL) AS has_taxi,
               (other IS NOT NULL) AS has_other
        FROM public.shift_expenses
        WHERE shift_id = $1;
      `,
      [shiftId]
    )

    const flags = rows[0]

    if (!flags) {
      return false
    }

    if (flags.has_food && flags.has_materials && flags.has_taxi && flags.has_other) {
      await pool.query(
        `
          -- Обновляем статус заполнения расходов в смене
          UPDATE public.shifts
          SET is_expenses_filled = true,
              updated_at = now()
          WHERE id = $1;
        `,
        [shiftId]
      )
      return true
    }

    return false
  }
}

module.exports = { createExpensesRepo }
