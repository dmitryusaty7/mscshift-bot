// Простой логгер для консольного вывода
function createLogger() {
  return {
    info: (message, meta) => console.log(formatMessage('INFO', message, meta)),
    warn: (message, meta) => console.warn(formatMessage('WARN', message, meta)),
    error: (message, meta) => console.error(formatMessage('ERROR', message, meta)),
  }
}

// Форматируем вывод для единообразия
function formatMessage(level, message, meta) {
  const metaString = meta ? ` | ${JSON.stringify(meta)}` : ''
  return `[${level}] ${message}${metaString}`
}

module.exports = { createLogger }
