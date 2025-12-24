// Сервис работы с иерархией папок Directus для загрузки фото трюмов
function createDirectusFolderService({ baseUrl, token, rootFolderId, logger }) {
  if (!baseUrl || !token) {
    throw new Error('Directus не настроен: требуется DIRECTUS_URL и DIRECTUS_TOKEN')
  }

  if (!rootFolderId) {
    throw new Error('Не указан корневой идентификатор папки Directus (DIRECTUS_UPLOAD_FOLDER_ID)')
  }

  const cache = new Map()
  const folderLocks = new Map()

  async function resolveHoldFolder({ shiftId, shiftName, holdId, holdDisplayNumber, date }) {
    const currentDate = date ? new Date(date) : new Date()
    const year = String(currentDate.getFullYear())
    const month = getRussianMonthName(currentDate.getMonth())
    const day = String(currentDate.getDate()).padStart(2, '0')

    const shiftFolderName = buildShiftFolderName({ shiftNumber: shiftId, vesselName: shiftName })

    if (logger) {
      logger.info('Сформировано имя папки смены для Directus', {
        shiftId,
        shiftFolderName,
      })
    }

    const segments = [year, month, day, shiftFolderName, `Трюм ${holdDisplayNumber || holdId}`]

    if (logger) {
      logger.info('Разрешение иерархии папок Directus для фото трюма', { segments, rootFolderId })
    }

    let parentId = String(rootFolderId)

    for (const segment of segments) {
      parentId = await resolveOrCreate(segment, parentId)
    }

    return parentId
  }

  async function resolveOrCreate(name, parentId) {
    const key = `${parentId}:${name}`

    if (cache.has(key)) {
      return cache.get(key)
    }

    if (folderLocks.has(key)) {
      if (logger) {
        logger.info('Ожидание блокировки на разрешение папки Directus', { name, parentId })
      }

      return folderLocks.get(key)
    }

    let startResolution

    const resolutionPromise = new Promise((resolve, reject) => {
      startResolution = async () => {
        try {
          const existing = await findFolder(name, parentId)

          if (existing) {
            cache.set(key, existing)
            resolve(existing)
            return
          }

          if (logger) {
            logger.info('Создание папки Directus под блокировкой', { name, parentId })
          }

          const created = await createFolder(name, parentId)
          cache.set(key, created)
          resolve(created)
        } catch (error) {
          reject(error)
        } finally {
          folderLocks.delete(key)
        }
      }
    })

    folderLocks.set(key, resolutionPromise)
    await startResolution()
    return resolutionPromise
  }

  async function findFolder(name, parentId) {
    const params = new URLSearchParams()
    params.set('filter[parent][_eq]', parentId)
    params.set('filter[name][_eq]', name)
    params.set('limit', '1')

    const response = await fetch(`${baseUrl}/folders?${params.toString()}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })

    const payload = await safeJson(response)

    const dataLength = Array.isArray(payload?.data) ? payload.data.length : null

    if (logger) {
      logger.info('Ответ Directus при поиске папки', {
        name,
        parentId,
        status: response.status,
        dataLength,
      })
    }

    if (!response.ok) {
      throw new Error(`Directus не смог проверить существование папки ${name}`)
    }

    if (dataLength > 1 && logger) {
      logger.warn('Найдено несколько папок с одинаковым именем и родителем', {
        name,
        parentId,
        dataLength,
      })
    }

    const foundId = payload?.data?.[0]?.id
    return foundId ? String(foundId) : null
  }

  async function deleteFolder(folderId) {
    if (!folderId) {
      return
    }

    try {
      const response = await fetch(`${baseUrl}/folders/${folderId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      if (!response.ok) {
        const payload = await safeJson(response)

        if (logger) {
          logger.error('Directus не смог удалить папку трюма', {
            folderId,
            status: response.status,
            statusText: response.statusText,
            payload,
          })
        }

        throw new Error(`Directus не смог удалить папку ${folderId}`)
      }

      if (logger) {
        logger.info('Папка Directus удалена', { folderId, status: response.status })
      }
    } catch (error) {
      if (logger) {
        logger.error('Ошибка удаления папки Directus', { folderId, error: error.message })
      }
      throw error
    }
  }

  async function createFolder(name, parentId) {
    if (logger) {
      logger.info('Создание папки Directus', { name, parentId })
    }

    const response = await fetch(`${baseUrl}/folders`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name, parent: parentId }),
    })

    const payload = await safeJson(response)

    if (logger) {
      logger.info('Ответ Directus на создание папки', {
        name,
        parentId,
        status: response.status,
        dataId: payload?.data?.id,
      })
    }

    if (!response.ok) {
      throw new Error(`Directus не смог создать папку ${name}`)
    }

    const id = payload?.data?.id

    if (!id) {
      throw new Error('Directus вернул некорректный ответ при создании папки')
    }

    return String(id)
  }

  async function safeJson(response) {
    try {
      return await response.json()
    } catch (error) {
      if (logger) {
        logger.warn('Не удалось распарсить ответ Directus как JSON', { error: error.message })
      }

      return null
    }
  }

  function buildShiftFolderName({ shiftNumber, vesselName }) {
    const number = String(shiftNumber || '').trim()
    const vessel = sanitizeName(vesselName)

    return `С${number} ${vessel}`.trim()
  }

  function sanitizeName(value) {
    const base = String(value || '').trim()

    if (!base) {
      return 'unknown'
    }

    return base.replace(/[\\/]/g, '_')
  }

  function getRussianMonthName(index) {
    const months = [
      'Январь',
      'Февраль',
      'Март',
      'Апрель',
      'Май',
      'Июнь',
      'Июль',
      'Август',
      'Сентябрь',
      'Октябрь',
      'Ноябрь',
      'Декабрь',
    ]

    return months[index] || 'Неизвестный месяц'
  }

  return { resolveHoldFolder, deleteFolder }
}

module.exports = { createDirectusFolderService }
