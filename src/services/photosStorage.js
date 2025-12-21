const fs = require('fs/promises')
const path = require('path')
const { createDirectusService } = require('./directus')

// TODO: Review for merge — сервис хранения фото трюмов (Directus или локально)
function createPhotosStorage({ logger, directusConfig, uploadsDir }) {
  const directusService = directusConfig ? createDirectusService(directusConfig, logger) : null
  const rootFolderName = directusConfig?.rootFolder || 'MSCShiftBot'

  // TODO: Review for merge — сохраняем фото, полученное из Telegram
  async function saveTelegramPhoto({ bot, fileId, logicalPathParts }) {
    const { buffer, fileName } = await downloadFromTelegram(bot, fileId)
    const safeFileName = buildSafeFileName(fileName)
    const logicalPath = path.posix.join(rootFolderName, ...logicalPathParts, safeFileName)

    if (directusService?.isDirectusEnabled()) {
      const folderId = await directusService.ensureFolderPath(logicalPathParts)
      const uploaded = await directusService.uploadFile(buffer, safeFileName, folderId)

      return {
        diskPath: logicalPath,
        diskPublicUrl: uploaded.publicUrl,
        directusFileId: uploaded.directusFileId,
      }
    }

    const absoluteDir = path.join(uploadsDir, rootFolderName, ...logicalPathParts)
    await fs.mkdir(absoluteDir, { recursive: true })
    const absolutePath = path.join(absoluteDir, safeFileName)
    await fs.writeFile(absolutePath, buffer)

    return {
      diskPath: absolutePath,
      diskPublicUrl: null,
      directusFileId: null,
    }
  }

  // TODO: Review for merge — удаляем файл из Directus или локального хранилища
  async function deleteStoredFile({ directusFileId, diskPath: storedPath }) {
    if (directusFileId && directusService?.isDirectusEnabled()) {
      await directusService.deleteFile(directusFileId)
      return
    }

    if (storedPath) {
      try {
        await fs.unlink(storedPath)
      } catch (error) {
        logger.warn('Не удалось удалить локальный файл фото', { error: error.message })
      }
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
  const baseName = name || `photo-${Date.now()}.jpg`
  return baseName.replace(/[^a-zA-Z0-9а-яА-ЯёЁ_.\-\s]/g, '_')
}

module.exports = { createPhotosStorage }
