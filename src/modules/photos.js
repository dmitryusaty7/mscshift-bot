const path = require('path')
const fs = require('fs/promises')
const { USER_STATES, setUserState, getUserState } = require('../bot/middlewares/session')
const { createDirectusUploadService } = require('../services/directusUploadService')
const { createDirectusFolderService } = require('../services/directusFolderService')
const { safeDeleteFile } = require('../utils/safe-delete')

// TODO: Review for merge — шаги сценария фото трюмов
const PHOTO_STEPS = {
  INTRO: 'INTRO',
  HUB: 'HUB',
  HOLD: 'HOLD',
  CONFIRM: 'CONFIRM',
}

const photoSessions = new Map()
// TODO: Review for merge — базовая директория для локального сохранения фото
const LOCAL_UPLOADS_DIR = '/opt/mscshift-bot/uploads/holds'

function buildPhotosReplyKeyboard(messages, { showBack = true } = {}) {
  const rows = []

  if (showBack) {
    rows.push([{ text: messages.photos.hold.back }])
  }

  return {
    keyboard: rows,
    resize_keyboard: true,
  }
}

// TODO: Review for merge — регистрация модуля Блока 8 «Фото трюмов»
function registerPhotosModule({
  bot,
  logger,
  messages,
  shiftsRepo,
  holdsRepo,
  holdPhotosRepo,
  holdFoldersRepo,
  brigadiersRepo,
  directusConfig,
  openShiftMenu,
}) {
  let directusUploader = null
  let directusFolders = null

  if (directusConfig) {
    try {
      directusUploader = createDirectusUploadService({
        baseUrl: directusConfig.baseUrl,
        token: directusConfig.token,
        logger,
      })

      directusFolders = createDirectusFolderService({
        baseUrl: directusConfig.baseUrl,
        token: directusConfig.token,
        rootFolderId: process.env.DIRECTUS_UPLOAD_FOLDER_ID,
        logger,
      })
    } catch (error) {
      logger.error('Directus не сконфигурирован для загрузки фото', { error: error.message })
    }
  }

  bot.on('callback_query', async (query) => {
    const action = query.data

    if (!action || !action.startsWith('b8:')) {
      return
    }

    const telegramId = query.from?.id
    const chatId = query.message?.chat.id
    const session = telegramId ? photoSessions.get(telegramId) : null

    if (!session || !chatId) {
      await bot.answerCallbackQuery(query.id)
      return
    }

    try {
      if (action === 'b8:confirm') {
        // TODO: Review for merge — выводим диалог подтверждения
        await bot.answerCallbackQuery(query.id)
        session.step = PHOTO_STEPS.CONFIRM
        photoSessions.set(telegramId, session)
        await renderConfirmDialog({ bot, chatId, session, messages, directusConfig, logger, holdPhotosRepo })
        return
      }

      if (action === 'b8:confirm:yes') {
        // TODO: Review for merge — сохраняем факт подтверждения и возвращаемся в меню смены
        await bot.answerCallbackQuery(query.id)
        await confirmPhotosAndReturn({
          bot,
          chatId,
          telegramId,
          session,
          shiftsRepo,
          brigadiersRepo,
          messages,
          logger,
          openShiftMenu,
        })
        return
      }

      if (action.startsWith('b8:hold:')) {
        const [, , holdIdRaw] = action.split(':')
        const holdId = Number.parseInt(holdIdRaw, 10)

        if (!Number.isInteger(holdId)) {
          await bot.answerCallbackQuery(query.id)
          return
        }

        const hold = await holdsRepo.findById(holdId)

        if (!hold || hold.shift_id !== session.shiftId) {
          await bot.answerCallbackQuery(query.id)
          await bot.sendMessage(chatId, messages.systemError)
          return
        }

        session.currentHoldId = hold.id
        session.currentHoldNumber = session.holdNumbers?.get(hold.id) || hold.number
        session.step = PHOTO_STEPS.HOLD
        photoSessions.set(telegramId, session)
        await bot.answerCallbackQuery(query.id)
        await renderHold({ bot, chatId, session, messages, directusConfig, logger, holdPhotosRepo })
        return
      }

      await bot.answerCallbackQuery(query.id)
    } catch (error) {
      logger.error('Ошибка обработки callback в модуле фото трюмов', { error: error.message })
      await bot.answerCallbackQuery(query.id)
      await bot.sendMessage(chatId, messages.systemError)
    }
  })

  bot.on('message', async (msg) => {
    const telegramId = msg.from?.id
    const chatId = msg.chat.id

    if (!telegramId || !/^\d+$/.test(String(telegramId))) {
      return
    }

    if (getUserState(telegramId) !== USER_STATES.SHIFT_PHOTOS) {
      return
    }

    const session = photoSessions.get(telegramId)

    if (!session) {
      return
    }

    if (msg.text?.startsWith('/')) {
      return
    }

    try {
      if (session.step === PHOTO_STEPS.INTRO) {
        if (msg.text === messages.photos.intro.back) {
          // TODO: Review for merge — возврат в меню смены из интро
          await returnToShiftMenu({
            bot,
            chatId,
            telegramId,
            session,
            brigadiersRepo,
            shiftsRepo,
            messages,
            logger,
            openShiftMenu,
          })
          return
        }

        if (msg.text === messages.photos.intro.start) {
          // TODO: Review for merge — запуск хаба после вступительного экрана
          session.step = PHOTO_STEPS.HUB
          photoSessions.set(telegramId, session)
          await renderHub({
            bot,
            chatId,
            session,
            messages,
            holdsRepo,
            holdPhotosRepo,
            logger,
            withReplyKeyboard: true,
          })
        }

        return
      }

      if (session.step === PHOTO_STEPS.HUB) {
        if (msg.text === messages.photos.hold.back) {
          // TODO: Review for merge — возврат в меню смены из хаба
          await returnToShiftMenu({
            bot,
            chatId,
            telegramId,
            session,
            brigadiersRepo,
            shiftsRepo,
            messages,
            logger,
            openShiftMenu,
          })
        }

        return
      }

      if (session.step === PHOTO_STEPS.CONFIRM) {
        if (msg.text === messages.photos.confirm.back || msg.text === messages.photos.hold.back) {
          // TODO: Review for merge — возврат к списку трюмов из подтверждения
          session.step = PHOTO_STEPS.HUB
          session.currentHoldId = null
          session.currentHoldNumber = null
          photoSessions.set(telegramId, session)
          await renderHub({
            bot,
            chatId,
            session,
            messages,
            holdsRepo,
            holdPhotosRepo,
            logger,
            withReplyKeyboard: true,
          })
          return
        }

        return
      }

      if (session.step === PHOTO_STEPS.HOLD) {
        if (msg.text === messages.photos.hold.back) {
          // TODO: Review for merge — возврат к хабу трюмов
          session.currentHoldId = null
          session.currentHoldNumber = null
          session.step = PHOTO_STEPS.HUB
          photoSessions.set(telegramId, session)
          await renderHub({
            bot,
            chatId,
            session,
            messages,
            holdsRepo,
            holdPhotosRepo,
            logger,
            withReplyKeyboard: true,
          })
          return
        }

        if (msg.text === messages.photos.hold.removeLast) {
          // TODO: Review for merge — удаляем последнее фото
          await removeLastPhoto({
            bot,
            chatId,
            session,
            messages,
            holdPhotosRepo,
            holdsRepo,
            logger,
            directusUploader,
            directusConfig,
            holdFoldersRepo,
            directusFolders,
          })
          return
        }
      }
    } catch (error) {
      logger.error('Ошибка обработки текстового сообщения в модуле фото трюмов', { error: error.message })
      await bot.sendMessage(chatId, messages.systemError)
    }
  })

  bot.on('photo', async (msg) => {
    const telegramId = msg.from?.id
    const chatId = msg.chat.id

    if (!telegramId || getUserState(telegramId) !== USER_STATES.SHIFT_PHOTOS) {
      return
    }

    const session = photoSessions.get(telegramId)

    if (!session || session.step !== PHOTO_STEPS.HOLD || !session.currentHoldId) {
      // TODO: Review for merge — информируем пользователя, что контекст трюма не выбран
      await bot.sendMessage(chatId, messages.photos.noHoldSelected)
      return
    }

    const photoId = extractLargestPhotoId(msg.photo)

    if (!photoId) {
      logger.error('Не удалось получить file_id фото для трюма', { telegramId })
      await bot.sendMessage(chatId, messages.systemError)
      return
    }

    try {
      // TODO: Review for merge — скачиваем фото из Telegram
      const downloaded = await downloadFromTelegram(bot, photoId)

      // TODO: Review for merge — сохраняем файл локально как резервную копию
      const localPath = await savePhotoLocally({
        buffer: downloaded.buffer,
        shiftId: session.shiftId,
        holdId: session.currentHoldId,
        shipName: session.shipName,
        fileName: downloaded.fileName,
        logger,
      })

      if (logger) {
        logger.info('Локальный файл фото трюма сохранён', {
          shiftId: session.shiftId,
          holdId: session.currentHoldId,
          localPath,
        })
      }

      let diskPath = localPath
      let diskPublicUrl = null

      if (directusUploader && directusFolders && holdFoldersRepo) {
        let folderId = process.env.DIRECTUS_UPLOAD_FOLDER_ID
        let holdDisplayNumber = session.currentHoldNumber || session.currentHoldId

        try {
          if (logger) {
            logger.info('Начата загрузка фото в Directus', {
              shiftId: session.shiftId,
              holdId: session.currentHoldId,
              fileName: downloaded.fileName,
            })
          }

          holdDisplayNumber = await resolveHoldDisplayNumber({
            holdsRepo,
            holdId: session.currentHoldId,
            logger,
          })

          folderId = await getOrCreateHoldFolder({
            directusFolders,
            holdFoldersRepo,
            shiftId: session.shiftId,
            holdId: session.currentHoldId,
            shiftName: session.shipName,
            holdDisplayNumber,
            logger,
            date: new Date(),
          })
        } catch (folderError) {
          if (logger) {
            logger.error('Не удалось построить иерархию папок Directus, используем корень', {
              error: folderError.message,
              shiftId: session.shiftId,
              holdId: session.currentHoldId,
            })
          }
        }

        try {
          const uploaded = await directusUploader.uploadFile({
            buffer: downloaded.buffer,
            filename: downloaded.fileName,
            title: `Shift ${session.shiftId} / Hold ${session.currentHoldId}`,
            mimeType: downloaded.mimeType,
            folderId,
          })

          const fileId = uploaded.id

          await directusUploader.patchFileMeta(fileId, {
            folder: folderId,
            title: `Смена ${session.shiftId} / Трюм ${holdDisplayNumber}`,
            filename_download: path.basename(downloaded.fileName || 'photo.jpg'),
          })

          diskPath = `/assets/${fileId}`
          diskPublicUrl = `${directusConfig.baseUrl}${diskPath}`

          if (logger) {
            logger.info('Directus успешно принял фото трюма', {
              shiftId: session.shiftId,
              holdId: session.currentHoldId,
              directusId: fileId,
              folderId,
            })
          }
        } catch (uploadError) {
          if (logger) {
            logger.error('Сбой загрузки фото в Directus, используем только локальный файл', {
              error: uploadError.message,
              shiftId: session.shiftId,
              holdId: session.currentHoldId,
            })
          }
        }
      }

      await holdPhotosRepo.addPhoto({
        shiftId: session.shiftId,
        holdId: session.currentHoldId,
        telegramFileId: photoId,
        diskPath,
        diskPublicUrl,
      })

      if (logger) {
        logger.info('Запись о фото трюма сохранена', {
          shiftId: session.shiftId,
          holdId: session.currentHoldId,
          diskPath,
          diskPublicUrl,
        })
      }

      await renderHold({ bot, chatId, session, messages, directusConfig, logger, holdPhotosRepo })
    } catch (error) {
      logger.error('Ошибка сохранения фото трюма', {
        error: error.message,
        shiftId: session.shiftId,
        holdId: session.currentHoldId,
      })
      await bot.sendMessage(chatId, messages.systemError)
    }
  })

  // TODO: Review for merge — публичный метод открытия Блока 8 из меню смены
  async function openPhotosFromShiftMenu({ chatId, telegramId, session }) {
    try {
      const shiftId = session?.data?.shiftId
      const brigadierId = session?.data?.brigadierId

      if (!shiftId || !brigadierId) {
        await bot.sendMessage(chatId, messages.systemError)
        return
      }

      const shift = await shiftsRepo.findActiveByIdAndBrigadier({ shiftId, brigadierId })

      if (!shift) {
        await bot.sendMessage(chatId, messages.systemError)
        return
      }

      await holdsRepo.ensureForShift({ shiftId, count: shift.holds_count })
      const newSession = {
        step: PHOTO_STEPS.INTRO,
        shiftId,
        brigadierId,
        shipName: shift.ship_name,
        shiftDate: new Date(shift.date),
        holdsCount: shift.holds_count,
        currentHoldId: null,
        currentHoldNumber: null,
      }

      photoSessions.set(telegramId, newSession)
      setUserState(telegramId, USER_STATES.SHIFT_PHOTOS)

      await bot.sendMessage(chatId, messages.photos.intro.text, {
        reply_markup: {
          keyboard: [
            [{ text: messages.photos.intro.start }],
            [{ text: messages.photos.intro.back }],
          ],
          resize_keyboard: true,
        },
      })
    } catch (error) {
      logger.error('Не удалось открыть модуль фото трюмов', { error: error.message })
      await bot.sendMessage(chatId, messages.systemError)
    }
  }

  return { openPhotosFromShiftMenu }
}

// TODO: Review for merge — отрисовка списка трюмов
async function renderHub({ bot, chatId, session, messages, holdsRepo, holdPhotosRepo, logger, withReplyKeyboard }) {
  try {
    const holds = await holdsRepo.listByShift(session.shiftId)
    session.holdNumbers = new Map()
    const inline = []

    const holdsWithCounts = await Promise.all(
      holds.map(async (hold, index) => {
        const displayNumber = index + 1
        const count = await getHoldPhotoCount({
          shiftId: session.shiftId,
          holdId: hold.id,
          holdPhotosRepo,
          logger,
        })

        return { hold, displayNumber, count }
      }),
    )

    holdsWithCounts.forEach(({ hold, displayNumber, count }) => {
      session.holdNumbers.set(hold.id, displayNumber)
      inline.push([{ text: messages.photos.hub.holdButton(displayNumber, count), callback_data: `b8:hold:${hold.id}` }])
    })

    inline.push([{ text: messages.photos.hub.confirm, callback_data: 'b8:confirm' }])

    await bot.sendMessage(chatId, messages.photos.hub.prompt, {
      reply_markup: {
        inline_keyboard: inline,
      },
    })

    if (withReplyKeyboard) {
      await bot.sendMessage(chatId, '\u2060', {
        reply_markup: buildPhotosReplyKeyboard(messages),
      })
    }
  } catch (error) {
    logger.error('Не удалось отрисовать хаб фото трюмов', { error: error.message })
    await bot.sendMessage(chatId, messages.systemError)
  }
}

// TODO: Review for merge — отрисовка экрана конкретного трюма
async function renderHold({ bot, chatId, session, messages, directusConfig, logger, holdPhotosRepo }) {
  try {
    const count = await getHoldPhotoCount({
      shiftId: session.shiftId,
      holdId: session.currentHoldId,
      holdPhotosRepo,
      logger,
    })
    const text = messages.photos.hold.title(session.currentHoldNumber, count)

    // TODO: Review for merge — пользователь добавляет фото напрямую в чат, отдельная кнопка не нужна
    const replyMarkup = buildPhotosReplyKeyboard(messages)
    replyMarkup.keyboard.unshift([{ text: messages.photos.hold.removeLast }])

    await bot.sendMessage(chatId, text, {
      reply_markup: replyMarkup,
    })
  } catch (error) {
    logger.error('Не удалось отрисовать экран трюма', { error: error.message })
    await bot.sendMessage(chatId, messages.systemError)
  }
}

// TODO: Review for merge — диалог подтверждения фото
async function renderConfirmDialog({ bot, chatId, session, messages, directusConfig, logger, holdPhotosRepo }) {
  try {
    let totalCount = 0

    try {
      totalCount = await holdPhotosRepo.countTotalByShift(session.shiftId)
    } catch (countError) {
      logger?.error('Не удалось посчитать фото трюмов в БД', { error: countError.message })
    }

    const text = messages.photos.confirm.text(totalCount)

    await bot.sendMessage(chatId, text, {
      reply_markup: {
        inline_keyboard: [[{ text: messages.photos.confirm.approve, callback_data: 'b8:confirm:yes' }]],
      },
    })

    await bot.sendMessage(chatId, messages.photos.confirm.back, {
      reply_markup: buildPhotosReplyKeyboard(messages),
    })
  } catch (error) {
    logger.error('Не удалось отрисовать диалог подтверждения фото', { error: error.message })
    await bot.sendMessage(chatId, messages.systemError)
  }
}

// TODO: Review for merge — возврат к меню смены с обновлением статуса
async function returnToShiftMenu({ bot, chatId, telegramId, session, brigadiersRepo, shiftsRepo, messages, logger, openShiftMenu }) {
  try {
    const brigadier = await brigadiersRepo.findByTelegramId(String(telegramId))

    if (!brigadier) {
      await bot.sendMessage(chatId, messages.systemError)
      return
    }

    const shift = await shiftsRepo.findActiveByIdAndBrigadier({ shiftId: session.shiftId, brigadierId: brigadier.id })

    if (!shift) {
      await bot.sendMessage(chatId, messages.systemError)
      return
    }

    photoSessions.delete(telegramId)
    setUserState(telegramId, USER_STATES.SHIFT_MENU)

    await openShiftMenu({ bot, chatId, telegramId, brigadier, shift })
  } catch (error) {
    logger.error('Не удалось вернуть пользователя в меню смены из модуля фото', { error: error.message })
    await bot.sendMessage(chatId, messages.systemError)
  }
}

// TODO: Review for merge — подтверждение фото и возврат в меню смены
  async function confirmPhotosAndReturn({
  bot,
  chatId,
  telegramId,
  session,
  shiftsRepo,
  brigadiersRepo,
  messages,
  logger,
  openShiftMenu,
}) {
  try {
    await shiftsRepo.markPhotosFilled(session.shiftId)
    await returnToShiftMenu({
      bot,
      chatId,
      telegramId,
      session,
      brigadiersRepo,
      shiftsRepo,
      messages,
      logger,
      openShiftMenu,
    })
  } catch (error) {
    logger.error('Не удалось подтвердить фото трюмов', { error: error.message })
    await bot.sendMessage(chatId, messages.systemError)
  }
}

// TODO: Review for merge — удаление последнего фото трюма с очисткой в Directus и локальной ФС
async function removeLastPhoto({
  bot,
  chatId,
  session,
  messages,
  holdPhotosRepo,
  holdsRepo,
  logger,
  directusUploader,
  directusConfig,
  holdFoldersRepo,
  directusFolders,
}) {
  try {
    const lastPhoto = await holdPhotosRepo.findLastPhoto({ shiftId: session.shiftId, holdId: session.currentHoldId })

    if (!lastPhoto) {
      return
    }

    await deleteHoldPhotoSafely({
      photo: lastPhoto,
      shiftId: session.shiftId,
      holdId: session.currentHoldId,
      directusUploader,
      holdPhotosRepo,
      holdFoldersRepo,
      directusFolders,
      logger,
    })

    await renderHub({
      bot,
      chatId,
      session,
      messages,
      holdsRepo,
      holdPhotosRepo,
      logger,
      withReplyKeyboard: false,
    })
    await renderHold({ bot, chatId, session, messages, directusConfig, logger, holdPhotosRepo })
  } catch (error) {
    logger.error('Не удалось удалить последнее фото трюма', {
      error: error.message,
      shiftId: session.shiftId,
      holdId: session.currentHoldId,
    })
    await bot.sendMessage(chatId, messages.systemError)
  }
}

// Сервис безопасного удаления фото трюма с синхронизацией локальных и Directus-данных
async function deleteHoldPhotoSafely({
  photo,
  shiftId,
  holdId,
  directusUploader,
  holdPhotosRepo,
  holdFoldersRepo,
  directusFolders,
  logger,
}) {
  const meta = { shiftId, holdId, holdPhotoId: photo?.id }
  const publicPath = photo?.disk_public_url || photo?.disk_path
  const directusId = extractDirectusId(publicPath)

  if (directusUploader) {
    if (directusId) {
      try {
        logger?.info('Запрашиваем удаление файла в Directus', { ...meta, fileId: directusId })
        await directusUploader.deleteFile(directusId)
      } catch (error) {
        logger?.error('Directus не смог удалить файл фото трюма', { ...meta, fileId: directusId, error: error.message })
      }
    } else {
      logger?.warn('Не найден идентификатор файла Directus при удалении фото', meta)
    }
  }

  if (photo?.disk_path && !isAssetPath(photo.disk_path)) {
    try {
      await safeDeleteFile({
        filePath: photo.disk_path,
        logger,
        meta: {
          ...meta,
          fileId: directusId || photo.id,
        },
      })
    } catch (error) {
      logger?.error('Не удалось удалить локальный файл фото трюма', { ...meta, error: error.message })
    }
  }

  try {
    await holdPhotosRepo.deletePhotoById(photo.id)
    logger?.info('Запись фото трюма удалена из БД', meta)
  } catch (error) {
    logger?.error('Не удалось удалить запись фото трюма из БД', { ...meta, error: error.message })
    throw error
  }

  await cleanupEmptyHoldFolder({
    shiftId,
    holdId,
    holdPhotosRepo,
    holdFoldersRepo,
    directusFolders,
    logger,
  })
}

// Разрешает и создаёт (только при необходимости) папку Directus для фото трюма
async function getOrCreateHoldFolder({
  directusFolders,
  holdFoldersRepo,
  shiftId,
  holdId,
  shiftName,
  holdDisplayNumber,
  logger,
  date,
}) {
  // Сначала используем сохранённый идентификатор — это главный источник истины
  const existing = await holdFoldersRepo.findByHold({ shiftId, holdId })

  if (existing?.directus_folder_id) {
    logger?.info('Используем сохранённую папку Directus для трюма', {
      shiftId,
      holdId,
      folderId: existing.directus_folder_id,
    })

    return existing.directus_folder_id
  }

  // Папка создаётся только при добавлении первого фото
  const folderId = await directusFolders.resolveHoldFolder({
    shiftId,
    shiftName,
    holdId,
    holdDisplayNumber,
    date,
  })

  await holdFoldersRepo.saveFolderId({ shiftId, holdId, folderId })

  logger?.info('Создана новая папка Directus для трюма', { shiftId, holdId, folderId })

  return folderId
}

// После удаления фото проверяем, осталась ли папка пустой, и чистим Directus при необходимости
async function cleanupEmptyHoldFolder({
  shiftId,
  holdId,
  holdPhotosRepo,
  holdFoldersRepo,
  directusFolders,
  logger,
}) {
  const remainingCount = await getHoldPhotoCount({ shiftId, holdId, holdPhotosRepo, logger })

  if (remainingCount > 0) {
    return false
  }

  const mapping = await holdFoldersRepo.findByHold({ shiftId, holdId })
  const folderId = mapping?.directus_folder_id

  if (!folderId) {
    return false
  }

  if (!directusFolders) {
    logger?.warn('Directus не настроен, пропускаем удаление пустой папки', { shiftId, holdId, folderId })
    await holdFoldersRepo.clearFolderId({ shiftId, holdId })
    return false
  }

  try {
    await directusFolders.deleteFolder(folderId)
    logger?.info('Пустая папка Directus удалена после очистки фото трюма', { shiftId, holdId, folderId })
  } catch (error) {
    logger?.error('Не удалось удалить пустую папку Directus', {
      shiftId,
      holdId,
      folderId,
      error: error.message,
    })
    return false
  }

  await holdFoldersRepo.clearFolderId({ shiftId, holdId })
  return true
}

async function getHoldPhotoCount({ shiftId, holdId, holdPhotosRepo, logger }) {
  try {
    return await holdPhotosRepo.countByHold({ shiftId, holdId })
  } catch (error) {
    logger?.warn('Не удалось получить количество фото трюма локально, используем 0', {
      error: error.message,
      shiftId,
      holdId,
    })
    return 0
  }
}

// TODO: Review for merge — извлекаем наибольший файл из массива размеров фото
function extractLargestPhotoId(photos) {
  if (!Array.isArray(photos) || photos.length === 0) {
    return null
  }

  const sorted = [...photos].sort((a, b) => (a.file_size || 0) - (b.file_size || 0))
  return sorted[sorted.length - 1]?.file_id || null
}

// TODO: Review for merge — скачиваем файл из Telegram для последующей загрузки в Directus
async function downloadFromTelegram(bot, fileId) {
  const fileLink = await bot.getFileLink(fileId)
  const fileInfo = await bot.getFile(fileId)
  const fileName = require('path').basename(fileInfo?.file_path || `photo-${Date.now()}.jpg`)
  const mimeType = fileInfo?.mime_type || 'image/jpeg'

  const response = await fetch(fileLink)

  if (!response.ok) {
    throw new Error(`Ошибка загрузки файла Telegram: ${response.status}`)
  }

  const arrayBuffer = await response.arrayBuffer()
  return { buffer: Buffer.from(arrayBuffer), fileName, mimeType }
}

// TODO: Review for merge — извлекаем идентификатор файла Directus из asset-URL
function extractDirectusId(publicUrl) {
  if (!publicUrl) {
    return null
  }

  const match = String(publicUrl).match(/\/assets\/([\w-]+)/)
  return match?.[1] || null
}

// TODO: Review for merge — определяем, указывает ли путь на Directus-asset
function isAssetPath(pathValue) {
  return typeof pathValue === 'string' && pathValue.startsWith('/assets/')
}

// TODO: Review for merge — сохраняем фото на диск по вложенной структуре и возвращаем путь
async function savePhotoLocally({ buffer, shiftId, holdId, shipName, fileName, logger }) {
  const now = new Date()
  const year = String(now.getFullYear())
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  const safeShip = sanitizeForFs(shipName)
  const safeFile = `${Date.now()}-${sanitizeForFs(fileName || 'photo.jpg')}`

  const dir = path.join(LOCAL_UPLOADS_DIR, year, month, day, `shift_${shiftId}_${safeShip}`, `hold_${holdId}`)

  await fs.mkdir(dir, { recursive: true })

  const fullPath = path.join(dir, safeFile)
  await fs.writeFile(fullPath, buffer)

  if (logger) {
    logger.info('Локальный файл фото трюма записан на диск', { fullPath })
  }

  return fullPath
}

async function resolveHoldDisplayNumber({ holdsRepo, holdId, logger }) {
  try {
    const hold = await holdsRepo.findById(holdId)
    const candidates = ['number', 'hold_number', 'index', 'order', 'seq']

    for (const key of candidates) {
      const value = hold?.[key]
      const parsed = Number.parseInt(value, 10)

      if (Number.isFinite(parsed) && parsed >= 1 && parsed <= 7) {
        return parsed
      }
    }

    if (logger) {
      logger.warn('Не удалось определить номер трюма 1..7, используем идентификатор', { holdId })
    }

    return holdId
  } catch (error) {
    if (logger) {
      logger.error('Сбой определения номера трюма, используем идентификатор', { error: error.message, holdId })
    }

    return holdId
  }
}

// TODO: Review for merge — делаем имя файла и судна безопасными для ФС
function sanitizeForFs(value) {
  const base = String(value || '').trim()

  if (!base) {
    return 'unknown'
  }

  return base
    .replace(/[\\/]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/[^\w\-.А-Яа-яЁё]/g, '_')
}

module.exports = { registerPhotosModule }
