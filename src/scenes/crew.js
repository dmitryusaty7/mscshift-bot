const { USER_STATES, setUserState, getUserState } = require('../bot/middlewares/session')
const { formatDateHuman } = require('../utils/time')

const CREW_STEPS = {
  INTRO: 'INTRO',
  HUB: 'HUB',
  DEPUTY_INPUT: 'DEPUTY_INPUT',
  DRIVER_INPUT: 'DRIVER_INPUT',
  WORKER_INPUT: 'WORKER_INPUT',
}

const crewSessions = new Map()

// Регистрация обработчиков сцены состава бригады
function registerCrewScene({ bot, logger, messages, crewRepo, shiftsRepo, brigadiersRepo, openShiftMenu }) {
  bot.on('callback_query', async (query) => {
    const action = query.data

    if (!action || !action.startsWith('crew:')) {
      return
    }

    const telegramId = query.from?.id
    const chatId = query.message?.chat.id
    const session = telegramId ? crewSessions.get(telegramId) : null

    if (!session || !chatId) {
      await bot.answerCallbackQuery(query.id)
      return
    }

    try {
      if (action === 'crew:deputy') {
        await bot.answerCallbackQuery(query.id)
        await askDeputyInput({ bot, chatId, telegramId, session, messages })
        return
      }

      if (action === 'crew:driver') {
        await bot.answerCallbackQuery(query.id)
        await askDriverInput({ bot, chatId, telegramId, session, messages })
        return
      }

      if (action === 'crew:addWorker') {
        await bot.answerCallbackQuery(query.id)
        await askWorkerInput({ bot, chatId, telegramId, session, messages })
        return
      }

      if (action === 'crew:skipDeputy') {
        await bot.answerCallbackQuery(query.id)
        await clearDeputyHandler({ bot, chatId, telegramId, session, messages, crewRepo, logger })
        return
      }

      if (action === 'crew:confirm') {
        await bot.answerCallbackQuery(query.id)
        await completeCrewFlow({ chatId, telegramId, session, bot, brigadiersRepo, shiftsRepo, messages, logger, openShiftMenu, crewRepo })
        return
      }

      if (action === 'crew:hub') {
        await bot.answerCallbackQuery(query.id)
        await renderHub({ bot, chatId, telegramId, session, crewRepo, messages, logger })
        return
      }

      if (action.startsWith('crew:worker:remove:')) {
        await bot.answerCallbackQuery(query.id)
        const workerId = Number.parseInt(action.split(':')[3], 10)
        if (Number.isInteger(workerId)) {
          await removeWorkerHandler({ bot, chatId, telegramId, session, workerId, crewRepo, messages, logger })
        }
        return
      }

      await bot.answerCallbackQuery(query.id)
    } catch (error) {
      logger.error('Ошибка обработки callback в сцене состава', { error: error.message })
      await bot.answerCallbackQuery(query.id)
      await bot.sendMessage(chatId, messages.crew.unexpectedError)
    }
  })

  bot.on('message', async (msg) => {
    const telegramId = msg.from?.id
    const chatId = msg.chat.id

    if (!telegramId || !/^\d+$/.test(String(telegramId))) {
      return
    }

    if (getUserState(telegramId) !== USER_STATES.SHIFT_CREW) {
      return
    }

    const session = crewSessions.get(telegramId)

    if (!session) {
      return
    }

    if (msg.text?.startsWith('/')) {
      return
    }

    if (msg.text === messages.crew.backToShiftMenuButton) {
      await completeCrewFlow({
        chatId,
        telegramId,
        session,
        bot,
        brigadiersRepo,
        shiftsRepo,
        messages,
        logger,
        openShiftMenu,
        crewRepo,
        forceReturn: true,
      })
      return
    }

    if (msg.text === messages.navigation.back && session.step !== CREW_STEPS.HUB) {
      await renderHub({ bot, chatId, telegramId, session, crewRepo, messages, logger })
      return
    }

    switch (session.step) {
      case CREW_STEPS.INTRO:
        await handleIntroNavigation({ bot, chatId, telegramId, text: msg.text, session, crewRepo, messages })
        break
      case CREW_STEPS.DEPUTY_INPUT:
        await handleDeputyInput({ bot, chatId, telegramId, text: msg.text, session, crewRepo, messages, logger })
        break
      case CREW_STEPS.DRIVER_INPUT:
        await handleDriverInput({ bot, chatId, telegramId, text: msg.text, session, crewRepo, messages, logger })
        break
      case CREW_STEPS.WORKER_INPUT:
        await handleWorkerInput({ bot, chatId, telegramId, text: msg.text, session, crewRepo, messages, logger })
        break
      case CREW_STEPS.HUB:
      default:
        break
    }
  })

  async function openCrewFromShiftMenu({ chatId, telegramId, session }) {
    try {
      const shiftId = session?.data?.shiftId
      const brigadierId = session?.data?.brigadierId

      if (!shiftId || !brigadierId) {
        await bot.sendMessage(chatId, messages.systemError)
        return
      }

      crewSessions.set(telegramId, {
        step: CREW_STEPS.INTRO,
        data: {
          shiftId,
          brigadierId,
          shipName: session?.data?.shipName,
          date: session?.data?.date,
          hubMessageId: null,
        },
      })

      setUserState(telegramId, USER_STATES.SHIFT_CREW)

      await bot.sendMessage(chatId, messages.crew.intro, {
        reply_markup: {
          keyboard: [[{ text: messages.crew.startButton }], [{ text: messages.crew.backToShiftMenuButton }]],
          resize_keyboard: true,
        },
      })
    } catch (error) {
      logger.error('Не удалось открыть сцену состава бригады', { error: error.message })
      await bot.sendMessage(chatId, messages.crew.unexpectedError)
    }
  }

  return { openCrewFromShiftMenu }
}

// Русский комментарий: отображаем хаб с текущим состоянием состава
async function renderHub({ bot, chatId, telegramId, session, crewRepo, messages, logger }) {
  try {
    const crew = await crewRepo.getCrewByShift(session.data.shiftId)
    const ready = Boolean(crew.driver && crew.workers.length)
    const title = messages.crew.hubTitle({
      shipName: session.data.shipName,
      date: session.data.date ? formatDateHuman(session.data.date) : null,
    })
    const body = messages.crew.hubBody({
      deputy: crew.deputy?.fullName || null,
      driver: crew.driver?.fullName || null,
      workers: crew.workers.map((worker) => worker.fullName),
      ready,
    })
    const keyboard = buildHubKeyboard({ crew, ready })

    if (session.data.hubMessageId) {
      try {
        await bot.editMessageText([title, body].filter(Boolean).join('\n\n'), {
          chat_id: chatId,
          message_id: session.data.hubMessageId,
          reply_markup: { inline_keyboard: keyboard },
          parse_mode: 'HTML',
        })
      } catch (error) {
        if (!String(error.message || '').includes('message is not modified')) {
          throw error
        }
      }
    } else {
      const hubMessage = await bot.sendMessage(chatId, [title, body].filter(Boolean).join('\n\n'), {
        reply_markup: { inline_keyboard: keyboard },
        parse_mode: 'HTML',
      })
      crewSessions.set(telegramId, {
        ...session,
        step: CREW_STEPS.HUB,
        data: { ...session.data, hubMessageId: hubMessage.message_id },
      })
      return
    }

    crewSessions.set(telegramId, {
      ...session,
      step: CREW_STEPS.HUB,
      data: { ...session.data },
    })
  } catch (error) {
    logger?.error('Ошибка при отрисовке хаба состава', { error: error.message })
    await bot.sendMessage(chatId, messages.crew.unexpectedError)
  }
}

// Русский комментарий: просим ФИО заместителя
async function askDeputyInput({ bot, chatId, telegramId, session, messages }) {
  crewSessions.set(telegramId, { ...session, step: CREW_STEPS.DEPUTY_INPUT })
  await bot.sendMessage(chatId, messages.crew.deputy.ask, {
    reply_markup: {
      keyboard: [
        [{ text: messages.crew.deputy.skipButton }],
        [{ text: messages.navigation.back }],
        [{ text: messages.crew.backToShiftMenuButton }],
      ],
      resize_keyboard: true,
    },
  })
}

// Русский комментарий: просим ФИО водителя
async function askDriverInput({ bot, chatId, telegramId, session, messages }) {
  crewSessions.set(telegramId, { ...session, step: CREW_STEPS.DRIVER_INPUT })
  await bot.sendMessage(chatId, messages.crew.driver.ask, {
    reply_markup: {
      keyboard: [[{ text: messages.navigation.back }], [{ text: messages.crew.backToShiftMenuButton }]],
      resize_keyboard: true,
    },
  })
}

// Русский комментарий: просим ФИО рабочего
async function askWorkerInput({ bot, chatId, telegramId, session, messages }) {
  crewSessions.set(telegramId, { ...session, step: CREW_STEPS.WORKER_INPUT })
  await bot.sendMessage(chatId, messages.crew.workers.ask, {
    reply_markup: {
      keyboard: [[{ text: messages.navigation.back }], [{ text: messages.crew.backToShiftMenuButton }]],
      resize_keyboard: true,
    },
  })
}

// Русский комментарий: навигация с интро-экрана
async function handleIntroNavigation({ bot, chatId, telegramId, text, session, crewRepo, messages }) {
  if (text === messages.crew.startButton) {
    await renderHub({ bot, chatId, telegramId, session, crewRepo, messages, logger })
    return
  }

  if (text === messages.crew.backToShiftMenuButton) {
    return
  }
}

// Русский комментарий: обработка ввода заместителя
async function handleDeputyInput({ bot, chatId, telegramId, text, session, crewRepo, messages, logger }) {
  if (text === messages.crew.deputy.skipButton) {
    await clearDeputyHandler({ bot, chatId, telegramId, session, messages, crewRepo, logger })
    return
  }

  if (!isValidFullName(text)) {
    await bot.sendMessage(chatId, messages.crew.validationError)
    return
  }

  try {
    const existingCrew = await crewRepo.getCrewByShift(session.data.shiftId)

    if (!existingCrew.driver) {
      await bot.sendMessage(chatId, messages.crew.deputy.driverMissing)
      await renderHub({ bot, chatId, telegramId, session, crewRepo, messages, logger })
      return
    }

    const worker = await crewRepo.findOrCreateWorker(normalizeName(text))
    const updated = await crewRepo.updateDeputy({ shiftId: session.data.shiftId, deputyWorkerId: worker.id })

    if (!updated) {
      await bot.sendMessage(chatId, messages.crew.deputy.driverMissing)
      await renderHub({ bot, chatId, telegramId, session, crewRepo, messages, logger })
      return
    }

    await crewRepo.recalcCrewFilled(session.data.shiftId)
    await bot.sendMessage(chatId, messages.crew.deputy.saved(normalizeName(text)))
    await renderHub({ bot, chatId, telegramId, session, crewRepo, messages, logger })
  } catch (error) {
    logger.error('Ошибка при сохранении заместителя', { error: error.message })
    await bot.sendMessage(chatId, messages.crew.unexpectedError)
  }
}

// Русский комментарий: обработка ввода водителя
async function handleDriverInput({ bot, chatId, telegramId, text, session, crewRepo, messages, logger }) {
  if (!isValidFullName(text)) {
    await bot.sendMessage(chatId, messages.crew.validationError)
    return
  }

  try {
    const crew = await crewRepo.getCrewByShift(session.data.shiftId)
    const driver = await crewRepo.findOrCreateDriver(normalizeName(text))

    await crewRepo.upsertDriver({
      shiftId: session.data.shiftId,
      driverId: driver.id,
      deputyWorkerId: crew.deputy?.id ?? null,
    })

    await crewRepo.recalcCrewFilled(session.data.shiftId)
    await bot.sendMessage(chatId, messages.crew.driver.saved(normalizeName(text)))
    await renderHub({ bot, chatId, telegramId, session, crewRepo, messages, logger })
  } catch (error) {
    logger.error('Ошибка при сохранении водителя', { error: error.message })
    await bot.sendMessage(chatId, messages.crew.unexpectedError)
  }
}

// Русский комментарий: обработка ввода рабочего
async function handleWorkerInput({ bot, chatId, telegramId, text, session, crewRepo, messages, logger }) {
  if (!isValidFullName(text)) {
    await bot.sendMessage(chatId, messages.crew.validationError)
    return
  }

  try {
    const worker = await crewRepo.findOrCreateWorker(normalizeName(text))
    const added = await crewRepo.addWorkerToShift({ shiftId: session.data.shiftId, workerId: worker.id })

    if (!added) {
      await bot.sendMessage(chatId, messages.crew.workers.duplicate)
      await renderHub({ bot, chatId, telegramId, session, crewRepo, messages, logger })
      return
    }

    await crewRepo.recalcCrewFilled(session.data.shiftId)
    await bot.sendMessage(chatId, messages.crew.workers.added(normalizeName(text)))
    await renderHub({ bot, chatId, telegramId, session, crewRepo, messages, logger })
  } catch (error) {
    logger.error('Ошибка при добавлении рабочего', { error: error.message })
    await bot.sendMessage(chatId, messages.crew.unexpectedError)
  }
}

// Русский комментарий: обработка удаления рабочего
async function removeWorkerHandler({ bot, chatId, telegramId, session, workerId, crewRepo, messages, logger }) {
  try {
    const crew = await crewRepo.getCrewByShift(session.data.shiftId)
    const worker = crew.workers.find((item) => item.id === workerId)

    const removed = await crewRepo.removeWorkerFromShift({ shiftId: session.data.shiftId, workerId })

    if (removed) {
      await bot.sendMessage(chatId, messages.crew.workers.removed(worker?.fullName || ''))
    }

    await crewRepo.recalcCrewFilled(session.data.shiftId)
    await renderHub({ bot, chatId, telegramId, session, crewRepo, messages, logger })
  } catch (error) {
    logger.error('Ошибка при удалении рабочего', { error: error.message })
    await bot.sendMessage(chatId, messages.crew.unexpectedError)
  }
}

// Русский комментарий: очищаем заместителя
async function clearDeputyHandler({ bot, chatId, telegramId, session, messages, crewRepo, logger }) {
  try {
    const updated = await crewRepo.clearDeputy(session.data.shiftId)

    if (!updated) {
      await bot.sendMessage(chatId, messages.crew.deputy.driverMissing)
      await renderHub({ bot, chatId, telegramId, session, crewRepo, messages, logger })
      return
    }

    await crewRepo.recalcCrewFilled(session.data.shiftId)
    await bot.sendMessage(chatId, messages.crew.deputy.cleared)
    await renderHub({ bot, chatId, telegramId, session, crewRepo, messages, logger })
  } catch (error) {
    logger.error('Ошибка при очистке заместителя', { error: error.message })
    await bot.sendMessage(chatId, messages.crew.unexpectedError)
  }
}

// Русский комментарий: финализируем сцену и возвращаем меню смены
async function completeCrewFlow({ chatId, telegramId, session, bot, brigadiersRepo, shiftsRepo, messages, logger, openShiftMenu, crewRepo, forceReturn = false }) {
  try {
    const crew = await crewRepo.getCrewByShift(session.data.shiftId)
    const hasDriver = Boolean(crew.driver)
    const hasWorkers = Boolean(crew.workers.length)
    const ready = hasDriver && hasWorkers

    if (!ready && !forceReturn) {
      if (!hasDriver) {
        await bot.sendMessage(chatId, messages.crew.driver.missing)
      }

      if (!hasWorkers) {
        await bot.sendMessage(chatId, messages.crew.workers.empty)
      }

      await renderHub({ bot, chatId, telegramId, session, crewRepo, messages, logger })
      return
    }

    await crewRepo.recalcCrewFilled(session.data.shiftId)

    const brigadier = await brigadiersRepo.findByTelegramId(String(telegramId))
    const shift = brigadier
      ? await shiftsRepo.findActiveByIdAndBrigadier({ shiftId: session.data.shiftId, brigadierId: brigadier.id })
      : null

    if (brigadier && shift) {
      await bot.sendMessage(chatId, ready ? messages.crew.confirmReady : messages.crew.returnToMenu)
      crewSessions.delete(telegramId)
      setUserState(telegramId, USER_STATES.SHIFT_MENU)
      await openShiftMenu({ bot, chatId, telegramId, brigadier, shift, messages, logger })
      return
    }

    await bot.sendMessage(chatId, messages.crew.unexpectedError)
  } catch (error) {
    logger.error('Ошибка завершения сцены состава', { error: error.message })
    await bot.sendMessage(chatId, messages.crew.unexpectedError)
  } finally {
    if (forceReturn) {
      crewSessions.delete(telegramId)
      setUserState(telegramId, USER_STATES.SHIFT_MENU)
    }
  }
}

// Русский комментарий: строим inline-клавиатуру для хаба
function buildHubKeyboard({ crew, ready }) {
  const keyboard = [
    [{ text: `${crew.deputy ? '✏️' : '➕'} Заместитель`, callback_data: 'crew:deputy' }],
    [{ text: `${crew.driver ? '✏️' : '➕'} Водитель`, callback_data: 'crew:driver' }],
    [{ text: '➕ Рабочий', callback_data: 'crew:addWorker' }],
  ]

  crew.workers.forEach((worker) => {
    keyboard.push([{ text: `❌ ${worker.fullName}`, callback_data: `crew:worker:remove:${worker.id}` }])
  })

  keyboard.push([{ text: '🔄 Обновить', callback_data: 'crew:hub' }])

  if (ready) {
    keyboard.push([{ text: '✅ Подтвердить состав', callback_data: 'crew:confirm' }])
  }

  return keyboard
}

// Русский комментарий: валидатор ФИО (только кириллица, минимум два слова)
function isValidFullName(value) {
  if (!value) {
    return false
  }

  const normalized = normalizeName(value)
  const parts = normalized.split(' ')

  if (parts.length < 2) {
    return false
  }

  return parts.every((part) => /^[А-ЯЁа-яё-]+$/u.test(part))
}

// Русский комментарий: нормализация пробелов в ФИО
function normalizeName(value) {
  return value.trim().replace(/\s+/g, ' ')
}

module.exports = { registerCrewScene }
