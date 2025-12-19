// TODO: Review for merge — репозиторий расходов смены
// Русский комментарий: все операции работают через БД, чтобы избежать несогласованности в клиентах
function createExpensesRepo(pool) {
  // TODO: Review for merge — экспортируем доступные методы
  return {
    ensureShiftExpensesRow,
    getShiftExpenses,
    updateExpenseAmount,
    updateOtherComment,
    updateExpensesFilled,
    markExpensesFilledOnExit,
  }

  // TODO: Review for merge — гарантируем наличие строки расходов при входе в блок
  // Русский комментарий: без вставки `ON CONFLICT DO NOTHING` дальнейшие апдейты падали из-за отсутствия записи
  async function ensureShiftExpensesRow(shiftId) {
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
        -- TODO: Review for merge
        -- Читаем расходы по смене (источник истины — БД)
        SELECT
          food_amount,
          materials_amount,
          taxi_amount,
          other_amount,
          other_comment,
          total_expenses
        FROM public.shift_expenses
        WHERE shift_id = $1;
      `,
      [shiftId]
    )

    return rows[0] || null
  }

  // TODO: Review for merge — обновляем сумму выбранной категории и пересчитываем итог
  async function updateExpenseAmount({ shiftId, column, value }) {
    const allowed = new Set(['food_amount', 'materials_amount', 'taxi_amount', 'other_amount'])

    if (!allowed.has(column)) {
      throw new Error('Недопустимое поле расходов для обновления')
    }

    await ensureShiftExpensesRow(shiftId)

    const queryMap = {
      food_amount: `
        -- TODO: Review for merge
        -- Сохраняем питание и пересчитываем итог
        UPDATE public.shift_expenses
        SET food_amount = $2,
            total_expenses = COALESCE($2,0) + COALESCE(materials_amount,0) + COALESCE(taxi_amount,0) + COALESCE(other_amount,0),
            updated_at = now()
        WHERE shift_id = $1;
      `,
      materials_amount: `
        -- TODO: Review for merge
        -- Сохраняем расходники и пересчитываем итог
        UPDATE public.shift_expenses
        SET materials_amount = $2,
            total_expenses = COALESCE(food_amount,0) + COALESCE($2,0) + COALESCE(taxi_amount,0) + COALESCE(other_amount,0),
            updated_at = now()
        WHERE shift_id = $1;
      `,
      taxi_amount: `
        -- TODO: Review for merge
        -- Сохраняем такси и пересчитываем итог
        UPDATE public.shift_expenses
        SET taxi_amount = $2,
            total_expenses = COALESCE(food_amount,0) + COALESCE(materials_amount,0) + COALESCE($2,0) + COALESCE(other_amount,0),
            updated_at = now()
        WHERE shift_id = $1;
      `,
      other_amount: `
        -- TODO: Review for merge
        -- Сохраняем прочее и пересчитываем итог
        UPDATE public.shift_expenses
        SET other_amount = $2,
            total_expenses = COALESCE(food_amount,0) + COALESCE(materials_amount,0) + COALESCE(taxi_amount,0) + COALESCE($2,0),
            updated_at = now()
        WHERE shift_id = $1;
      `,
    }

    const query = queryMap[column]

    if (!query) {
      throw new Error('Нет SQL для указанной колонки расходов')
    }

    const res = await pool.query(query, [shiftId, value])

    if (res.rowCount === 0) {
      // Русский комментарий: при отсутствующей строке повторяем после ensure
      await ensureShiftExpensesRow(shiftId)
      await pool.query(query, [shiftId, value])
    }
  }

  // TODO: Review for merge — сохраняем комментарий к прочим расходам
  async function updateOtherComment({ shiftId, comment }) {
    await ensureShiftExpensesRow(shiftId)

    await pool.query(
      `
        -- TODO: Review for merge
        -- Сохраняем комментарий к «Прочее»
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
        SELECT (food_amount IS NOT NULL) AS has_food,
               (materials_amount IS NOT NULL) AS has_materials,
               (taxi_amount IS NOT NULL) AS has_taxi,
               (other_amount IS NOT NULL) AS has_other
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

  // TODO: Review for merge — фиксируем завершение блока при выходе в меню смены
  async function markExpensesFilledOnExit(shiftId) {
    await pool.query(
      `
        -- TODO: Review for merge
        -- Фиксируем завершение блока расходов при выходе в меню смены
        UPDATE public.shifts
        SET is_expenses_filled = true,
            updated_at = now()
        WHERE id = $1;
      `,
      [shiftId]
    )
  }
}

module.exports = { createExpensesRepo }
