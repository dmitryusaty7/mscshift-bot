// TODO: Review for merge — сервис загрузки фото трюмов в Directus через REST API
function createDirectusUploadService({ baseUrl, token, logger }) {
  // Фото НЕ сохраняются напрямую на диск. Directus управляет хранением файлов самостоятельно через API.
  if (!baseUrl || !token) {
    throw new Error('Directus не настроен: требуется DIRECTUS_URL и DIRECTUS_TOKEN')
  }

  // Загружаем файл-буфер в Directus с метаданными и поддержкой вложенных папок
  async function uploadFile({ buffer, filename, title, mimeType, folderId, shiftId, holdId, date }) {
    try {
      const form = new FormData()
      const effectiveMimeType = mimeType || 'image/jpeg'
      const targetFolderId = await resolveTargetFolder({ folderId, shiftId, holdId, date })

      const fileBlob = new Blob([buffer], { type: effectiveMimeType })
      form.append('file', fileBlob, filename || 'photo.jpg')

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
        form.append('folder', String(targetFolderId))
        logger.info('Загрузка файла в папку Directus', { folderId: targetFolderId })
      } else {
        logger.warn('Папка загрузки Directus не указана, файл попадёт в корень', {})
      }

      const response = await fetch(`${baseUrl}/files`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: form,
      })

      const payload = await safeJson(response)

      logger.info('Ответ Directus на загрузку файла', { payload })

      if (!response.ok) {
        logger.error('Directus вернул ошибку при загрузке файла', {
          status: response.status,
          statusText: response.statusText,
          payload,
        })
        throw new Error('Directus не смог принять файл')
      }

      const fileId = validateFileId(payload)
      const filenameDisk = typeof payload?.data?.filename_disk === 'string' ? payload.data.filename_disk : null

      logger.info('Файл успешно загружен в Directus', { fileId })

      return { fileId, filenameDisk }
    } catch (error) {
      logger.error('Сбой загрузки фото в Directus', { error: error.message })
      throw error
    }
  }

  // Обёртка для старого вызова без метаданных
  async function uploadBuffer({ buffer, filename, mimeType }) {
    return uploadFile({ buffer, filename, mimeType })
  }

  // Создаём или возвращаем существующую папку в Directus по имени и родителю
  async function getOrCreateFolder(parentId, name) {
    if (!name || typeof name !== 'string') {
      throw new Error('Имя папки для Directus не задано')
    }

    const searchParams = new URLSearchParams()
    searchParams.set('filter[name][_eq]', name)
    searchParams.set('limit', '1')

    if (parentId) {
      searchParams.set('filter[parent][_eq]', parentId)
    } else {
      searchParams.set('filter[parent][_null]', 'true')
    }

    const searchResponse = await fetch(`${baseUrl}/folders?${searchParams.toString()}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })

    const searchPayload = await safeJson(searchResponse)

    if (!searchResponse.ok) {
      logger.error('Directus вернул ошибку при поиске папки', {
        status: searchResponse.status,
        statusText: searchResponse.statusText,
        parentId,
        name,
        payload: searchPayload,
      })
      throw new Error('Directus не смог найти папку')
    }

    const existing = Array.isArray(searchPayload?.data) ? searchPayload.data[0] : null

    if (existing?.id) {
      return existing.id
    }

    const createResponse = await fetch(`${baseUrl}/folders`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name, parent: parentId || null }),
    })

    const createPayload = await safeJson(createResponse)

    if (!createResponse.ok) {
      logger.error('Directus вернул ошибку при создании папки', {
        status: createResponse.status,
        statusText: createResponse.statusText,
        parentId,
        name,
        payload: createPayload,
      })
      throw new Error('Directus не смог создать папку')
    }

    const folderId = validateFolderId(createPayload)
    logger.info('Создана новая папка в Directus', { folderId, parentId, name })
    return folderId
  }

  // Собираем и создаём иерархию папок: год/месяц/день/shift_X/hold_Y
  async function ensureHoldFolder({ shiftId, holdId, date = new Date(), rootFolderId }) {
    if (!shiftId || !holdId) {
      throw new Error('Для построения иерархии папок требуется shiftId и holdId')
    }

    const baseFolderId = rootFolderId || process.env.DIRECTUS_UPLOAD_FOLDER_ID || null

    if (!baseFolderId) {
      throw new Error('Не указан базовый идентификатор папки Directus (DIRECTUS_UPLOAD_FOLDER_ID)')
    }
    const yearFolder = await getOrCreateFolder(baseFolderId, String(date.getFullYear()))
    const monthFolder = await getOrCreateFolder(yearFolder, String(date.getMonth() + 1).padStart(2, '0'))
    const dayFolder = await getOrCreateFolder(monthFolder, String(date.getDate()).padStart(2, '0'))
    const shiftFolder = await getOrCreateFolder(dayFolder, `shift_${shiftId}`)
    const holdFolder = await getOrCreateFolder(shiftFolder, `hold_${holdId}`)

    logger.info('Иерархия папок Directus подготовлена', {
      rootFolderId: baseFolderId,
      yearFolder,
      monthFolder,
      dayFolder,
      shiftFolder,
      holdFolder,
    })

    return holdFolder
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

  // Валидация payload с ответом о создании файла
  function validateFileId(payload) {
    if (payload?.data?.id && typeof payload.data.id === 'string') {
      return payload.data.id
    }

    logger.error('Directus вернул некорректный ответ при загрузке файла', { payload })
    throw new Error('Directus не вернул идентификатор файла')
  }

  // Валидация payload с ответом о создании папки
  function validateFolderId(payload) {
    if (payload?.data?.id && typeof payload.data.id === 'string') {
      return payload.data.id
    }

    logger.error('Directus вернул некорректный ответ при создании папки', { payload })
    throw new Error('Directus не вернул идентификатор папки')
  }

  async function resolveTargetFolder({ folderId, shiftId, holdId, date }) {
    if (folderId) {
      return folderId
    }

    if (shiftId && holdId) {
      return ensureHoldFolder({ shiftId, holdId, date })
    }

    return process.env.DIRECTUS_UPLOAD_FOLDER_ID || null
  }

  return { uploadFile, uploadBuffer, deleteFile, getOrCreateFolder, ensureHoldFolder }
}

module.exports = { createDirectusUploadService }
