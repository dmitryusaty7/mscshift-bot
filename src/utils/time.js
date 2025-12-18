// Вспомогательные функции для работы с датами

// Форматируем дату в человекочитаемый вид ДД.MM.ГГГГ (UTC)
function formatDateHuman(date) {
  const safeDate = new Date(date)
  const day = `${safeDate.getUTCDate()}`.padStart(2, '0')
  const month = `${safeDate.getUTCMonth() + 1}`.padStart(2, '0')
  const year = safeDate.getUTCFullYear()
  return `${day}.${month}.${year}`
}

// Преобразование даты в формат YYYY-MM-DD для PostgreSQL
function toPgDate(date) {
  const safeDate = new Date(date)
  const year = safeDate.getUTCFullYear()
  const month = `${safeDate.getUTCMonth() + 1}`.padStart(2, '0')
  const day = `${safeDate.getUTCDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

module.exports = {
  formatDateHuman,
  toPgDate,
}
