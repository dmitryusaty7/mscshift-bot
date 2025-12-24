// TODO: Review for merge — сервис загрузки фото трюмов в Directus через REST API
const FormData = require('form-data')
const path = require('path')
const { request } = require('undici')

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

      form.append('file', buffer, {
        filename: resolvedFilename,
        contentType: effectiveMimeType,
        knownLength: buffer.length,
      })

      if (title) {
        form.append('title', title)
      }

      if (targetFolderId) {
        form.append('folder', String(targetFolderId))
      }

      const contentLength = await getFormLength(form)

      const headers = {
        Authorization: `Bearer ${token}`,
        ...form.getHeaders(),
        'Content-Length': contentLength,
      }

      logger.info('Directus upload multipart prepared', {
        folderId: targetFolderId,
        filename: resolvedFilename,
        mimeType: effectiveMimeType,
        bufferSize: buffer?.length,
      })

      const response = await request(`${baseUrl}/files`, {
        method: 'POST',
        headers,
        body: form,
      })

      const rawText = await streamToString(response.body)
      let payload

      try {
        payload = JSON.parse(rawText)
      } catch (error) {
        logger.error('Directus вернул не-JSON ответ при загрузке файла', {
          error: error.message,
          rawText,
        })
        throw new Error(`Directus returned non-JSON response: ${rawText}`)
      }

      if (response.statusCode < 200 || response.statusCode >= 300 || !payload?.data?.id) {
        logger.error('Directus upload failed', {
          status: response.statusCode,
          payload,
        })
        throw new Error('Directus upload failed')
      }

      const normalized = normalizePayload(payload)

      logger.info('Directus upload succeeded', {
        status: response.statusCode,
        id: normalized.id,
      })

      return normalized
    } catch (error) {
      logger.error('Сбой загрузки фото в Directus', { error: error.message })
      throw error
    }
  }

  async function patchFileMeta(fileId, { folder, title, filename_download }) {
    if (!fileId) {
      throw new Error('Не передан идентификатор файла Directus для обновления метаданных')
    }

    try {
      const response = await request(`${baseUrl}/files/${fileId}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ folder, title, filename_download }),
      })

      const rawText = await streamToString(response.body)
      let payload

      try {
        payload = JSON.parse(rawText)
      } catch (error) {
        logger.error('Directus вернул не-JSON ответ при обновлении файла', {
          error: error.message,
          rawText,
        })
        throw new Error(`Directus returned non-JSON response: ${rawText}`)
      }

      if (response.statusCode < 200 || response.statusCode >= 300 || !payload?.data?.id) {
        logger.error('Directus patch failed', {
          status: response.statusCode,
          payload,
        })
        throw new Error('Directus patch failed')
      }

      logger.info('Directus файл обновлён', {
        fileId,
        status: response.statusCode,
        folder,
      })

      return payload.data
    } catch (error) {
      logger.error('Сбой обновления метаданных файла в Directus', { error: error.message, fileId })
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

  function getFormLength(form) {
    return new Promise((resolve, reject) => {
      form.getLength((err, length) => {
        if (err) {
          reject(err)
          return
        }

        resolve(length)
      })
    })
  }

  async function streamToString(stream) {
    const chunks = []

    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk))
    }

    return Buffer.concat(chunks).toString('utf8')
  }

  return { uploadFile, uploadBuffer, deleteFile, patchFileMeta }
}

module.exports = { createDirectusUploadService }
