// TODO: Review for merge — сервис загрузки фото трюмов в Directus через REST API
function createDirectusUploadService({ baseUrl, token, logger }) {
  // Фото НЕ сохраняются напрямую на диск. Directus управляет хранением файлов самостоятельно через API.
  if (!baseUrl || !token) {
    throw new Error('Directus не настроен: требуется DIRECTUS_URL и DIRECTUS_TOKEN')
  }

  // TODO: Review for merge — загружаем файл-буфер в Directus с метаданными
  async function uploadFile({ buffer, filename, title, mimeType, folderId }) {
    try {
      const form = new FormData()
      const effectiveMimeType = mimeType || 'image/jpeg'
      const targetFolderId = folderId || process.env.DIRECTUS_UPLOAD_FOLDER_ID

      form.append('file', new Blob([buffer]), filename || 'photo.jpg', { type: effectiveMimeType })

      if (title) {
        form.append('title', title)
      }

      if (filename) {
        form.append('filename_download', filename)
      }

      if (effectiveMimeType) {
        form.append('type', effectiveMimeType)
      }

      if (targetFolderId) {
        form.append('folder', targetFolderId)
      }

      const response = await fetch(`${baseUrl}/files`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: form,
      })

      const payload = await safeJson(response)

      if (!response.ok) {
        logger.error('Directus вернул ошибку при загрузке файла', {
          status: response.status,
          statusText: response.statusText,
          payload,
        })
        throw new Error('Directus не смог принять файл')
      }

      const fileId = payload?.data?.id
      const filenameDisk = payload?.data?.filename_disk

      if (!fileId) {
        throw new Error('Directus не вернул идентификатор файла')
      }

      return { fileId, filenameDisk }
    } catch (error) {
      logger.error('Сбой загрузки фото в Directus', { error: error.message })
      throw error
    }
  }

  // TODO: Review for merge — обёртка для старого вызова без метаданных
  async function uploadBuffer({ buffer, filename, mimeType }) {
    return uploadFile({ buffer, filename, mimeType })
  }

  // TODO: Review for merge — удаляем файл в Directus по идентификатору
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

  // TODO: Review for merge — безопасно парсим JSON для диагностики
  async function safeJson(response) {
    try {
      return await response.json()
    } catch (error) {
      logger.warn('Не удалось распарсить ответ Directus как JSON', { error: error.message })
      return null
    }
  }

  return { uploadFile, uploadBuffer, deleteFile }
}

module.exports = { createDirectusUploadService }
