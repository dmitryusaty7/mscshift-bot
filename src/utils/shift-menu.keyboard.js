// Построитель клавиатур для меню смены

function buildShiftMenuKeyboard({ statuses }) {
  const buttons = [
    [{ text: '👷 Состав бригады', callback_data: 'shift:crew' }],
    [{ text: '💰 Заработная плата', callback_data: 'shift:wages' }],
    [{ text: '📦 Материалы', callback_data: 'shift:materials' }],
    [{ text: '🧾 Расходы', callback_data: 'shift:expenses' }],
    [{ text: '🖼 Фото трюмов', callback_data: 'shift:photos' }],
  ]

  if (statuses && statuses.crewFilled && statuses.wagesFilled && statuses.materialsFilled && statuses.expensesFilled && statuses.photosFilled) {
    buttons.push([{ text: '✅ Завершить смену', callback_data: 'shift:complete' }])
  }

  return buttons
}

function buildBackKeyboard(backText) {
  return [[{ text: backText }]]
}

module.exports = { buildShiftMenuKeyboard, buildBackKeyboard }
