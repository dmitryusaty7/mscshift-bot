const path = require('path')

// Обработка фотографий от пользователей
function registerPhotoHandler({ bot, directusClient, logger, messages }) {
  bot.on('photo', async (msg) => {
    const chatId = msg.chat.id
    const telegramId = msg.from?.id
    const firstName = msg.from?.first_name || ''

    if (!telegramId) {
      logger.error('Не удалось определить telegram_id при получении фото')
      await bot.sendMessage(chatId, messages.systemError)
      return
    }

    const fileId = extractLargestPhotoId(msg.photo)

    if (!fileId) {
      logger.error('Не удалось получить file_id фото из сообщения', { telegramId })
      await bot.sendMessage(chatId, messages.photo.uploadFailed)
      return
    }

    try {
      const fileLink = await bot.getFileLink(fileId)
      const fileInfo = await bot.getFile(fileId)
      const fileName = path.basename(fileInfo?.file_path || `photo-${Date.now()}.jpg`)

      const fileBuffer = await downloadFileToBuffer(fileLink)
      const mimeType = fileInfo?.mime_type || 'image/jpeg'

      const user = await directusClient.ensureUser({ telegramId, firstName })
      const shift = await directusClient.createShift({ userId: user.id })
      const directusFileId = await directusClient.uploadFileFromBuffer(fileBuffer, {
        filename: fileName,
        mimeType,
      })

      await directusClient.attachPhotoToShift({ shiftId: shift.id, fileId: directusFileId })

      await bot.sendMessage(chatId, messages.photo.uploadSuccess)
    } catch (error) {
      logger.error('Ошибка обработки фото для Directus', {
        error: error.message,
        telegramId,
      })
      await bot.sendMessage(chatId, messages.photo.uploadFailed)
    }
  })
}

function extractLargestPhotoId(photos) {
  if (!Array.isArray(photos) || photos.length === 0) {
    return null
  }

  const sorted = [...photos].sort((a, b) => (a.file_size || 0) - (b.file_size || 0))
  return sorted[sorted.length - 1]?.file_id || null
}

async function downloadFileToBuffer(url) {
  const response = await fetch(url)

  if (!response.ok) {
    throw new Error(`Ошибка загрузки файла Telegram: ${response.status}`)
  }

  const arrayBuffer = await response.arrayBuffer()
  return Buffer.from(arrayBuffer)
}

module.exports = { registerPhotoHandler }
