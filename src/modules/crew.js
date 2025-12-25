const { USER_STATES, setUserState, getUserState } = require('../bot/middlewares/session')
const { formatDateHuman } = require('../utils/time')
const { parseFullName } = require('../utils/name-parser')

const CREW_STEPS = {
  INTRO: 'INTRO',
  HUB: 'HUB',
  DEPUTY_SURNAME: 'DEPUTY_SURNAME',
  DEPUTY_NAME: 'DEPUTY_NAME',
  DEPUTY_PATRONYMIC: 'DEPUTY_PATRONYMIC',
  DEPUTY_CONFIRM: 'DEPUTY_CONFIRM',
  DRIVER_SURNAME: 'DRIVER_SURNAME',
  DRIVER_NAME: 'DRIVER_NAME',
  DRIVER_PATRONYMIC: 'DRIVER_PATRONYMIC',
  DRIVER_CONFIRM: 'DRIVER_CONFIRM',
  WORKER_FULLNAME: 'WORKER_FULLNAME',
  WORKER_CONFIRM: 'WORKER_CONFIRM',
}

const crewSessions = new Map()

// Регистрация модуля Блока 4 — состав бригады
function registerCrewModule({ bot, logger, messages, crewRepo, shiftsRepo, brigadiersRepo, openShiftMenu, wagesRepo }) {
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
        await startFioFlow({ bot, chatId, telegramId, session, role: 'deputy', messages })
        return
      }

      if (action === 'crew:driver') {
        await bot.answerCallbackQuery(query.id)
        await startFioFlow({ bot, chatId, telegramId, session, role: 'driver', messages })
        return
      }

      if (action === 'crew:workers') {
        await bot.answerCallbackQuery(query.id)
        await startFioFlow({ bot, chatId, telegramId, session, role: 'worker', messages })
        return
      }

      if (action === 'crew:confirm') {
        await bot.answerCallbackQuery(query.id)
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
          forceReturn: false,
        })
        return
      }

      if (action.startsWith('crew:worker:remove:')) {
        await bot.answerCallbackQuery(query.id)
        const workerId = Number.parseInt(action.split(':')[3], 10)
        if (Number.isInteger(workerId)) {
          await removeWorkerHandler({
            bot,
            chatId,
            telegramId,
            session,
            workerId,
            crewRepo,
            messages,
            logger,
            wagesRepo,
          })
        }
        return
      }

      if (action.startsWith('crew:input:confirm:')) {
        await bot.answerCallbackQuery(query.id)
        const role = action.split(':')[3]
        await saveCurrentInput({ bot, chatId, telegramId, session, role, crewRepo, messages, logger })
        return
      }

      if (action.startsWith('crew:input:edit:')) {
        await bot.answerCallbackQuery(query.id)
        const role = action.split(':')[3]
        await restartRoleInput({ bot, chatId, telegramId, session, role, messages })
        return
      }

      await bot.answerCallbackQuery(query.id)
    } catch (error) {
      logger.error('Ошибка обработки callback в модуле состава', { error: error.message })
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

    if (msg.text === messages.navigation.back) {
      await renderHub({ bot, chatId, telegramId, session, crewRepo, messages, logger, withKeyboard: true })
      return
    }

    switch (session.step) {
      case CREW_STEPS.INTRO:
        await handleIntroNavigation({ bot, chatId, telegramId, text: msg.text, session, crewRepo, messages, logger })
        break
      case CREW_STEPS.DEPUTY_SURNAME:
      case CREW_STEPS.DRIVER_SURNAME:
        await handleSurnameInput({
          bot,
          chatId,
          telegramId,
          text: msg.text,
          session,
          messages,
          logger,
          crewRepo,
        })
        break
      case CREW_STEPS.DEPUTY_NAME:
      case CREW_STEPS.DRIVER_NAME:
        await handleNameInput({
          bot,
          chatId,
          telegramId,
          text: msg.text,
          session,
          messages,
          logger,
          crewRepo,
        })
        break
      case CREW_STEPS.DEPUTY_PATRONYMIC:
      case CREW_STEPS.DRIVER_PATRONYMIC:
        await handlePatronymicInput({
          bot,
          chatId,
          telegramId,
          text: msg.text,
          session,
          messages,
          logger,
          crewRepo,
        })
        break
      case CREW_STEPS.WORKER_FULLNAME:
        await handleWorkerFullNameInput({
          bot,
          chatId,
          telegramId,
          text: msg.text,
          session,
          messages,
          logger,
          crewRepo,
        })
        break
      case CREW_STEPS.WORKER_CONFIRM:
        await handleWorkerConfirmationInput({
          bot,
          chatId,
          telegramId,
          text: msg.text,
          session,
          messages,
          logger,
          crewRepo,
        })
        break
      case CREW_STEPS.HUB:
      default:
        break
    }
  })

  // Открытие Блока 4 из меню смены
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
          currentInput: null,
        },
      })

      setUserState(telegramId, USER_STATES.SHIFT_CREW)

      await bot.sendMessage(chatId, messages.crew.intro, {
        reply_markup: {
          keyboard: [
            [{ text: messages.crew.startButton }],
            [{ text: messages.crew.backToShiftMenuButton }],
          ],
          resize_keyboard: true,
        },
      })
    } catch (error) {
      logger.error('Не удалось открыть модуль состава бригады', { error: error.message })
      await bot.sendMessage(chatId, messages.crew.unexpectedError)
    }
  }

  return { openCrewFromShiftMenu }
}

// Русский комментарий: отображаем хаб состояния состава
async function renderHub({ bot, chatId, telegramId, session, crewRepo, messages, logger, withKeyboard = false }) {
  try {
    const crew = await crewRepo.getCrewByShift(session.data.shiftId)
    const ready = Boolean(crew.driver && crew.workers.length)
    const title = messages.crew.hubTitle({
      shipName: session.data.shipName,
      date: session.data.date ? formatDateHuman(session.data.date) : null,
    })
    const body = messages.crew.hubBody({
      deputy: formatShortName(crew.deputy?.fullName),
      driver: formatShortName(crew.driver?.fullName),
      workers: crew.workers.map((worker) => formatShortName(worker.fullName)),
      ready,
    })
    const keyboard = buildHubKeyboard({ crew, ready, messages })

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
        data: { ...session.data, hubMessageId: hubMessage.message_id, currentInput: null },
      })
    }

    crewSessions.set(telegramId, {
      ...session,
      step: CREW_STEPS.HUB,
      data: { ...session.data, currentInput: null },
    })

    if (withKeyboard) {
      await bot.sendMessage(chatId, messages.crew.navigationHint, {
        reply_markup: {
          keyboard: [
            [{ text: messages.navigation.back }],
            [{ text: messages.crew.backToShiftMenuButton }],
          ],
          resize_keyboard: true,
        },
      })
    }
  } catch (error) {
    logger?.error('Ошибка при отрисовке хаба состава', { error: error.message })
    await bot.sendMessage(chatId, messages.crew.unexpectedError)
  }
}

// Русский комментарий: запуск пошагового ввода ФИО для роли
async function startFioFlow({ bot, chatId, telegramId, session, role, messages }) {
  const nextStep = {
    deputy: CREW_STEPS.DEPUTY_SURNAME,
    driver: CREW_STEPS.DRIVER_SURNAME,
    worker: CREW_STEPS.WORKER_FULLNAME,
  }[role]

  crewSessions.set(telegramId, {
    ...session,
    step: nextStep,
    data: {
      ...session.data,
      currentInput: {
        role,
        surname: '',
        name: '',
        patronymic: '',
      },
    },
  })

  if (role === 'worker') {
    await askWorkerFullName({ bot, chatId, telegramId, messages })
    return
  }

  await askSurname({ bot, chatId, telegramId, role, messages })
}

// Русский комментарий: обработка выбора на интро-экране
async function handleIntroNavigation({ bot, chatId, telegramId, text, session, crewRepo, messages, logger }) {
  if (text === messages.crew.startButton) {
    await renderHub({ bot, chatId, telegramId, session, crewRepo, messages, logger, withKeyboard: true })
    return
  }

  if (text === messages.crew.backToShiftMenuButton) {
    await bot.sendMessage(chatId, messages.crew.returnToMenu)
  }
}

// Русский комментарий: запрос фамилии для роли (водитель/заместитель)
async function askSurname({ bot, chatId, telegramId, role, messages }) {
  const promptMap = {
    deputy: messages.crew.deputy.askSurname,
    driver: messages.crew.driver.askSurname,
  }

  await bot.sendMessage(chatId, promptMap[role], {
    reply_markup: {
      keyboard: [
        role === 'deputy' ? [{ text: messages.crew.deputy.skipButton }] : null,
        [{ text: messages.navigation.back }],
        [{ text: messages.crew.backToShiftMenuButton }],
      ].filter(Boolean),
      resize_keyboard: true,
    },
  })
}

// Русский комментарий: запрос имени для роли
async function askName({ bot, chatId, role, messages }) {
  const promptMap = {
    deputy: messages.crew.deputy.askName,
    driver: messages.crew.driver.askName,
  }

  await bot.sendMessage(chatId, promptMap[role], {
    reply_markup: {
      keyboard: [
        [{ text: messages.navigation.back }],
        [{ text: messages.crew.backToShiftMenuButton }],
      ],
      resize_keyboard: true,
    },
  })
}

// Русский комментарий: запрос отчества для роли
async function askPatronymic({ bot, chatId, role, messages }) {
  const promptMap = {
    deputy: messages.crew.deputy.askPatronymic,
    driver: messages.crew.driver.askPatronymic,
  }

  await bot.sendMessage(chatId, promptMap[role], {
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

// Русский комментарий: обработка ввода фамилии
async function handleSurnameInput({ bot, chatId, telegramId, text, session, messages, logger, crewRepo }) {
  const role = session.data.currentInput?.role

  if (!role) {
    await renderHub({ bot, chatId, telegramId, session, crewRepo, messages, logger })
    return
  }

  if (role === 'deputy' && text === messages.crew.deputy.skipButton) {
    await clearDeputyHandler({ bot, chatId, telegramId, session, messages, crewRepo, logger })
    return
  }

  if (!isValidNamePart(text)) {
    await bot.sendMessage(chatId, messages.crew.validationError)
    await askSurname({ bot, chatId, telegramId, role, messages })
    return
  }

  const updatedSession = {
    ...session,
    step: {
      deputy: CREW_STEPS.DEPUTY_NAME,
      driver: CREW_STEPS.DRIVER_NAME,
    }[role],
    data: {
      ...session.data,
      currentInput: {
        ...session.data.currentInput,
        role,
        surname: normalizeName(text),
      },
    },
  }

  crewSessions.set(telegramId, updatedSession)
  await askName({ bot, chatId, role, messages })
}

// Русский комментарий: обработка ввода имени
async function handleNameInput({ bot, chatId, telegramId, text, session, messages, crewRepo, logger }) {
  const role = session.data.currentInput?.role

  if (!role) {
    await renderHub({ bot, chatId, telegramId, session, crewRepo, messages, logger })
    return
  }

  if (!isValidNamePart(text)) {
    await bot.sendMessage(chatId, messages.crew.validationError)
    await askName({ bot, chatId, role, messages })
    return
  }

  const updatedSession = {
    ...session,
    step: {
      deputy: CREW_STEPS.DEPUTY_PATRONYMIC,
      driver: CREW_STEPS.DRIVER_PATRONYMIC,
    }[role],
    data: {
      ...session.data,
      currentInput: {
        ...session.data.currentInput,
        name: normalizeName(text),
      },
    },
  }

  crewSessions.set(telegramId, updatedSession)
  await askPatronymic({ bot, chatId, role, messages })
}

// Русский комментарий: обработка ввода отчества или пропуска
async function handlePatronymicInput({ bot, chatId, telegramId, text, session, messages, logger, crewRepo }) {
  const role = session.data.currentInput?.role

  if (!role) {
    await renderHub({ bot, chatId, telegramId, session, crewRepo, messages, logger })
    return
  }

  const skip = text === messages.crew.deputy.skipButton

  if (!skip && text && !isValidNamePart(text)) {
    await bot.sendMessage(chatId, messages.crew.validationError)
    await askPatronymic({ bot, chatId, role, messages })
    return
  }

  const patronymic = skip ? '' : normalizeName(text)
  const fio = formatFio({
    surname: session.data.currentInput?.surname,
    name: session.data.currentInput?.name,
    patronymic,
  })

  const updatedSession = {
    ...session,
    step: {
      deputy: CREW_STEPS.DEPUTY_CONFIRM,
      driver: CREW_STEPS.DRIVER_CONFIRM,
    }[role],
    data: {
      ...session.data,
      currentInput: {
        ...session.data.currentInput,
        patronymic,
        formatted: fio,
      },
    },
  }

  crewSessions.set(telegramId, updatedSession)

  await bot.sendMessage(chatId, messages.crew.inputPreview(fio), {
    parse_mode: 'HTML',
    reply_markup: {
      inline_keyboard: [[
        { text: messages.crew.buttons.inputConfirm, callback_data: `crew:input:confirm:${role}` },
        { text: messages.crew.buttons.inputEdit, callback_data: `crew:input:edit:${role}` },
      ]],
    },
  })
}

// Русский комментарий: запрос полного имени рабочего
async function askWorkerFullName({ bot, chatId, telegramId, messages }) {
  await bot.sendMessage(chatId, messages.crew.workers.askFullName, {
    reply_markup: {
      keyboard: [
        [{ text: messages.navigation.back }],
        [{ text: messages.crew.backToShiftMenuButton }],
      ],
      resize_keyboard: true,
    },
  })
}

// Русский комментарий: обработка ввода полного имени рабочего
async function handleWorkerFullNameInput({ bot, chatId, telegramId, text, session, messages, logger, crewRepo }) {
  const role = session.data.currentInput?.role

  if (!role) {
    await renderHub({ bot, chatId, telegramId, session, crewRepo, messages, logger })
    return
  }

  const parsed = parseFullName(text)

  if (!parsed.ok) {
    await bot.sendMessage(chatId, parsed.errorMessage)
    await askWorkerFullName({ bot, chatId, telegramId, messages })
    return
  }

  const updatedSession = {
    ...session,
    step: CREW_STEPS.WORKER_CONFIRM,
    data: {
      ...session.data,
      currentInput: {
        role,
        surname: parsed.surname,
        name: parsed.name,
        patronymic: '',
        formatted: parsed.normalizedFullName,
      },
    },
  }

  crewSessions.set(telegramId, updatedSession)

  await bot.sendMessage(chatId, messages.crew.workers.confirmAdd(parsed.normalizedFullName), {
    reply_markup: {
      keyboard: [
        [{ text: messages.crew.workers.confirmButton }],
        [{ text: messages.navigation.back }],
        [{ text: messages.crew.backToShiftMenuButton }],
      ],
      resize_keyboard: true,
    },
  })
}

// Русский комментарий: обработка подтверждения добавления рабочего
async function handleWorkerConfirmationInput({
  bot,
  chatId,
  telegramId,
  text,
  session,
  messages,
  logger,
  crewRepo,
}) {
  if (text === messages.crew.workers.confirmButton) {
    await saveCurrentInput({ bot, chatId, telegramId, session, role: 'worker', crewRepo, messages, logger })
    return
  }

  await bot.sendMessage(chatId, messages.crew.workers.confirmationHint, {
    reply_markup: {
      keyboard: [
        [{ text: messages.crew.workers.confirmButton }],
        [{ text: messages.navigation.back }],
        [{ text: messages.crew.backToShiftMenuButton }],
      ],
      resize_keyboard: true,
    },
  })
}

// Русский комментарий: повторный запуск шага для роли
async function restartRoleInput({ bot, chatId, telegramId, session, role, messages }) {
  const updatedSession = {
    ...session,
    step: {
      deputy: CREW_STEPS.DEPUTY_SURNAME,
      driver: CREW_STEPS.DRIVER_SURNAME,
      worker: CREW_STEPS.WORKER_FULLNAME,
    }[role],
    data: {
      ...session.data,
      currentInput: {
        role,
        surname: '',
        name: '',
        patronymic: '',
      },
    },
  }

  crewSessions.set(telegramId, updatedSession)
  if (role === 'worker') {
    await askWorkerFullName({ bot, chatId, telegramId, messages })
  } else {
    await askSurname({ bot, chatId, telegramId, role, messages })
  }
}

// Русский комментарий: сохранение введённого ФИО в БД в зависимости от роли
async function saveCurrentInput({ bot, chatId, telegramId, session, role, crewRepo, messages, logger }) {
  const input = session.data.currentInput

  if (!input || input.role !== role) {
    await bot.sendMessage(chatId, messages.crew.unexpectedError)
    return
  }

  const fio = input.formatted || formatFio(input)

  try {
    if (role === 'driver') {
      const crew = await crewRepo.getCrewByShift(session.data.shiftId)
      const driver = await crewRepo.findOrCreateDriver(fio)

      await crewRepo.upsertDriver({
        shiftId: session.data.shiftId,
        driverId: driver.id,
        deputyWorkerId: crew.deputy?.id ?? null,
      })

      await crewRepo.recalcCrewFilled(session.data.shiftId)
      await bot.sendMessage(chatId, messages.crew.driver.saved(fio))
    } else if (role === 'deputy') {
      const existingCrew = await crewRepo.getCrewByShift(session.data.shiftId)

      if (!existingCrew.driver) {
        await bot.sendMessage(chatId, messages.crew.deputy.driverMissing)
        await renderHub({ bot, chatId, telegramId, session, crewRepo, messages, logger })
        return
      }

      const worker = await crewRepo.findOrCreateWorker(fio)
      await crewRepo.updateDeputy({ shiftId: session.data.shiftId, deputyWorkerId: worker.id })
      await crewRepo.recalcCrewFilled(session.data.shiftId)
      await bot.sendMessage(chatId, messages.crew.deputy.saved(fio))
    } else if (role === 'worker') {
      const worker = await crewRepo.findOrCreateWorker(fio)
      const added = await crewRepo.addWorkerToShift({ shiftId: session.data.shiftId, workerId: worker.id })

      if (!added) {
        await bot.sendMessage(chatId, messages.crew.workers.duplicate)
        await renderHub({ bot, chatId, telegramId, session, crewRepo, messages, logger })
        return
      }

      await crewRepo.recalcCrewFilled(session.data.shiftId)
      await bot.sendMessage(chatId, messages.crew.workers.added(fio))
    }

    const updatedSession = {
      ...session,
      data: {
        ...session.data,
        currentInput: null,
      },
    }

    crewSessions.set(telegramId, updatedSession)
    await renderHub({ bot, chatId, telegramId, session: updatedSession, crewRepo, messages, logger, withKeyboard: true })
  } catch (error) {
    logger.error('Ошибка при сохранении данных роли', { error: error.message })
    await bot.sendMessage(chatId, messages.crew.unexpectedError)
  }
}


// Русский комментарий: обработка удаления рабочего
async function removeWorkerHandler({
  bot,
  chatId,
  telegramId,
  session,
  workerId,
  crewRepo,
  messages,
  logger,
  wagesRepo,
}) {
  try {
    const crew = await crewRepo.getCrewByShift(session.data.shiftId)
    const worker = crew.workers.find((item) => item.id === workerId)

    const removed = await crewRepo.removeWorkerFromShift({ shiftId: session.data.shiftId, workerId })
    // TODO: Review for merge — полностью удаляем запись рабочего, чтобы не оставлять сироты
    if (removed) {
      await crewRepo.deleteWorkerWithRelations(workerId)
      // TODO: Review for merge — удаляем зарплату рабочего и сбрасываем статусы зарплаты
      if (wagesRepo) {
        await wagesRepo.deleteWorkerWage({ shiftId: session.data.shiftId, workerId })
        await wagesRepo.recalcWorkersTotal(session.data.shiftId)
        await wagesRepo.invalidateSalaryFlag(session.data.shiftId)
      }
    }

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

// Русский комментарий: очистка заместителя
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
    const updatedSession = {
      ...session,
      data: { ...session.data, currentInput: null },
    }
    crewSessions.set(telegramId, updatedSession)
    await renderHub({ bot, chatId, telegramId, session: updatedSession, crewRepo, messages, logger, withKeyboard: true })
  } catch (error) {
    logger.error('Ошибка при очистке заместителя', { error: error.message })
    await bot.sendMessage(chatId, messages.crew.unexpectedError)
  }
}

// Русский комментарий: завершение модуля состава и возврат в меню смены
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

    // TODO: Code Review for mergeability
    if (brigadier && shift) {
      await bot.sendMessage(chatId, ready ? messages.crew.confirmReady : messages.crew.returnToMenu)
      crewSessions.delete(telegramId)
      setUserState(telegramId, USER_STATES.SHIFT_MENU)
      await openShiftMenu({ bot, chatId, telegramId, brigadier, shift, messages, logger })
      return
    }

    await bot.sendMessage(chatId, messages.crew.unexpectedError)
  } catch (error) {
    logger.error('Ошибка завершения модуля состава', { error: error.message })
    await bot.sendMessage(chatId, messages.crew.unexpectedError)
  } finally {
    if (forceReturn) {
      crewSessions.delete(telegramId)
      setUserState(telegramId, USER_STATES.SHIFT_MENU)
    }
  }
}

// Русский комментарий: строим inline-клавиатуру хаба
function buildHubKeyboard({ crew, ready, messages }) {
  const keyboard = [
    [{ text: messages.crew.buttons.driver, callback_data: 'crew:driver' }],
    [{ text: messages.crew.buttons.deputy, callback_data: 'crew:deputy' }],
    [{ text: messages.crew.buttons.workers, callback_data: 'crew:workers' }],
  ]

  crew.workers.forEach((worker) => {
    keyboard.push([{ text: `❌ ${formatShortName(worker.fullName)}`, callback_data: `crew:worker:remove:${worker.id}` }])
  })

  if (ready) {
    keyboard.push([{ text: messages.crew.buttons.confirm, callback_data: 'crew:confirm' }])
  }

  return keyboard
}

// Русский комментарий: валидация части ФИО (кириллица, первая буква заглавная, допускается дефис)
function isValidNamePart(value) {
  if (!value) {
    return false
  }

  return /^[А-ЯЁ][а-яё-]+$/u.test(value.trim())
}

// Русский комментарий: нормализация пробелов в ФИО
function normalizeName(value) {
  return value.trim().replace(/\s+/g, ' ')
}

// Русский комментарий: форматирование ФИО в вид «Фамилия И. О.»
function formatFio({ surname, name, patronymic }) {
  const safeSurname = surname ? normalizeName(surname) : ''
  const safeName = name ? normalizeName(name) : ''
  const safePatronymic = patronymic ? normalizeName(patronymic) : ''

  const initials = [safeName, safePatronymic]
    .filter(Boolean)
    .map((part) => `${part.charAt(0)}.`)
    .join(' ')

  return [safeSurname, initials].filter(Boolean).join(' ')
}

// Русский комментарий: отображение ФИО в коротком виде для хаба
function formatShortName(value) {
  if (!value) {
    return null
  }

  const parts = normalizeName(value).split(' ')

  if (parts.length === 1) {
    return parts[0]
  }

  const [surname, ...rest] = parts
  const initials = rest.map((part) => `${part.charAt(0)}.`).join(' ')
  return `${surname} ${initials}`.trim()
}

module.exports = { registerCrewModule }
