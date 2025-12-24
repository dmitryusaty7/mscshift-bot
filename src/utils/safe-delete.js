const fs = require('fs/promises')

// Безопасное удаление файла с подробным логированием
async function safeDeleteFile({ filePath, logger, meta = {} }) {
  if (!filePath) {
    return { status: 'skipped' }
  }

  try {
    await fs.rm(filePath)
    if (logger) {
      logger.info('Локальный файл удалён', { filePath, ...meta })
    }
    return { status: 'deleted' }
  } catch (error) {
    if (error.code === 'ENOENT') {
      if (logger) {
        logger.warn('Локальный файл уже отсутствует при удалении', { filePath, ...meta })
      }
      return { status: 'missing' }
    }

    if (logger) {
      logger.error('Не удалось удалить локальный файл', { error: error.message, filePath, ...meta })
    }
    throw error
  }
}

module.exports = { safeDeleteFile }
