const fs = require('fs/promises')
const path = require('path')
// TODO: Review for merge — сервис хранения фото трюмов в локальной файловой системе
function createPhotosStorage({ logger, uploadsDir }) {
  const baseDir = uploadsDir || '/uploads'

  // TODO: Review for merge — сохраняем фото, полученное из Telegram
  async function saveTelegramPhoto({ bot, fileId, logicalPathParts }) {
    const { buffer, fileName } = await downloadFromTelegram(bot, fileId)
    const safeFileName = buildSafeFileName(fileName)
    const absoluteDir = path.join(baseDir, ...logicalPathParts)
    await fs.mkdir(absoluteDir, { recursive: true })
    const absolutePath = path.join(absoluteDir, safeFileName)
    await fs.writeFile(absolutePath, buffer)

    return {
      diskPath: absolutePath,
      diskPublicUrl: null,
    }
  }

  // TODO: Review for merge — удаляем файл из локального хранилища, если он есть
  async function deleteStoredFile({ diskPath: storedPath }) {
    if (!storedPath) {
      return
    }

    try {
      await fs.unlink(storedPath)
    } catch (error) {
      logger.warn('Не удалось удалить локальный файл фото', { error: error.message })
    }
  }

  return {
    saveTelegramPhoto,
    deleteStoredFile,
  }
}

// TODO: Review for merge — скачиваем файл из Telegram и возвращаем буфер
async function downloadFromTelegram(bot, fileId) {
  const fileLink = await bot.getFileLink(fileId)
  const fileInfo = await bot.getFile(fileId)
  const fileName = path.basename(fileInfo?.file_path || `photo-${Date.now()}.jpg`)

  const response = await fetch(fileLink)

  if (!response.ok) {
    throw new Error(`Ошибка загрузки файла Telegram: ${response.status}`)
  }

  const arrayBuffer = await response.arrayBuffer()
  return { buffer: Buffer.from(arrayBuffer), fileName }
}

// TODO: Review for merge — безопасное имя файла без опасных символов
function buildSafeFileName(name) {
  const cleanedOriginal = name ? name.replace(/[^a-zA-Z0-9а-яА-ЯёЁ_.\-\s]/g, '_') : 'photo.jpg'
  const withExt = cleanedOriginal.endsWith('.jpg') ? cleanedOriginal : `${cleanedOriginal}.jpg`
  return `${Date.now()}_${withExt}`
}

module.exports = { createPhotosStorage }
