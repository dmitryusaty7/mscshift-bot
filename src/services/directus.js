const { URLSearchParams } = require('url')

// TODO: Review for merge — сервис для работы с Directus (создание папок, загрузка и удаление файлов)
function createDirectusService(config, logger) {
  const apiBase = config?.baseUrl || null
  const token = config?.token || null
  const rootFolder = config?.rootFolder || 'MSCShiftBot'
  const authHeader = token ? { Authorization: `Bearer ${token}` } : {}

  // Проверяем, доступен ли Directus для работы
  function isDirectusEnabled() {
    return Boolean(apiBase && token)
  }

  // TODO: Review for merge — создаём папку в Directus или возвращаем существующую
  async function getOrCreateFolder(name, parentId = null) {
    if (!isDirectusEnabled()) {
      throw new Error('Directus отключён')
    }

    const searchParams = new URLSearchParams({
      'filter[name][_eq]': name,
      limit: '1',
    })

    if (parentId) {
      searchParams.set('filter[parent][_eq]', String(parentId))
    } else {
      searchParams.set('filter[parent][_null]', 'true')
    }

    const searchUrl = `${apiBase}/folders?${searchParams.toString()}`
    const searchResponse = await fetch(searchUrl, {
      method: 'GET',
      headers: authHeader,
    })

    const searchPayload = await safeJson(searchResponse)

    if (!searchResponse.ok) {
      logDirectusError('получить папку', searchResponse, searchPayload)
      throw new Error('Directus вернул ошибку при поиске папки')
    }

    const existing = searchPayload?.data?.[0]

    if (existing?.id) {
      return existing.id
    }

    const createResponse = await fetch(`${apiBase}/folders`, {
      method: 'POST',
      headers: {
        ...authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name, parent: parentId || null }),
    })

    const createPayload = await safeJson(createResponse)

    if (!createResponse.ok) {
      logDirectusError('создать папку', createResponse, createPayload)
      throw new Error('Directus вернул ошибку при создании папки')
    }

    const createdId = createPayload?.data?.id

    if (!createdId) {
      throw new Error('Directus не вернул идентификатор созданной папки')
    }

    return createdId
  }

  // TODO: Review for merge — создаём цепочку папок и возвращаем идентификатор последней
  async function ensureFolderPath(parts) {
    if (!isDirectusEnabled()) {
      throw new Error('Directus отключён')
    }

    const normalizedParts = Array.isArray(parts) ? parts.filter(Boolean) : []
    let parentId = await getOrCreateFolder(rootFolder, null)

    for (const part of normalizedParts) {
      // eslint-disable-next-line no-await-in-loop
      parentId = await getOrCreateFolder(part, parentId)
    }

    return parentId
  }

  // TODO: Review for merge — загружаем файл в Directus
  async function uploadFile(buffer, filename, folderId) {
    if (!isDirectusEnabled()) {
      throw new Error('Directus отключён')
    }

    const form = new FormData()
    form.append('file', buffer, filename)

    if (folderId) {
      form.append('folder', String(folderId))
    }

    const response = await fetch(`${apiBase}/files`, {
      method: 'POST',
      headers: authHeader,
      body: form,
    })

    const payload = await safeJson(response)

    if (!response.ok) {
      logDirectusError('загрузить файл', response, payload)
      throw new Error('Directus вернул ошибку при загрузке файла')
    }

    const fileId = payload?.data?.id

    if (!fileId) {
      throw new Error('Directus не вернул идентификатор файла после загрузки')
    }

    return {
      directusFileId: fileId,
      publicUrl: `${apiBase}/assets/${fileId}`,
    }
  }

  // TODO: Review for merge — удаляем файл в Directus
  async function deleteFile(fileId) {
    if (!isDirectusEnabled()) {
      return
    }

    const response = await fetch(`${apiBase}/files/${fileId}`, {
      method: 'DELETE',
      headers: authHeader,
    })

    if (!response.ok) {
      const payload = await safeJson(response)
      logDirectusError('удалить файл', response, payload)
    }
  }

  // TODO: Review for merge — безопасный разбор JSON
  async function safeJson(response) {
    try {
      return await response.json()
    } catch (error) {
      logger.warn('Не удалось распарсить ответ Directus как JSON', { error: error.message })
      return null
    }
  }

  // TODO: Review for merge — логируем ошибки Directus с контекстом
  function logDirectusError(action, response, payload) {
    logger.error(`Directus не смог ${action}`, {
      status: response.status,
      statusText: response.statusText,
      payload,
    })
  }

  return {
    isDirectusEnabled,
    getOrCreateFolder,
    ensureFolderPath,
    uploadFile,
    deleteFile,
  }
}

module.exports = { createDirectusService }
