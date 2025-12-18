// Построитель клавиатур для меню смены
const { isShiftComplete, statusIcon } = require('./shift-status')

function buildShiftMenuKeyboard({ statuses }) {
  const safeStatuses = statuses || {}
  const buttons = [
    [{ text: `${statusIcon(safeStatuses.crewFilled)} 👷 Состав бригады`, callback_data: 'shift:crew' }],
    [{ text: `${statusIcon(safeStatuses.wagesFilled)} 💰 Заработная плата`, callback_data: 'shift:wages' }],
    [{ text: `${statusIcon(safeStatuses.materialsFilled)} 📦 Материалы`, callback_data: 'shift:materials' }],
    [{ text: `${statusIcon(safeStatuses.expensesFilled)} 🧾 Расходы`, callback_data: 'shift:expenses' }],
    [{ text: `${statusIcon(safeStatuses.photosFilled)} 🖼 Фото трюмов`, callback_data: 'shift:photos' }],
  ]

  if (isShiftComplete(safeStatuses)) {
    buttons.push([{ text: '✅ Завершить смену', callback_data: 'shift:complete' }])
  }

  return buttons
}

function buildBackKeyboard(backText) {
  return [[{ text: backText }]]
}

module.exports = { buildShiftMenuKeyboard, buildBackKeyboard }
