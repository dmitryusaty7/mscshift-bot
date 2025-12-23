// TODO: Review for merge — сервис загрузки фото трюмов в Directus через REST API
const FormData = require('form-data')
const path = require('path')

function createDirectusUploadService({ baseUrl, token, logger }) {
  // Фото НЕ сохраняются напрямую на диск. Directus управляет хранением файлов самостоятельно через API.
  if (!baseUrl || !token) {
    throw new Error('Directus не настроен: требуется DIRECTUS_URL и DIRECTUS_TOKEN')
  }

  // Загружаем файл-буфер в Directus с метаданными. Папка должна быть разрешена заранее.
  async function uploadFile({ buffer, filename, title, mimeType, folderId }) {
    try {
      const targetFolderId = folderId || process.env.DIRECTUS_UPLOAD_FOLDER_ID
      const effectiveMimeType = mimeType || 'image/jpeg'
      const resolvedFilename = sanitizeFilename(filename) || 'photo.jpg'

      if (!targetFolderId) {
        throw new Error('Не указан идентификатор папки Directus для загрузки файла')
      }

      const form = new FormData()

      logger.info('Начало загрузки файла в Directus', {
        folderId: targetFolderId,
        filename: resolvedFilename,
        mimeType: effectiveMimeType,
        bufferSize: buffer?.length,
      })

      form.append('file', buffer, {
        filename: resolvedFilename,
        contentType: effectiveMimeType,
      })

      if (title) {
        form.append('title', title)
      }

      form.append('folder', String(targetFolderId))

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
        status: response.status,
        statusText: response.statusText,
        dataId: payload?.data?.id,
      })

      if (!response.ok) {
        logger.error('Directus вернул ошибку при загрузке файла', {
          status: response.status,
          statusText: response.statusText,
          payload,
          errors: payload?.errors,
        })
        throw new Error('Directus не смог принять файл')
      }

      const normalized = normalizePayload(payload)

      logger.info('Файл успешно загружен в Directus', { status: response.status, id: normalized.id })

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
    const data = payload?.data
    const id = data?.id

    if (!id || typeof id !== 'string') {
      logger.error('Directus вернул некорректный ответ при загрузке файла', { payload })
      throw new Error('Directus не вернул идентификатор файла')
    }

    return data
  }

  function sanitizeFilename(name) {
    const raw = String(name || '').trim()

    if (!raw) {
      return null
    }

    const base = path.basename(raw)

    return base.replace(/[\\]/g, '_')
  }

  return { uploadFile, uploadBuffer, deleteFile }
}

module.exports = { createDirectusUploadService }
