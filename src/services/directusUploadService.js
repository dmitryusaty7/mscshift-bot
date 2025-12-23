// TODO: Review for merge — сервис загрузки фото трюмов в Directus через REST API
const FormData = require('form-data')

function createDirectusUploadService({ baseUrl, token, logger }) {
  // Фото НЕ сохраняются напрямую на диск. Directus управляет хранением файлов самостоятельно через API.
  if (!baseUrl || !token) {
    throw new Error('Directus не настроен: требуется DIRECTUS_URL и DIRECTUS_TOKEN')
  }

  // Загружаем файл-буфер в Directus с метаданными. Папка должна быть разрешена заранее.
  async function uploadFile({ buffer, filename, title, mimeType, folderId }) {
    try {
      if (!folderId) {
        throw new Error('Не указан идентификатор папки Directus для загрузки файла')
      }

      const form = new FormData()
      const effectiveMimeType = mimeType || 'image/jpeg'

      form.append('file', buffer, {
        filename: filename || 'photo.jpg',
        contentType: effectiveMimeType,
      })

      if (title) {
        form.append('title', title)
      }

      if (filename) {
        form.append('filename_download', filename)
      }

      if (effectiveMimeType) {
        form.append('type', effectiveMimeType)
      }

      form.append('folder', String(folderId))
      logger.info('Загрузка файла в папку Directus', { folderId })

      const response = await fetch(`${baseUrl}/files`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          ...form.getHeaders(),
        },
        body: form,
      })

      const payload = await safeJson(response)

      logger.info('Ответ Directus на загрузку файла', {
        payloadKeys: payload ? Object.keys(payload) : null,
        dataKeys: payload?.data ? Object.keys(payload.data) : null,
        dataId: payload?.data?.id,
      })

      if (!response.ok) {
        logger.error('Directus вернул ошибку при загрузке файла', {
          status: response.status,
          statusText: response.statusText,
          payload,
        })
        throw new Error('Directus не смог принять файл')
      }

      const normalized = normalizePayload(payload)

      logger.info('Файл успешно загружен в Directus', { id: normalized.id })

      return normalized
    } catch (error) {
      logger.error('Сбой загрузки фото в Directus', { error: error.message })
      throw error
    }
  }

  // Обёртка для старого вызова без метаданных
  async function uploadBuffer({ buffer, filename, mimeType, folderId }) {
    return uploadFile({ buffer, filename, mimeType, folderId })
  }

  // Удаляем файл в Directus по идентификатору
  async function deleteFile(fileId) {
    if (!fileId) {
      return
    }

    try {
      const response = await fetch(`${baseUrl}/files/${fileId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      if (!response.ok) {
        const payload = await safeJson(response)
        logger.error('Directus не смог удалить файл', {
          fileId,
          status: response.status,
          statusText: response.statusText,
          payload,
        })
      }
    } catch (error) {
      logger.error('Сбой удаления файла в Directus', { error: error.message, fileId })
    }
  }

  // Безопасно парсим JSON для диагностики
  async function safeJson(response) {
    try {
      return await response.json()
    } catch (error) {
      logger.warn('Не удалось распарсить ответ Directus как JSON', { error: error.message })
      return null
    }
  }

  // Приводим ответ Directus к ожидаемой структуре и валидируем id
  function normalizePayload(payload) {
    const id = payload?.data?.id

    if (!id || typeof id !== 'string') {
      logger.error('Directus вернул некорректный ответ при загрузке файла', { payload })
      throw new Error('Directus не вернул идентификатор файла')
    }

    return {
      id,
      folder: payload.data.folder || null,
      title: payload.data.title || null,
      filename_download: payload.data.filename_download || null,
      type: payload.data.type || null,
    }
  }

  return { uploadFile, uploadBuffer, deleteFile }
}

  module.exports = { createDirectusUploadService }
