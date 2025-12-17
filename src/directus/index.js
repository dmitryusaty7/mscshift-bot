const { Blob } = require('buffer')
const { URLSearchParams } = require('url')

// Клиент Directus для загрузки файлов и записи данных
function createDirectusClient({ baseUrl, token, collections, defaultShiftStatus }, logger) {
  const apiBase = removeTrailingSlash(baseUrl)
  const authHeader = { Authorization: `Bearer ${token}` }

  async function uploadFileFromBuffer(buffer, { filename, mimeType }) {
    try {
      const form = new FormData()
      const blob = new Blob([buffer], { type: mimeType || 'application/octet-stream' })

      form.append('file', blob, filename)

      const response = await fetch(`${apiBase}/files`, {
        method: 'POST',
        headers: authHeader,
        body: form,
      })

      const payload = await parseJsonSafe(response)

      if (!response.ok) {
        logDirectusError('загрузить файл', response, payload)
        throw new Error('Directus вернул ошибку при загрузке файла')
      }

      const fileId = payload?.data?.id

      if (!fileId) {
        logger.error('Directus не вернул id файла после загрузки', { payload })
        throw new Error('Не получен идентификатор файла из Directus')
      }

      return fileId
    } catch (error) {
      logger.error('Не удалось загрузить файл в Directus', { error: error.message })
      throw error
    }
  }

  async function ensureUser({ telegramId, firstName }) {
    try {
      const params = new URLSearchParams({
        'filter[telegram_id][_eq]': telegramId,
        limit: '1',
      })

      const response = await fetch(`${apiBase}/items/${collections.users}?${params.toString()}`, {
        method: 'GET',
        headers: authHeader,
      })

      const payload = await parseJsonSafe(response)

      if (!response.ok) {
        logDirectusError('найти пользователя', response, payload)
        throw new Error('Directus вернул ошибку при поиске пользователя')
      }

      const existingUser = payload?.data?.[0]

      if (existingUser) {
        return existingUser
      }

      return await createUser({ telegramId, firstName })
    } catch (error) {
      logger.error('Не удалось получить или создать пользователя в Directus', {
        error: error.message,
        telegramId,
      })
      throw error
    }
  }

  async function createUser({ telegramId, firstName }) {
    const body = JSON.stringify({
      telegram_id: telegramId,
      first_name: firstName || '',
    })

    const response = await fetch(`${apiBase}/items/${collections.users}`, {
      method: 'POST',
      headers: {
        ...authHeader,
        'Content-Type': 'application/json',
      },
      body,
    })

    const payload = await parseJsonSafe(response)

    if (!response.ok) {
      logDirectusError('создать пользователя', response, payload)
      throw new Error('Directus вернул ошибку при создании пользователя')
    }

    const user = payload?.data

    if (!user?.id) {
      logger.error('Directus не вернул id пользователя после создания', { payload })
      throw new Error('Не получен идентификатор пользователя из Directus')
    }

    return user
  }

  async function createShift({ userId }) {
    const body = {
      user_id: userId,
    }

    if (defaultShiftStatus) {
      body.status = defaultShiftStatus
    }

    const response = await fetch(`${apiBase}/items/${collections.shifts}`, {
      method: 'POST',
      headers: {
        ...authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    const payload = await parseJsonSafe(response)

    if (!response.ok) {
      logDirectusError('создать смену', response, payload)
      throw new Error('Directus вернул ошибку при создании смены')
    }

    const shift = payload?.data

    if (!shift?.id) {
      logger.error('Directus не вернул id смены после создания', { payload })
      throw new Error('Не получен идентификатор смены из Directus')
    }

    return shift
  }

  async function attachPhotoToShift({ shiftId, fileId }) {
    const response = await fetch(`${apiBase}/items/${collections.shiftPhotos}`, {
      method: 'POST',
      headers: {
        ...authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ shift_id: shiftId, file: fileId }),
    })

    const payload = await parseJsonSafe(response)

    if (!response.ok) {
      logDirectusError('сохранить фото смены', response, payload)
      throw new Error('Directus вернул ошибку при сохранении фото смены')
    }

    return payload?.data
  }

  async function parseJsonSafe(response) {
    try {
      return await response.json()
    } catch (error) {
      logger.warn('Не удалось распарсить ответ Directus как JSON', { error: error.message })
      return null
    }
  }

  function logDirectusError(action, response, payload) {
    logger.error(`Directus не смог ${action}`, {
      status: response.status,
      statusText: response.statusText,
      payload,
    })
  }

  return {
    uploadFileFromBuffer,
    ensureUser,
    createShift,
    attachPhotoToShift,
  }
}

function removeTrailingSlash(url) {
  return url.endsWith('/') ? url.slice(0, -1) : url
}

module.exports = { createDirectusClient }
