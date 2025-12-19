// TODO: Review for merge — белый список должен быть объявлен до использования, иначе получаем TDZ
// Русский комментарий: при обращении к const до инициализации возникает TDZ, поэтому кладём его в начало модуля
const EXPENSE_COLUMNS = {
  food: 'food_amount',
  materials: 'materials_amount',
  taxi: 'taxi_amount',
  other: 'other_amount',
}

// TODO: Review for merge — репозиторий расходов смены
// Русский комментарий: все операции работают через БД, чтобы избежать несогласованности в клиентах
function createExpensesRepo(pool) {
  // TODO: Review for merge — экспортируем доступные методы
  return {
    ensureShiftExpensesRow,
    getShiftExpenses,
    saveExpenseAmount,
    saveOtherComment,
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

  // TODO: Review for merge — обновляем сумму выбранной категории без смешивания с текстовыми полями
  async function saveExpenseAmount({ shiftId, kind, amountRub }) {
    const column = EXPENSE_COLUMNS[kind]

    if (!column) {
      throw new Error('Недопустимое поле расходов для обновления')
    }

    const amount = Number.parseInt(amountRub, 10)

    if (!Number.isFinite(amount) || amount < 0) {
      throw new Error('Сумма расходов должна быть неотрицательным числом')
    }

    await ensureShiftExpensesRow(shiftId)

    // TODO: Review for merge — обновляем сумму и total_expenses одним запросом без мультистейтмента
    // Русский комментарий: node-postgres по умолчанию не исполняет несколько операторов; используем один UPDATE с COALESCE и обязательным WHERE
    const sql = `
      UPDATE public.shift_expenses
      SET ${column} = $2::numeric,
          total_expenses = COALESCE(food_amount,0) + COALESCE(materials_amount,0) + COALESCE(taxi_amount,0) + COALESCE(other_amount,0),
          updated_at = now()
      WHERE shift_id = $1
      RETURNING food_amount, materials_amount, taxi_amount, other_amount, total_expenses;
    `

    await pool.query(sql, [shiftId, amount])
  }

  // TODO: Review for merge — сохраняем комментарий к прочим расходам отдельно от числовых сумм
  // Русский комментарий: текст нельзя смешивать с числовыми параметрами, иначе Postgres выдаёт ошибку типов
  async function saveOtherComment({ shiftId, comment }) {
    await ensureShiftExpensesRow(shiftId)

    await pool.query(
      `
        -- TODO: Review for merge
        -- Сохраняем комментарий к «Прочее» отдельно (text)
        UPDATE public.shift_expenses
        SET other_comment = $2::text,
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
