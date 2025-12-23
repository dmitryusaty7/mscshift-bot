// Сервис работы с папками Directus: поиск, создание и построение иерархии трюмов
const { URLSearchParams } = require('url')

function createDirectusFolderService({ baseUrl, token, logger, rootFolderId }) {
  if (!baseUrl || !token) {
    throw new Error('Directus не настроен: требуется DIRECTUS_URL и DIRECTUS_TOKEN')
  }

  const authHeader = { Authorization: `Bearer ${token}` }

  async function getOrCreateFolder({ name, parentId }) {
    if (!name || typeof name !== 'string') {
      throw new Error('Имя папки Directus не задано')
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
      headers: authHeader,
    })

    const searchPayload = await safeJson(searchResponse)

    if (!searchResponse.ok) {
      logDirectusError('поиск папки', searchResponse, searchPayload, { name, parentId })
      throw new Error('Directus вернул ошибку при поиске папки')
    }

    const existing = Array.isArray(searchPayload?.data) ? searchPayload.data[0] : null

    if (existing?.id) {
      logger.info('Папка Directus найдена', { name, parentId: parentId || null, folderId: existing.id })
      return existing.id
    }

    const createResponse = await fetch(`${baseUrl}/folders`, {
      method: 'POST',
      headers: {
        ...authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name, parent: parentId || null }),
    })

    const createPayload = await safeJson(createResponse)

    if (!createResponse.ok) {
      logDirectusError('создание папки', createResponse, createPayload, { name, parentId })
      throw new Error('Directus вернул ошибку при создании папки')
    }

    const folderId = validateFolderId(createPayload)
    logger.info('Папка Directus создана', { name, parentId: parentId || null, folderId })
    return folderId
  }

  async function resolveHoldFolder({ date = new Date(), shiftId, shiftName, holdId, rootId }) {
    if (!shiftId || !holdId) {
      throw new Error('Для построения пути папок требуется shiftId и holdId')
    }

    const baseFolderId = rootId || rootFolderId || process.env.DIRECTUS_UPLOAD_FOLDER_ID || null

    if (!baseFolderId) {
      throw new Error('Не указан DIRECTUS_UPLOAD_FOLDER_ID для корневой папки Directus')
    }

    const yearFolder = await getOrCreateFolder({ parentId: baseFolderId, name: String(date.getFullYear()) })
    const monthFolder = await getOrCreateFolder({ parentId: yearFolder, name: String(date.getMonth() + 1).padStart(2, '0') })
    const dayFolder = await getOrCreateFolder({ parentId: monthFolder, name: String(date.getDate()).padStart(2, '0') })

    const shiftNameSuffix = normalizeFolderName(shiftName)
    const shiftFolderName = shiftNameSuffix ? `shift_${shiftId}_${shiftNameSuffix}` : `shift_${shiftId}`
    const shiftFolder = await getOrCreateFolder({ parentId: dayFolder, name: shiftFolderName })

    const holdFolder = await getOrCreateFolder({ parentId: shiftFolder, name: `hold_${holdId}` })

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

  async function safeJson(response) {
    try {
      return await response.json()
    } catch (error) {
      logger.warn('Не удалось распарсить ответ Directus как JSON', { error: error.message })
      return null
    }
  }

  function validateFolderId(payload) {
    if (payload?.data?.id && typeof payload.data.id === 'string') {
      return payload.data.id
    }

    logger.error('Directus вернул некорректный ответ при создании папки', { payload })
    throw new Error('Directus не вернул идентификатор папки')
  }

  function logDirectusError(action, response, payload, meta = {}) {
    logger.error(`Directus не смог выполнить ${action}`, {
      status: response.status,
      statusText: response.statusText,
      payload,
      ...meta,
    })
  }

  function normalizeFolderName(raw) {
    if (!raw || typeof raw !== 'string') {
      return ''
    }

    return raw.trim().replace(/[\\/]/g, '-').replace(/\s+/g, ' ')
  }

  return { getOrCreateFolder, resolveHoldFolder }
}

module.exports = { createDirectusFolderService }
