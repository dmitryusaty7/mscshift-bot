const { USER_STATES, setUserState, getUserState } = require('../bot/middlewares/session')
const { createPhotosStorage } = require('../services/photosStorage')

// TODO: Review for merge — шаги сценария фото трюмов
const PHOTO_STEPS = {
  INTRO: 'INTRO',
  HUB: 'HUB',
  HOLD: 'HOLD',
  CONFIRM: 'CONFIRM',
}

const photoSessions = new Map()

// TODO: Review for merge — регистрация модуля Блока 8 «Фото трюмов»
function registerPhotosModule({
  bot,
  logger,
  messages,
  shiftsRepo,
  holdsRepo,
  holdPhotosRepo,
  brigadiersRepo,
  uploadsDir,
  openShiftMenu,
}) {
  const storage = createPhotosStorage({ logger, uploadsDir })

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
        await renderConfirmDialog({ bot, chatId, session, messages, holdPhotosRepo, logger })
        return
      }

      if (action === 'b8:confirm:back') {
        // TODO: Review for merge — возвращаемся в список трюмов из диалога подтверждения
        session.step = PHOTO_STEPS.HUB
        photoSessions.set(telegramId, session)
        await bot.answerCallbackQuery(query.id)
        await renderHub({ bot, chatId, session, messages, holdsRepo, logger, withReplyKeyboard: true })
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
        session.currentHoldNumber = hold.number
        session.step = PHOTO_STEPS.HOLD
        photoSessions.set(telegramId, session)
        await bot.answerCallbackQuery(query.id)
        await renderHold({ bot, chatId, session, messages, holdPhotosRepo, logger })
        return
      }

      if (action === 'shift:photos:back') {
        // TODO: Review for merge — inline-возврат к меню смены из хаба
        await bot.answerCallbackQuery(query.id)
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
          await renderHub({ bot, chatId, session, messages, holdsRepo, logger, withReplyKeyboard: true })
        }

        return
      }

      if (session.step === PHOTO_STEPS.HUB) {
        if (msg.text === messages.photos.hub.backToShift) {
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

      if (session.step === PHOTO_STEPS.HOLD) {
        if (msg.text === messages.photos.hold.back) {
          // TODO: Review for merge — возврат к хабу трюмов
          session.currentHoldId = null
          session.currentHoldNumber = null
          session.step = PHOTO_STEPS.HUB
          photoSessions.set(telegramId, session)
          await renderHub({ bot, chatId, session, messages, holdsRepo, logger, withReplyKeyboard: true })
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
            storage,
            logger,
          })
          await renderHold({ bot, chatId, session, messages, holdPhotosRepo, logger })
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
      // TODO: Review for merge — сохраняем фото и обновляем счётчик
      const logicalPathParts = buildLogicalPathParts({
        shiftDate: session.shiftDate,
        shipName: session.shipName,
        holdNumber: session.currentHoldNumber,
        shiftId: session.shiftId,
        holdId: session.currentHoldId,
      })

      const stored = await storage.saveTelegramPhoto({ bot, fileId: photoId, logicalPathParts })

      await holdPhotosRepo.addPhoto({
        shiftId: session.shiftId,
        holdId: session.currentHoldId,
        telegramFileId: photoId,
        diskPath: stored.diskPath,
        diskPublicUrl: stored.diskPublicUrl,
      })

      await renderHold({ bot, chatId, session, messages, holdPhotosRepo, logger })
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
async function renderHub({ bot, chatId, session, messages, holdsRepo, logger, withReplyKeyboard }) {
  try {
    const holds = await holdsRepo.getHoldsWithCounts(session.shiftId)
    const inline = []

    holds.forEach((hold) => {
      inline.push([{ text: messages.photos.hub.holdButton(hold.number, hold.photos_count), callback_data: `b8:hold:${hold.id}` }])
    })

    inline.push([{ text: messages.photos.hub.confirm, callback_data: 'b8:confirm' }])
    inline.push([{ text: messages.photos.hub.backInline, callback_data: 'shift:photos:back' }])

    await bot.sendMessage(chatId, messages.photos.hub.text, {
      reply_markup: {
        inline_keyboard: inline,
      },
    })

    if (withReplyKeyboard) {
      await bot.sendMessage(chatId, messages.photos.hub.backToShift, {
        reply_markup: {
          keyboard: [[{ text: messages.photos.hub.backToShift }]],
          resize_keyboard: true,
        },
      })
    }
  } catch (error) {
    logger.error('Не удалось отрисовать хаб фото трюмов', { error: error.message })
    await bot.sendMessage(chatId, messages.systemError)
  }
}

// TODO: Review for merge — отрисовка экрана конкретного трюма
async function renderHold({ bot, chatId, session, messages, holdPhotosRepo, logger }) {
  try {
    const count = await holdPhotosRepo.countByHold({ shiftId: session.shiftId, holdId: session.currentHoldId })
    const text = messages.photos.hold.title(session.currentHoldNumber, count)

    await bot.sendMessage(chatId, text, {
      reply_markup: {
        keyboard: [
          [{ text: messages.photos.hold.removeLast }],
          [{ text: messages.photos.hold.back }],
        ],
        resize_keyboard: true,
      },
    })
  } catch (error) {
    logger.error('Не удалось отрисовать экран трюма', { error: error.message })
    await bot.sendMessage(chatId, messages.systemError)
  }
}

// TODO: Review for merge — диалог подтверждения фото
async function renderConfirmDialog({ bot, chatId, session, messages, holdPhotosRepo, logger }) {
  try {
    const totalCount = await holdPhotosRepo.countTotalByShift(session.shiftId)
    const text = messages.photos.confirm.text(totalCount)

    await bot.sendMessage(chatId, text, {
      reply_markup: {
        inline_keyboard: [
          [{ text: messages.photos.confirm.approve, callback_data: 'b8:confirm:yes' }],
          [{ text: messages.photos.confirm.back, callback_data: 'b8:confirm:back' }],
        ],
      },
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

// TODO: Review for merge — удаление последнего фото трюма
async function removeLastPhoto({ bot, chatId, session, messages, holdPhotosRepo, storage, logger }) {
  try {
    const deleted = await holdPhotosRepo.deleteLastPhoto({ shiftId: session.shiftId, holdId: session.currentHoldId })

    if (deleted) {
      await storage.deleteStoredFile({ diskPath: deleted.disk_path })
    }
  } catch (error) {
    logger.error('Не удалось удалить последнее фото трюма', { error: error.message })
    await bot.sendMessage(chatId, messages.systemError)
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

// TODO: Review for merge — формируем части пути по правилам и экранируем спецсимволы
function buildLogicalPathParts({ shiftDate, shipName, holdNumber, shiftId, holdId }) {
  const date = new Date(shiftDate)
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  const shipSegment = sanitizePathPart(shipName)
  const shiftFolder = `shift_${shiftId}_${shipSegment}`
  const holdFolder = `hold_${holdId}`
  return [year.toString(), month, day, shiftFolder, holdFolder]
}

// TODO: Review for merge — санитария сегментов пути
function sanitizePathPart(part) {
  return String(part || '')
    .trim()
    .replace(/[\\/]+/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/[^\wА-Яа-яЁё\s\-]/g, '')
    .trim()
}

module.exports = { registerPhotosModule }
