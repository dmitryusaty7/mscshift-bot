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

  return buttons
}

function buildBackKeyboard(backText) {
  return [[{ text: backText }]]
}

function buildShiftMenuNavigationKeyboard({ backText, completeText, statuses }) {
  const rows = []

  // Русский комментарий: кнопку завершения показываем только когда все разделы заполнены
  if (isShiftComplete(statuses)) {
    rows.push([{ text: completeText }])
  }

  rows.push([{ text: backText }])

  return rows
}

module.exports = { buildShiftMenuKeyboard, buildBackKeyboard, buildShiftMenuNavigationKeyboard }
