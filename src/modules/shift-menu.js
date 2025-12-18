const { USER_STATES, setUserState, getUserState } = require('../bot/middlewares/session')
const { buildShiftMenuKeyboard, buildBackKeyboard } = require('../utils/shift-menu.keyboard')
const { formatDateHuman, toPgDate } = require('../utils/time')

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

    const session = shiftSessions.get(telegramId)

    if (!session) {
      return
    }

    if (msg.text === messages.shiftMenu.backToMainButton) {
      shiftSessions.delete(telegramId)
      setUserState(telegramId, USER_STATES.MAIN_PANEL)
      await bot.sendMessage(chatId, messages.shiftMenu.backToMainStub, {
        reply_markup: { remove_keyboard: true },
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
        if (msg.text === messages.shiftMenu.backToMainButton) {
          shiftSessions.delete(telegramId)
          setUserState(telegramId, USER_STATES.MAIN_PANEL)
          await bot.sendMessage(chatId, messages.shiftMenu.backToMainStub, {
            reply_markup: { remove_keyboard: true },
          })
        }
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
        keyboard: [[{ text: messages.shiftMenu.todayButton }]],
        resize_keyboard: true,
        one_time_keyboard: true,
      },
    })
  } catch (error) {
    logger.error('Не удалось запустить сценарий создания смены', { error: error.message })
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
    reply_markup: { remove_keyboard: true },
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

  if (!shipName || !/^[A-Za-zА-Яа-яЁё0-9\-\s]{2,}$/u.test(shipName)) {
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
        keyboard: buildHoldsKeyboard(),
        resize_keyboard: true,
        one_time_keyboard: true,
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
          keyboard: [[{ text: messages.shiftMenu.todayButton }]],
          resize_keyboard: true,
          one_time_keyboard: true,
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
    session.data.statuses = {
      crewFilled: shift.crew_filled,
      wagesFilled: shift.wages_filled,
      materialsFilled: shift.materials_filled,
      expensesFilled: shift.expenses_filled,
      photosFilled: shift.photos_filled,
    }
    shiftSessions.set(telegramId, session)
    setUserState(telegramId, USER_STATES.SHIFT_MENU)

    await bot.sendMessage(chatId, messages.shiftMenu.created, {
      reply_markup: { remove_keyboard: true },
    })

    const menuText = buildShiftMenuMessage({
      date,
      brigadierName: session.data.brigadierName,
      shipName: session.data.shipName,
      holdsCount,
      statuses: session.data.statuses,
    })

    const keyboard = buildShiftMenuKeyboard({
      statuses: session.data.statuses,
    })

    await bot.sendMessage(chatId, menuText, {
      reply_markup: {
        inline_keyboard: keyboard,
      },
      parse_mode: 'HTML',
    })

    await bot.sendMessage(chatId, messages.shiftMenu.backKeyboardHint, {
      reply_markup: {
        keyboard: buildBackKeyboard(messages.shiftMenu.backToMainButton),
        resize_keyboard: true,
      },
    })
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

function buildShiftMenuMessage({ date, brigadierName, shipName, holdsCount, statuses }) {
  const icon = (filled) => (filled ? '✅' : '✍')

  return [
    '<b>Меню смены</b>',
    `Дата: <b>${formatDateHuman(date)}</b>`,
    `Бригадир: <b>${brigadierName}</b>`,
    `Судно: <b>${shipName}</b>`,
    `Количество трюмов: <b>${holdsCount}</b>`,
    '',
    'Разделы:',
    `👷 Состав бригады — ${icon(statuses.crewFilled)}`,
    `💰 Заработная плата — ${icon(statuses.wagesFilled)}`,
    `📦 Материалы — ${icon(statuses.materialsFilled)}`,
    `🧾 Расходы — ${icon(statuses.expensesFilled)}`,
    `🖼 Фото трюмов — ${icon(statuses.photosFilled)}`,
  ].join('\n')
}

module.exports = {
  registerShiftMenuModule,
  startShiftMenuFlow,
}
