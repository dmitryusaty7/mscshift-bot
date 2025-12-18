const { USER_STATES, setUserState, getUserState } = require('../bot/middlewares/session')
const { buildShiftMenuKeyboard, buildBackKeyboard } = require('../utils/shift-menu.keyboard')
const { formatDateHuman, toPgDate } = require('../utils/time')
const { buildStatusesFromShift } = require('../utils/shift-status')
const { backToMainMenu } = require('../utils/back-to-main-menu')

const SHIFT_STEPS = {
  WAITING_DATE: 'WAITING_DATE',
  WAITING_SHIP: 'WAITING_SHIP',
  WAITING_HOLDS: 'WAITING_HOLDS',
  MENU_READY: 'MENU_READY',
}

const shiftSessions = new Map()

// Регистрация обработчиков для Блока 3 — меню смены
function registerShiftMenuModule({
  bot,
  brigadiersRepo,
  shipsRepo,
  shiftsRepo,
  messages,
  logger,
  returnToMainPanel,
  openCrewScene,
}) {
  bot.onText(/\/shift(?:_menu)?/, async (msg) => {
    const chatId = msg.chat.id
    const telegramId = msg.from?.id

    if (!telegramId || !/^\d+$/.test(String(telegramId))) {
      logger.error('Не удалось определить корректный telegram_id у пользователя', { telegramId })
      await bot.sendMessage(chatId, messages.systemError)
      return
    }

    await startShiftMenuFlow({
      bot,
      chatId,
      telegramId,
      brigadiersRepo,
      messages,
      logger,
    })
  })

  bot.on('message', async (msg) => {
    const telegramId = msg.from?.id
    const chatId = msg.chat.id

    if (!telegramId || !/^\d+$/.test(String(telegramId))) {
      return
    }

    const state = getUserState(telegramId)

    if (![USER_STATES.SHIFT_CREATION, USER_STATES.SHIFT_MENU].includes(state)) {
      return
    }

    const session = shiftSessions.get(telegramId)

    if (!session) {
      return
    }

    if (msg.text === messages.navigation.back) {
      await handleBackToMainMenuFromShift({
        bot,
        chatId,
        telegramId,
        session,
        messages,
        logger,
        returnToMainPanel,
      })
      return
    }

    // Игнорируем команды, чтобы не перехватывать другие сценарии
    if (msg.text?.startsWith('/')) {
      return
    }

    switch (session.step) {
      case SHIFT_STEPS.WAITING_DATE:
        await handleDateInput({ bot, chatId, telegramId, text: msg.text, messages })
        break
      case SHIFT_STEPS.WAITING_SHIP:
        await handleShipInput({
          bot,
          chatId,
          telegramId,
          text: msg.text,
          shipsRepo,
          messages,
          logger,
        })
        break
      case SHIFT_STEPS.WAITING_HOLDS:
        await handleHoldsInput({
          bot,
          chatId,
          telegramId,
          text: msg.text,
          shiftsRepo,
          messages,
          logger,
        })
        break
      case SHIFT_STEPS.MENU_READY:
        break
      default:
        break
    }
  })

  bot.on('callback_query', async (query) => {
    const telegramId = query.from?.id
    const chatId = query.message?.chat.id
    const session = telegramId ? shiftSessions.get(telegramId) : null

    if (!session || session.step !== SHIFT_STEPS.MENU_READY) {
      await bot.answerCallbackQuery(query.id)
      return
    }

    const action = query.data

    if (action && action.startsWith('shift:')) {
      await bot.answerCallbackQuery(query.id, { text: messages.shiftMenu.sectionRedirect })

      if (action === 'shift:crew' && openCrewScene) {
        // TODO: Code Review for mergeability
        await openCrewScene({ bot, chatId, telegramId, session })
        return
      }

      // TODO: переключать пользователя в нужный блок и обновлять статусы после завершения блока
      return
    }

    await bot.answerCallbackQuery(query.id)
    if (chatId) {
      await bot.sendMessage(chatId, messages.shiftMenu.sectionUnknown)
    }
  })
}

// Старт сценария создания новой смены
async function startShiftMenuFlow({ bot, chatId, telegramId, brigadiersRepo, messages, logger }) {
  try {
    const currentState = getUserState(telegramId)

    if (currentState === USER_STATES.REGISTRATION) {
      await bot.sendMessage(chatId, messages.shiftMenu.notRegistered)
      return
    }

    const brigadier = await brigadiersRepo.findByTelegramId(String(telegramId))

    if (!brigadier) {
      await bot.sendMessage(chatId, messages.shiftMenu.notRegistered)
      return
    }

    const brigadierName = `${brigadier.last_name} ${brigadier.first_name}`.trim()

    const previousSession = shiftSessions.get(telegramId)

    if (previousSession) {
      await clearShiftMenuMessages({ bot, chatId, session: previousSession, logger })
    }

    shiftSessions.delete(telegramId)

    shiftSessions.set(telegramId, {
      step: SHIFT_STEPS.WAITING_DATE,
      data: {
        brigadierId: brigadier.id,
        brigadierName,
      },
    })

    setUserState(telegramId, USER_STATES.SHIFT_CREATION)

    await bot.sendMessage(chatId, messages.shiftMenu.askDate, {
      reply_markup: {
        keyboard: buildKeyboardWithBack([[{ text: messages.shiftMenu.todayButton }]], messages.navigation.back),
        resize_keyboard: true,
        one_time_keyboard: false,
      },
    })
  } catch (error) {
    logger.error('Не удалось запустить сценарий создания смены', { error: error.message })
    await bot.sendMessage(chatId, messages.systemError)
  }
}

// Открываем меню существующей смены из главной панели
async function openShiftMenu({ bot, chatId, telegramId, brigadier, shift, messages, logger }) {
  try {
    const brigadierName = `${brigadier.last_name} ${brigadier.first_name}`.trim()
    const statuses = buildStatusesFromShift(shift)
    const session = {
      step: SHIFT_STEPS.MENU_READY,
      data: {
        brigadierId: brigadier.id,
        brigadierName,
        shiftId: shift.id,
        shipName: shift.ship_name,
        holdsCount: shift.holds_count,
        date: new Date(shift.date),
        statuses,
      },
    }

    shiftSessions.set(telegramId, session)
    setUserState(telegramId, USER_STATES.SHIFT_MENU)

    await renderShiftMenu({ bot, chatId, session, messages, telegramId })
  } catch (error) {
    logger.error('Не удалось открыть меню существующей смены', { error: error.message })
    await bot.sendMessage(chatId, messages.systemError)
  }
}

// Этап ввода даты смены
async function handleDateInput({ bot, chatId, telegramId, text, messages }) {
  const session = shiftSessions.get(telegramId)

  if (!session) {
    return
  }

  const parsedDate = parseShiftDate(text, messages.shiftMenu.todayButton)

  if (!parsedDate) {
    await bot.sendMessage(chatId, messages.shiftMenu.invalidDate)
    return
  }

  session.data.date = parsedDate
  session.step = SHIFT_STEPS.WAITING_SHIP
  shiftSessions.set(telegramId, session)

  await bot.sendMessage(chatId, messages.shiftMenu.askShip, {
    reply_markup: {
      keyboard: buildKeyboardWithBack([], messages.navigation.back),
      resize_keyboard: true,
    },
  })
}

// Этап ввода названия судна
async function handleShipInput({
  bot,
  chatId,
  telegramId,
  text,
  shipsRepo,
  messages,
  logger,
}) {
  const session = shiftSessions.get(telegramId)

  if (!session) {
    return
  }

  const shipName = text?.trim()

  if (!shipName || !/^[A-Za-zА-Яа-яЁё0-9\- ]{2,}$/u.test(shipName)) {
    await bot.sendMessage(chatId, messages.shiftMenu.invalidShip)
    return
  }

  try {
    const existing = await shipsRepo.findByName(shipName)
    const ship = existing || (await shipsRepo.create({ name: shipName }))

    session.data.shipId = ship.id
    session.data.shipName = ship.name
    session.step = SHIFT_STEPS.WAITING_HOLDS
    shiftSessions.set(telegramId, session)

    await bot.sendMessage(chatId, messages.shiftMenu.askHolds, {
      reply_markup: {
        keyboard: buildKeyboardWithBack(buildHoldsKeyboard(), messages.navigation.back),
        resize_keyboard: true,
        one_time_keyboard: false,
      },
    })
  } catch (error) {
    logger.error('Ошибка при обработке судна', { error: error.message })
    await bot.sendMessage(chatId, messages.systemError)
  }
}

// Этап выбора количества трюмов
async function handleHoldsInput({ bot, chatId, telegramId, text, shiftsRepo, messages, logger }) {
  const session = shiftSessions.get(telegramId)

  if (!session) {
    return
  }

  const holdsCount = Number.parseInt(text, 10)

  if (!Number.isInteger(holdsCount) || holdsCount < 1 || holdsCount > 7) {
    await bot.sendMessage(chatId, messages.shiftMenu.invalidHolds)
    return
  }

  session.data.holdsCount = holdsCount

  try {
    const { brigadierId, shipId, date } = session.data
    const pgDate = toPgDate(date)

    const duplicate = await shiftsRepo.findDuplicate({ brigadierId, shipId, date: pgDate })

    if (duplicate) {
      shiftSessions.set(telegramId, {
        step: SHIFT_STEPS.WAITING_DATE,
        data: {
          brigadierId,
          brigadierName: session.data.brigadierName,
        },
      })
      setUserState(telegramId, USER_STATES.SHIFT_CREATION)

      await bot.sendMessage(chatId, messages.shiftMenu.duplicateShift)
      await bot.sendMessage(chatId, messages.shiftMenu.askDate, {
        reply_markup: {
          keyboard: buildKeyboardWithBack([[{ text: messages.shiftMenu.todayButton }]], messages.navigation.back),
          resize_keyboard: true,
          one_time_keyboard: false,
        },
      })

      return
    }

    const shift = await shiftsRepo.createShiftWithHolds({
      date: pgDate,
      brigadierId,
      shipId,
      holdsCount,
    })

    session.step = SHIFT_STEPS.MENU_READY
    session.data.shiftId = shift.id
    session.data.statuses = buildStatusesFromShift(shift)
    shiftSessions.set(telegramId, session)
    setUserState(telegramId, USER_STATES.SHIFT_MENU)

    await bot.sendMessage(chatId, messages.shiftMenu.created, {
      reply_markup: {
        keyboard: buildBackKeyboard(messages.navigation.back),
        resize_keyboard: true,
      },
    })

    await renderShiftMenu({ bot, chatId, session, messages, telegramId })
  } catch (error) {
    logger.error('Ошибка при создании смены', { error: error.message })
    await bot.sendMessage(chatId, messages.systemError)
    setUserState(telegramId, USER_STATES.MAIN_PANEL)
    shiftSessions.delete(telegramId)
    // TODO: уведомить админов о падении создания смены
  }
}

function buildHoldsKeyboard() {
  return [[{ text: '1' }, { text: '2' }, { text: '3' }], [{ text: '4' }, { text: '5' }, { text: '6' }], [{ text: '7' }]]
}

function parseShiftDate(text, todayButton) {
  if (!text) {
    return null
  }

  if (text === todayButton) {
    const today = new Date()
    today.setUTCHours(0, 0, 0, 0)
    return today
  }

  const match = text.match(/^(\d{2})\.(\d{2})\.(\d{4})$/)

  if (!match) {
    return null
  }

  const [, dayStr, monthStr, yearStr] = match
  const day = Number.parseInt(dayStr, 10)
  const month = Number.parseInt(monthStr, 10) - 1
  const year = Number.parseInt(yearStr, 10)

  const date = new Date(Date.UTC(year, month, day))

  if (
    Number.isNaN(date.getTime()) ||
    date.getUTCDate() !== day ||
    date.getUTCMonth() !== month ||
    date.getUTCFullYear() !== year
  ) {
    return null
  }

  return date
}

// Отрисовка меню смены с inline-клавиатурой и кнопкой возврата
async function renderShiftMenu({ bot, chatId, session, messages, telegramId }) {
  const menuText = messages.shiftMenu.menu({
    date: formatDateHuman(session.data.date),
    brigadierName: session.data.brigadierName,
    shipName: session.data.shipName,
    holdsCount: session.data.holdsCount,
    statuses: session.data.statuses,
  })

  const keyboard = buildShiftMenuKeyboard({
    statuses: session.data.statuses,
  })

  const menuMessage = await bot.sendMessage(chatId, menuText, {
    reply_markup: {
      inline_keyboard: keyboard,
    },
    parse_mode: 'HTML',
  })

  const backKeyboardMessage = await bot.sendMessage(chatId, messages.shiftMenu.backKeyboardHint, {
    reply_markup: {
      keyboard: buildBackKeyboard(messages.navigation.back),
      resize_keyboard: true,
    },
  })

  if (telegramId) {
    shiftSessions.set(telegramId, {
      ...session,
      data: {
        ...session.data,
        menuMessageId: menuMessage.message_id,
        backKeyboardMessageId: backKeyboardMessage.message_id,
      },
    })
  }
}

// Добавляем кнопку "Назад" к любым клавиатурам ввода
function buildKeyboardWithBack(baseKeyboard, backText) {
  const safeKeyboard = Array.isArray(baseKeyboard) && baseKeyboard.length ? baseKeyboard : []
  return [...safeKeyboard, [{ text: backText }]]
}

// Русский комментарий: централизованно чистим следы меню смены
async function clearShiftMenuMessages({ bot, chatId, session, logger }) {
  const menuMessageId = session?.data?.menuMessageId
  const backKeyboardMessageId = session?.data?.backKeyboardMessageId

  if (menuMessageId) {
    try {
      await bot.editMessageReplyMarkup(
        { inline_keyboard: [] },
        { chat_id: chatId, message_id: menuMessageId },
      )
    } catch (error) {
      if (!String(error.message || '').includes('message is not modified')) {
        logger?.warn('Не удалось очистить inline-клавиатуру меню смены', { error: error.message })
      }
    }
  }

  if (backKeyboardMessageId) {
    try {
      await bot.deleteMessage(chatId, backKeyboardMessageId)
    } catch (error) {
      logger?.warn('Не удалось удалить сообщение с кнопкой "Назад"', { error: error.message })
    }
  }
}

// Русский комментарий: единая точка выхода из сценариев смены
async function handleBackToMainMenuFromShift({ bot, chatId, telegramId, session, messages, logger, returnToMainPanel }) {
  await backToMainMenu({
    bot,
    chatId,
    telegramId,
    messages,
    logger,
    cleanups: [
      () => clearShiftMenuMessages({ bot, chatId, session, logger }),
      () => shiftSessions.delete(telegramId),
    ],
    openMainMenu: () => returnToMainPanel?.({ chatId, telegramId }),
  })
}

module.exports = {
  registerShiftMenuModule,
  startShiftMenuFlow,
  openShiftMenu,
}
