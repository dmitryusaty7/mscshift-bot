const { USER_STATES, setUserState, getUserState } = require('../bot/middlewares/session')

const SALARY_STEPS = {
  INTRO: 'INTRO',
  HUB: 'HUB',
  INPUT_BRIGADIER: 'INPUT_BRIGADIER',
  INPUT_DEPUTY: 'INPUT_DEPUTY',
  INPUT_DRIVER: 'INPUT_DRIVER',
  INPUT_WORKER: 'INPUT_WORKER',
}

const salarySessions = new Map()

// TODO: Review for merge — регистрация модуля Блока 5
function registerSalaryModule({ bot, logger, messages, crewRepo, wagesRepo, shiftsRepo, brigadiersRepo, openShiftMenu }) {
  bot.on('callback_query', async (query) => {
    const action = query.data

    if (!action || !action.startsWith('salary:')) {
      return
    }

    const telegramId = query.from?.id
    const chatId = query.message?.chat.id
    const session = telegramId ? salarySessions.get(telegramId) : null

    if (!session || !chatId) {
      await bot.answerCallbackQuery(query.id)
      return
    }

    try {
      if (action === 'salary:brigadier') {
        await bot.answerCallbackQuery(query.id)
        await renderRoleInput({ bot, chatId, telegramId, role: 'brigadier', messages })
        return
      }

      if (action === 'salary:deputy') {
        await bot.answerCallbackQuery(query.id)
        await renderRoleInput({ bot, chatId, telegramId, role: 'deputy', messages })
        return
      }

      if (action === 'salary:driver') {
        await bot.answerCallbackQuery(query.id)
        await renderRoleInput({ bot, chatId, telegramId, role: 'driver', messages })
        return
      }

      if (action.startsWith('salary:worker:')) {
        await bot.answerCallbackQuery(query.id)
        const workerId = Number.parseInt(action.split(':')[2], 10)
        if (Number.isInteger(workerId)) {
          await renderWorkerInput({ bot, chatId, telegramId, workerId, messages, crewRepo, wagesRepo })
        }
        return
      }

      if (action === 'salary:recalc') {
        await bot.answerCallbackQuery(query.id)
        await wagesRepo.recalcWorkersTotal(session.shiftId)
        await renderSalaryHub({ bot, chatId, telegramId, messages, crewRepo, wagesRepo })
        return
      }

      if (action === 'salary:confirm') {
        await bot.answerCallbackQuery(query.id)
        await completeSalaryFlow({
          bot,
          chatId,
          telegramId,
          messages,
          crewRepo,
          wagesRepo,
          shiftsRepo,
          brigadiersRepo,
          openShiftMenu,
        })
        return
      }

      await bot.answerCallbackQuery(query.id)
    } catch (error) {
      logger.error('Ошибка обработки callback в модуле зарплаты', { error: error.message })
      await bot.answerCallbackQuery(query.id)
    }
  })

  bot.on('message', async (msg) => {
    const telegramId = msg.from?.id
    const chatId = msg.chat.id

    if (!telegramId || !/^\d+$/.test(String(telegramId))) {
      return
    }

    if (getUserState(telegramId) !== USER_STATES.SHIFT_SALARY) {
      return
    }

    const session = salarySessions.get(telegramId)

    if (!session) {
      return
    }

    if (msg.text?.startsWith('/')) {
      return
    }

    if (msg.text === messages.salary.hub.backToShift) {
      await returnToShiftMenu({
        bot,
        chatId,
        telegramId,
        brigadiersRepo,
        shiftsRepo,
        messages,
        logger,
        session,
        openShiftMenu,
      })
      return
    }

    if (msg.text === messages.navigation.back && session.currentStep === SALARY_STEPS.INTRO) {
      await returnToShiftMenu({
        bot,
        chatId,
        telegramId,
        brigadiersRepo,
        shiftsRepo,
        messages,
        logger,
        session,
        openShiftMenu,
      })
      return
    }

    if (msg.text === messages.navigation.back || msg.text === messages.salary.input.backButton) {
      await handleBackNavigation({ bot, chatId, telegramId, messages, crewRepo, wagesRepo })
      return
    }

    switch (session.currentStep) {
      case SALARY_STEPS.INTRO:
        await handleIntroInput({
          bot,
          chatId,
          telegramId,
          text: msg.text,
          messages,
          crewRepo,
          wagesRepo,
          logger,
        })
        break
      case SALARY_STEPS.INPUT_BRIGADIER:
        await handleRoleAmount({
          bot,
          chatId,
          telegramId,
          text: msg.text,
          role: 'brigadier',
          messages,
          wagesRepo,
          crewRepo,
        })
        break
      case SALARY_STEPS.INPUT_DEPUTY:
        await handleRoleAmount({
          bot,
          chatId,
          telegramId,
          text: msg.text,
          role: 'deputy',
          messages,
          wagesRepo,
          crewRepo,
        })
        break
      case SALARY_STEPS.INPUT_DRIVER:
        await handleRoleAmount({
          bot,
          chatId,
          telegramId,
          text: msg.text,
          role: 'driver',
          messages,
          wagesRepo,
          crewRepo,
        })
        break
      case SALARY_STEPS.INPUT_WORKER:
        await handleWorkerAmount({
          bot,
          chatId,
          telegramId,
          text: msg.text,
          messages,
          crewRepo,
          wagesRepo,
        })
        break
      case SALARY_STEPS.HUB:
      default:
        break
    }
  })

  return {
    openSalaryFromShiftMenu: ({ chatId, telegramId, session }) =>
      startSalaryFlow({ bot, chatId, telegramId, session, messages, crewRepo, wagesRepo, logger }),
  }
}

// TODO: Review for merge — запуск блока заработной платы из меню смены
async function startSalaryFlow({ bot, chatId, telegramId, session, messages, crewRepo, wagesRepo, logger }) {
  try {
    const shiftId = session?.data?.shiftId

    if (!shiftId) {
      await bot.sendMessage(chatId, messages.salary.errors.unavailable)
      return
    }

    const crew = await crewRepo.getCrewByShift(shiftId)

    if (!crew?.driver || !crew?.workers?.length) {
      await bot.sendMessage(chatId, messages.salary.errors.unavailable)
      return
    }

    await wagesRepo.ensureShiftWages(shiftId)

    salarySessions.set(telegramId, {
      shiftId,
      currentStep: SALARY_STEPS.INTRO,
      selectedWorkerId: null,
      messageId: null,
    })

    setUserState(telegramId, USER_STATES.SHIFT_SALARY)

    await bot.sendMessage(chatId, messages.salary.intro.text, {
      reply_markup: {
        keyboard: [
          [{ text: messages.salary.intro.startButton }],
          [{ text: messages.navigation.back }],
        ],
        resize_keyboard: true,
      },
    })
  } catch (error) {
    logger.error('Не удалось запустить блок заработной платы', { error: error.message })
    await bot.sendMessage(chatId, messages.systemError)
  }
}

// TODO: Review for merge — обработка ввода на экране приветствия
async function handleIntroInput({ bot, chatId, telegramId, text, messages, crewRepo, wagesRepo, logger }) {
  if (text === messages.salary.intro.startButton) {
    const session = salarySessions.get(telegramId)
    if (!session) {
      return
    }

    await renderSalaryHub({ bot, chatId, telegramId, messages, crewRepo, wagesRepo, withKeyboard: true })
    return
  }

  if (text === messages.navigation.back) {
    // Возврат в меню смены обработается отдельным шагом
    return
  }

  await bot.sendMessage(chatId, messages.salary.intro.text, {
    reply_markup: {
      keyboard: [
        [{ text: messages.salary.intro.startButton }],
        [{ text: messages.navigation.back }],
      ],
      resize_keyboard: true,
    },
  })
}

// TODO: Review for merge — обработка шага возврата между экранами
async function handleBackNavigation({ bot, chatId, telegramId, messages, crewRepo, wagesRepo }) {
  const session = salarySessions.get(telegramId)

  if (!session) {
    return
  }

  if (session.currentStep === SALARY_STEPS.INPUT_WORKER) {
    session.currentStep = SALARY_STEPS.HUB
    session.selectedWorkerId = null
    salarySessions.set(telegramId, session)
    await renderSalaryHub({ bot, chatId, telegramId, messages, crewRepo, wagesRepo })
    return
  }

  if (
    session.currentStep === SALARY_STEPS.INPUT_BRIGADIER ||
    session.currentStep === SALARY_STEPS.INPUT_DEPUTY ||
    session.currentStep === SALARY_STEPS.INPUT_DRIVER
  ) {
    session.currentStep = SALARY_STEPS.HUB
    salarySessions.set(telegramId, session)
    await renderSalaryHub({ bot, chatId, telegramId, messages, crewRepo, wagesRepo })
    return
  }

  if (session.currentStep === SALARY_STEPS.HUB) {
    await renderSalaryHub({ bot, chatId, telegramId, messages, crewRepo, wagesRepo })
  }
}

// TODO: Review for merge — отображение хаба зарплаты
async function renderSalaryHub({ bot, chatId, telegramId, messages, crewRepo, wagesRepo, withKeyboard = false }) {
  const session = salarySessions.get(telegramId)

  if (!session) {
    return
  }

  await wagesRepo.ensureShiftWages(session.shiftId)
  const crew = await crewRepo.getCrewByShift(session.shiftId)
  const wages = await wagesRepo.getShiftWages(session.shiftId)
  const workersWages = await wagesRepo.getWorkerWages(session.shiftId)

  if (!crew?.driver || !crew?.workers?.length) {
    await bot.sendMessage(chatId, messages.salary.errors.unavailable)
    return
  }

  // TODO: Review for merge — конвертируем суммы в числа, чтобы исключить ошибочную конкатенацию строк
  const workerAmountMap = new Map(
    workersWages.map((item) => [item.worker_id, Number.parseInt(item.amount, 10) || 0]),
  )

  const brigadierAmount = wages?.brigadier_amount != null ? Number(wages.brigadier_amount) : null
  const deputyAmount = crew.deputy && wages?.deputy_amount != null ? Number(wages.deputy_amount) : null
  const driverAmount = crew.driver && wages?.driver_amount != null ? Number(wages.driver_amount) : null
  const workersTotal = wages?.workers_total != null ? Number(wages.workers_total) : 0

  const total = calculateSalaryTotal({
    // TODO: Review for merge — приводим суммы к Number перед расчётом, чтобы исключить конкатенацию строк
    brigadier: brigadierAmount,
    deputy: deputyAmount,
    driver: driverAmount,
    workers: workersTotal,
  })

  const ready =
    Boolean(brigadierAmount) &&
    Boolean(driverAmount) &&
    crew.workers.every((worker) => Boolean(workerAmountMap.get(worker.id))) &&
    (crew.deputy ? Boolean(deputyAmount) : true)

  const textLines = [
    messages.salary.hub.title,
    '',
    `${messages.salary.hub.brigadier} ${brigadierAmount || '—'}`,
  ]

  if (crew.deputy) {
    textLines.push(`${messages.salary.hub.deputy} ${deputyAmount || '—'}`)
  }

  textLines.push(`${messages.salary.hub.driver} ${driverAmount || '—'}`)
  textLines.push('')
  textLines.push(messages.salary.hub.total(total))

  const inlineKeyboard = []
  inlineKeyboard.push([
    {
      text: `${messages.salary.hub.brigadier} ${brigadierAmount || 'указать сумму'}`,
      callback_data: 'salary:brigadier',
    },
  ])

  if (crew.deputy) {
    inlineKeyboard.push([
      {
        text: `${messages.salary.hub.deputy} ${deputyAmount || 'указать сумму'}`,
        callback_data: 'salary:deputy',
      },
    ])
  }

  if (crew.driver) {
    inlineKeyboard.push([
      {
        text: `${messages.salary.hub.driver} ${driverAmount || 'указать сумму'}`,
        callback_data: 'salary:driver',
      },
    ])
  }

  crew.workers.forEach((worker) => {
    const shortName = formatShortName(worker.fullName)
    const workerAmount = workerAmountMap.get(worker.id)
    inlineKeyboard.push([
      {
        text: `${messages.salary.workers.prefix} ${shortName} — ${workerAmount || 'указать сумму'}`,
        callback_data: `salary:worker:${worker.id}`,
      },
    ])
  })

  inlineKeyboard.push([{ text: messages.salary.hub.recalc, callback_data: 'salary:recalc' }])

  if (ready) {
    inlineKeyboard.push([{ text: messages.salary.hub.confirm, callback_data: 'salary:confirm' }])
  }

  const messageOptions = {
    parse_mode: 'HTML',
    reply_markup: { inline_keyboard: inlineKeyboard },
  }

  if (session.messageId) {
    try {
      await bot.editMessageText(textLines.join('\n'), {
        chat_id: chatId,
        message_id: session.messageId,
        ...messageOptions,
      })
    } catch (error) {
      if (!String(error.message || '').includes('message is not modified')) {
        throw error
      }
    }
  } else {
    const sent = await bot.sendMessage(chatId, textLines.join('\n'), messageOptions)
    session.messageId = sent.message_id
    session.currentStep = SALARY_STEPS.HUB
    salarySessions.set(telegramId, session)
  }

  session.currentStep = SALARY_STEPS.HUB
  salarySessions.set(telegramId, session)

  if (withKeyboard) {
    await bot.sendMessage(chatId, messages.salary.hub.backToShift, {
      // TODO: Review for merge — отправляем клавиатуру для возврата в меню без дополнительных подсказок
      reply_markup: {
        keyboard: [[{ text: messages.salary.hub.backToShift }]],
        resize_keyboard: true,
      },
    })
  }
}

// TODO: Review for merge — отображение формы ввода для роли
async function renderRoleInput({ bot, chatId, telegramId, role, messages }) {
  const session = salarySessions.get(telegramId)

  if (!session) {
    return
  }

  const titles = {
    brigadier: messages.salary.input.brigadier.title,
    deputy: messages.salary.input.deputy.title,
    driver: messages.salary.input.driver.title,
  }

  const stepByRole = {
    brigadier: SALARY_STEPS.INPUT_BRIGADIER,
    deputy: SALARY_STEPS.INPUT_DEPUTY,
    driver: SALARY_STEPS.INPUT_DRIVER,
  }

  const title = titles[role]
  const step = stepByRole[role]

  if (!title || !step) {
    return
  }

  session.currentStep = step
  session.selectedWorkerId = null
  salarySessions.set(telegramId, session)

  await bot.sendMessage(chatId, `${title}\n\n${messages.salary.input.commonPrompt}`, {
    reply_markup: {
      keyboard: [
        [{ text: messages.salary.input.backButton }],
        [{ text: messages.salary.hub.backToShift }],
      ],
      resize_keyboard: true,
    },
  })
}

// TODO: Review for merge — отображение формы ввода для рабочего
async function renderWorkerInput({ bot, chatId, telegramId, workerId, messages, crewRepo, wagesRepo }) {
  const session = salarySessions.get(telegramId)

  if (!session) {
    // TODO: Review for merge — при отсутствии сессии возвращаемся в хаб зарплаты без ошибок
    await renderSalaryHub({ bot, chatId, telegramId, messages, crewRepo, wagesRepo })
    return
  }

  const worker = await crewRepo.getShiftWorkerById({ shiftId: session.shiftId, workerId })

  if (!worker) {
    // TODO: Review for merge — используем данные сессии как единственный источник и возвращаем хаб без лишних сообщений
    await renderSalaryHub({ bot, chatId, telegramId, messages, crewRepo, wagesRepo })
    return
  }

  session.currentStep = SALARY_STEPS.INPUT_WORKER
  session.selectedWorkerId = workerId
  salarySessions.set(telegramId, session)

  await bot.sendMessage(chatId, `${worker.fullName}\n\n${messages.salary.input.commonPrompt}`, {
    reply_markup: {
      keyboard: [
        [{ text: messages.salary.input.backButton }],
        [{ text: messages.salary.hub.backToShift }],
      ],
      resize_keyboard: true,
    },
  })
}

// TODO: Review for merge — обработка сохранения суммы роли
async function handleRoleAmount({ bot, chatId, telegramId, text, role, messages, wagesRepo, crewRepo }) {
  const session = salarySessions.get(telegramId)

  if (!session) {
    return
  }

  if (!/^[1-9]\d{0,5}$/.test(text)) {
    await bot.sendMessage(chatId, messages.salary.errors.invalidAmount)
    return
  }

  await wagesRepo.invalidateSalaryFlag(session.shiftId)
  await wagesRepo.upsertRoleAmount({ shiftId: session.shiftId, role, amount: Number.parseInt(text, 10) })
  session.currentStep = SALARY_STEPS.HUB
  salarySessions.set(telegramId, session)
  await renderSalaryHub({ bot, chatId, telegramId, messages, crewRepo, wagesRepo })
}

// TODO: Review for merge — обработка суммы рабочего
async function handleWorkerAmount({ bot, chatId, telegramId, text, messages, crewRepo, wagesRepo }) {
  const session = salarySessions.get(telegramId)

  if (!session || !session.selectedWorkerId) {
    return
  }

  if (!/^[1-9]\d{0,5}$/.test(text)) {
    await bot.sendMessage(chatId, messages.salary.errors.invalidAmount)
    return
  }

  await wagesRepo.invalidateSalaryFlag(session.shiftId)
  await wagesRepo.upsertWorkerWage({
    shiftId: session.shiftId,
    workerId: session.selectedWorkerId,
    amount: Number.parseInt(text, 10),
  })
  await wagesRepo.recalcWorkersTotal(session.shiftId)
  session.selectedWorkerId = null
  session.currentStep = SALARY_STEPS.HUB
  salarySessions.set(telegramId, session)
  await renderSalaryHub({ bot, chatId, telegramId, messages, crewRepo, wagesRepo })
}

// TODO: Review for merge — завершение блока и возврат в меню смены
async function completeSalaryFlow({
  bot,
  chatId,
  telegramId,
  messages,
  crewRepo,
  wagesRepo,
  shiftsRepo,
  brigadiersRepo,
  openShiftMenu,
}) {
  const session = salarySessions.get(telegramId)

  if (!session) {
    return
  }

  const crew = await crewRepo.getCrewByShift(session.shiftId)
  const wages = await wagesRepo.getShiftWages(session.shiftId)
  const workerWages = await wagesRepo.getWorkerWages(session.shiftId)
  const workerAmountMap = new Map(workerWages.map((item) => [item.worker_id, item.amount]))

  const ready =
    Boolean(wages?.brigadier_amount) &&
    Boolean(wages?.driver_amount) &&
    crew.workers.every((worker) => Boolean(workerAmountMap.get(worker.id))) &&
    (crew.deputy ? Boolean(wages?.deputy_amount) : true)

  if (!ready) {
    await renderSalaryHub({ bot, chatId, telegramId, messages, crewRepo, wagesRepo })
    return
  }

  await wagesRepo.recalcWorkersTotal(session.shiftId)
  await wagesRepo.markSalaryFilled(session.shiftId)

  const brigadier = await brigadiersRepo.findByTelegramId(String(telegramId))
  const shift = brigadier
    ? await shiftsRepo.findActiveByIdAndBrigadier({ shiftId: session.shiftId, brigadierId: brigadier.id })
    : null

  salarySessions.delete(telegramId)
  setUserState(telegramId, USER_STATES.SHIFT_MENU)

  if (brigadier && shift && openShiftMenu) {
    await bot.sendMessage(chatId, messages.salary.confirmReady)
    await openShiftMenu({ bot, chatId, telegramId, brigadier, shift })
  }
}

// TODO: Review for merge — возврат в меню смены из блока зарплаты
async function returnToShiftMenu({
  bot,
  chatId,
  telegramId,
  brigadiersRepo,
  shiftsRepo,
  messages,
  logger,
  session,
  openShiftMenu,
}) {
  try {
    const brigadier = await brigadiersRepo.findByTelegramId(String(telegramId))
    const shift = brigadier
      ? await shiftsRepo.findActiveByIdAndBrigadier({ shiftId: session.shiftId, brigadierId: brigadier.id })
      : null

    salarySessions.delete(telegramId)
    setUserState(telegramId, USER_STATES.SHIFT_MENU)

    if (brigadier && shift && openShiftMenu) {
      await openShiftMenu({ bot, chatId, telegramId, brigadier, shift, messages, logger })
    }
  } catch (error) {
    logger.error('Не удалось вернуться в меню смены из блока зарплаты', { error: error.message })
    await bot.sendMessage(chatId, messages.systemError)
  }
}

// TODO: Review for merge — аккуратно суммируем зарплаты с приведением типов
function calculateSalaryTotal({ brigadier, deputy, driver, workers }) {
  // Приводим каждое значение к Number, чтобы избежать конкатенации строк и плавающих типов
  const brigadierAmount = Number(brigadier) || 0
  const deputyAmount = Number(deputy) || 0
  const driverAmount = Number(driver) || 0
  const workersTotal = Number(workers) || 0

  return brigadierAmount + deputyAmount + driverAmount + workersTotal
}

// TODO: Review for merge — вспомогательная функция форматирования ФИО
function formatShortName(fullName) {
  if (!fullName) {
    return ''
  }

  const parts = fullName.split(' ')
  const lastName = parts[0] || ''
  const firstInitial = parts[1]?.[0] ? `${parts[1][0]}.` : ''

  return `${lastName} ${firstInitial}`.trim()
}

module.exports = { registerSalaryModule }
