// Вспомогательные функции для работы со статусами смен
// TODO: Синхронизировать статусы с БД при любых обновлениях разделов
// TODO: Все статусы смен и полей должны браться из базы, а не вычисляться в коде

// Строим объект статусов по полям записи смены из базы
function buildStatusesFromShift(shift) {
  return {
    crewFilled: Boolean(shift?.is_crew_filled),
    wagesFilled: Boolean(shift?.is_salary_filled),
    materialsFilled: Boolean(shift?.is_materials_filled),
    expensesFilled: Boolean(shift?.is_expenses_filled),
    photosFilled: Boolean(shift?.is_photos_filled),
  }
}

// Проверяем, заполнены ли все разделы смены
function isShiftComplete(statuses) {
  if (!statuses) {
    return false
  }

  return (
    Boolean(statuses.crewFilled) &&
    Boolean(statuses.wagesFilled) &&
    Boolean(statuses.materialsFilled) &&
    Boolean(statuses.expensesFilled) &&
    Boolean(statuses.photosFilled)
  )
}

// Определяем статусный смайлик для кнопок
function statusIcon(filled) {
  return filled ? '✅' : '✍️'
}

module.exports = {
  buildStatusesFromShift,
  isShiftComplete,
  statusIcon,
}
