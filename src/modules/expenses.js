const { USER_STATES, setUserState, getUserState } = require('../bot/middlewares/session')

// TODO: Review for merge — режимы блока расходов
const EXPENSES_MODES = {
  INTRO: 'INTRO',
  HUB: 'HUB',
  INPUT_FOOD: 'INPUT_FOOD',
  INPUT_MATERIALS: 'INPUT_MATERIALS',
  INPUT_TAXI: 'INPUT_TAXI',
  INPUT_OTHER_AMOUNT: 'INPUT_OTHER_AMOUNT',
  AWAIT_OTHER_COMMENT: 'AWAIT_OTHER_COMMENT',
}

// Русский комментарий: ключ сессии включает чат и смену, чтобы изолировать состояния
const expensesSessions = new Map()

// TODO: Review for merge — регистрация модуля Блока 7 «Расходы»
function registerExpensesModule({ bot, logger, messages, expensesRepo, shiftsRepo, brigadiersRepo, openShiftMenu }) {
  bot.on('callback_query', async (query) => {
    const action = query.data

    if (!action || !action.startsWith('expenses:')) {
      return
    }

    const telegramId = query.from?.id
    const chatId = query.message?.chat.id
    const session = chatId ? findSessionByChat(chatId) : null

    if (!session) {
      await bot.answerCallbackQuery(query.id)
      return
    }

    try {
      if (action === 'expenses:food') {
        await bot.answerCallbackQuery(query.id)
        await renderExpenseInput({ bot, chatId, mode: EXPENSES_MODES.INPUT_FOOD, messages })
        updateSessionMode({ chatId, shiftId: session.shiftId, mode: EXPENSES_MODES.INPUT_FOOD })
        return
      }

      if (action === 'expenses:materials') {
        await bot.answerCallbackQuery(query.id)
        await renderExpenseInput({ bot, chatId, mode: EXPENSES_MODES.INPUT_MATERIALS, messages })
        updateSessionMode({ chatId, shiftId: session.shiftId, mode: EXPENSES_MODES.INPUT_MATERIALS })
        return
      }

      if (action === 'expenses:taxi') {
        await bot.answerCallbackQuery(query.id)
        await renderExpenseInput({ bot, chatId, mode: EXPENSES_MODES.INPUT_TAXI, messages })
        updateSessionMode({ chatId, shiftId: session.shiftId, mode: EXPENSES_MODES.INPUT_TAXI })
        return
      }

      if (action === 'expenses:other') {
        await bot.answerCallbackQuery(query.id)
        await renderExpenseInput({ bot, chatId, mode: EXPENSES_MODES.INPUT_OTHER_AMOUNT, messages })
        updateSessionMode({ chatId, shiftId: session.shiftId, mode: EXPENSES_MODES.INPUT_OTHER_AMOUNT })
        return
      }

      await bot.answerCallbackQuery(query.id)
    } catch (error) {
      logger.error('Ошибка обработки callback в блоке расходов', { error: error.message })
      await bot.answerCallbackQuery(query.id)
    }
  })

  bot.on('message', async (msg) => {
    const telegramId = msg.from?.id
    const chatId = msg.chat.id

    if (!telegramId || !/^\d+$/.test(String(telegramId))) {
      return
    }

    if (getUserState(telegramId) !== USER_STATES.SHIFT_EXPENSES) {
      return
    }

    const currentSession = findSessionByChat(chatId)

    if (!currentSession) {
      return
    }

    const { shiftId, mode } = currentSession

    if (msg.text?.startsWith('/')) {
      return
    }

    if (msg.text === messages.expenses.intro.back && mode === EXPENSES_MODES.INTRO) {
      await returnToShiftMenu({
        bot,
        chatId,
        telegramId,
        shiftId,
        brigadiersRepo,
        shiftsRepo,
        messages,
        logger,
        openShiftMenu,
      })
      return
    }

    if (msg.text === messages.expenses.intro.start && mode === EXPENSES_MODES.INTRO) {
      updateSessionMode({ chatId, shiftId, mode: EXPENSES_MODES.HUB })
      await expensesRepo.ensureShiftExpenses(shiftId)
      await renderExpensesHub({ bot, chatId, shiftId, messages, logger, expensesRepo, withKeyboard: true })
      return
    }

    if (msg.text === messages.expenses.hub.backToShift) {
      await returnToShiftMenu({
        bot,
        chatId,
        telegramId,
        shiftId,
        brigadiersRepo,
        shiftsRepo,
        messages,
        logger,
        openShiftMenu,
      })
      return
    }

    if (msg.text === messages.expenses.input.back && mode !== EXPENSES_MODES.INTRO) {
      updateSessionMode({ chatId, shiftId, mode: EXPENSES_MODES.HUB })
      await renderExpensesHub({ bot, chatId, shiftId, messages, logger, expensesRepo, withKeyboard: true })
      return
    }

    if (msg.text === messages.expenses.input.backToShift) {
      updateSessionMode({ chatId, shiftId, mode: EXPENSES_MODES.HUB })
      await returnToShiftMenu({
        bot,
        chatId,
        telegramId,
        shiftId,
        brigadiersRepo,
        shiftsRepo,
        messages,
        logger,
        openShiftMenu,
      })
      return
    }

    if (mode === EXPENSES_MODES.INPUT_FOOD) {
      await processExpenseInput({ bot, chatId, shiftId, text: msg.text, column: 'food', messages, logger, expensesRepo })
      return
    }

    if (mode === EXPENSES_MODES.INPUT_MATERIALS) {
      await processExpenseInput({ bot, chatId, shiftId, text: msg.text, column: 'materials', messages, logger, expensesRepo })
      return
    }

    if (mode === EXPENSES_MODES.INPUT_TAXI) {
      await processExpenseInput({ bot, chatId, shiftId, text: msg.text, column: 'taxi', messages, logger, expensesRepo })
      return
    }

    if (mode === EXPENSES_MODES.INPUT_OTHER_AMOUNT) {
      await processExpenseInput({ bot, chatId, shiftId, text: msg.text, column: 'other', messages, logger, expensesRepo, expectComment: true })
      return
    }

    if (mode === EXPENSES_MODES.AWAIT_OTHER_COMMENT) {
      const parsed = parseExpenseValue(msg.text)
      if (parsed === null) {
        // Русский комментарий: если сумма уже сохранена и прилетает текст, принимаем его как комментарий
        await expensesRepo.updateOtherComment({ shiftId, comment: msg.text })
        updateSessionMode({ chatId, shiftId, mode: EXPENSES_MODES.HUB })
        await renderExpensesHub({ bot, chatId, shiftId, messages, logger, expensesRepo, withKeyboard: true })
        return
      }

      // Русский комментарий: допустимый ввод числа в режиме ожидания комментария игнорируем, пользователь должен снова выбрать кнопку
      return
    }
  })

  // TODO: Review for merge — открытие Блока 7 из меню смены
  async function openExpensesFromShiftMenu({ chatId, telegramId, session }) {
    try {
      const shiftId = session?.data?.shiftId

      if (!shiftId) {
        await bot.sendMessage(chatId, messages.expenses.intro.missingShift)
        setUserState(telegramId, USER_STATES.SHIFT_MENU)
        return
      }

      expensesSessions.set(buildSessionKey(chatId, shiftId), {
        shiftId,
        chatId,
        hubMessageId: null,
        mode: EXPENSES_MODES.INTRO,
      })

      setUserState(telegramId, USER_STATES.SHIFT_EXPENSES)

      await expensesRepo.ensureShiftExpenses(shiftId)

      await renderExpensesIntro({ bot, chatId, messages })
    } catch (error) {
      logger.error('Не удалось открыть блок расходов', { error: error.message })
      await bot.sendMessage(chatId, messages.systemError)
    }
  }

  return { openExpensesFromShiftMenu }
}

// TODO: Review for merge — показ вступительного экрана расходов
async function renderExpensesIntro({ bot, chatId, messages }) {
  await bot.sendMessage(chatId, messages.expenses.intro.text, {
    reply_markup: {
      keyboard: [
        [{ text: messages.expenses.intro.start }],
        [{ text: messages.expenses.intro.back }],
      ],
      resize_keyboard: true,
    },
  })
}

// TODO: Review for merge — вывод хаба расходов с актуальными значениями
async function renderExpensesHub({ bot, chatId, shiftId, messages, logger, expensesRepo, withKeyboard = false }) {
  try {
    const session = expensesSessions.get(buildSessionKey(chatId, shiftId))

    if (!session) {
      return
    }

    await expensesRepo.ensureShiftExpenses(shiftId)
    const data = await expensesRepo.getShiftExpenses(shiftId)

    if (!data) {
      await bot.sendMessage(chatId, messages.systemError)
      return
    }

    const inlineKeyboard = buildInlineKeyboard(data, messages)

    if (withKeyboard) {
      // Русский комментарий: отправляем временное сообщение, чтобы обновить реплай-клавиатуру без дублирования хаба
      const keyboardMessage = await bot.sendMessage(chatId, ' ', {
        reply_markup: {
          keyboard: [[{ text: messages.expenses.hub.backToShift }]],
          resize_keyboard: true,
        },
      })
      try {
        await bot.deleteMessage(chatId, keyboardMessage.message_id)
      } catch (error) {
        // Русский комментарий: если удалить сообщение не удалось, оставляем его как временную подсказку
        logger.warn('Не удалось удалить служебное сообщение клавиатуры расходов', { error: error.message })
      }
    }

    const options = {
      reply_markup: {
        inline_keyboard: inlineKeyboard,
      },
    }

    if (session.hubMessageId) {
      try {
        await bot.editMessageText(messages.expenses.hub.title, {
          chat_id: chatId,
          message_id: session.hubMessageId,
          reply_markup: options.reply_markup,
        })
      } catch (error) {
        // Русский комментарий: если исходное сообщение недоступно, отправляем новое и обновляем идентификатор
        const sent = await bot.sendMessage(chatId, messages.expenses.hub.title, options)
        expensesSessions.set(buildSessionKey(chatId, shiftId), { ...session, hubMessageId: sent.message_id })
      }
      return
    }

    const sent = await bot.sendMessage(chatId, messages.expenses.hub.title, options)
    expensesSessions.set(buildSessionKey(chatId, shiftId), { ...session, hubMessageId: sent.message_id })
  } catch (error) {
    logger.error('Не удалось отрисовать хаб расходов', { error: error.message })
    await bot.sendMessage(chatId, messages.systemError)
  }
}

// TODO: Review for merge — показ экрана ввода суммы
async function renderExpenseInput({ bot, chatId, mode, messages }) {
  const promptMap = {
    [EXPENSES_MODES.INPUT_FOOD]: messages.expenses.input.food,
    [EXPENSES_MODES.INPUT_MATERIALS]: messages.expenses.input.materials,
    [EXPENSES_MODES.INPUT_TAXI]: messages.expenses.input.taxi,
    [EXPENSES_MODES.INPUT_OTHER_AMOUNT]: messages.expenses.input.other,
  }

  const prompt = promptMap[mode]

  if (!prompt) {
    return
  }

  await bot.sendMessage(chatId, prompt, {
    reply_markup: {
      keyboard: [
        [{ text: messages.expenses.input.back }],
        [{ text: messages.expenses.input.backToShift }],
      ],
      resize_keyboard: true,
    },
  })
}

// TODO: Review for merge — обработка ввода суммы
async function processExpenseInput({ bot, chatId, shiftId, text, column, messages, logger, expensesRepo, expectComment = false }) {
  const parsed = parseExpenseValue(text)

  if (parsed === null) {
    await bot.sendMessage(chatId, messages.expenses.input.invalidNumber)
    return
  }

  try {
    await expensesRepo.updateExpenseAmount({ shiftId, column, value: parsed })
    await expensesRepo.updateExpensesFilled(shiftId)

    const nextMode = expectComment ? EXPENSES_MODES.AWAIT_OTHER_COMMENT : EXPENSES_MODES.HUB
    updateSessionMode({ chatId, shiftId, mode: nextMode })

    await renderExpensesHub({ bot, chatId, shiftId, messages, logger, expensesRepo, withKeyboard: true })
  } catch (error) {
    logger.error('Не удалось сохранить сумму расходов', { error: error.message })
    await bot.sendMessage(chatId, messages.systemError)
  }
}

// TODO: Review for merge — вспомогательный парсер суммы расходов
function parseExpenseValue(text) {
  if (typeof text !== 'string') {
    return null
  }

  if (!/^\d{1,6}$/.test(text)) {
    return null
  }

  const value = Number.parseInt(text, 10)

  if (Number.isNaN(value) || value < 0 || value > 999999) {
    return null
  }

  return value
}

// TODO: Review for merge — построение кнопок с отображением значений
function buildInlineKeyboard(data, messages) {
  const fallback = messages.expenses.hub.fallback
  const suffix = messages.expenses.hub.suffix

  const format = (value) => (value === null || value === undefined ? fallback : value)

  return [
    [
      {
        text: `${messages.expenses.hub.food} — ${format(data.food)} ${suffix}`,
        callback_data: 'expenses:food',
      },
    ],
    [
      {
        text: `${messages.expenses.hub.materials} — ${format(data.materials)} ${suffix}`,
        callback_data: 'expenses:materials',
      },
    ],
    [
      {
        text: `${messages.expenses.hub.taxi} — ${format(data.taxi)} ${suffix}`,
        callback_data: 'expenses:taxi',
      },
    ],
    [
      {
        text: `${messages.expenses.hub.other} — ${format(data.other)} ${suffix}`,
        callback_data: 'expenses:other',
      },
    ],
  ]
}

// TODO: Review for merge — обновление режима сессии
function updateSessionMode({ chatId, shiftId, mode }) {
  const key = buildSessionKey(chatId, shiftId)
  const session = expensesSessions.get(key)

  if (!session) {
    return
  }

  expensesSessions.set(key, { ...session, mode })
}

// TODO: Review for merge — поиск сессии по чату
function findSessionByChat(chatId) {
  for (const [key, value] of expensesSessions.entries()) {
    if (key.startsWith(`${chatId}:`)) {
      return value
    }
  }
  return null
}

// TODO: Review for merge — построение ключа сессии
function buildSessionKey(chatId, shiftId) {
  return `${chatId}:${shiftId}`
}

// TODO: Review for merge — возврат в меню смены
async function returnToShiftMenu({ bot, chatId, telegramId, shiftId, brigadiersRepo, shiftsRepo, messages, logger, openShiftMenu }) {
  try {
    const brigadier = await brigadiersRepo.findByTelegramId(String(telegramId))
    const shift = brigadier && shiftId
      ? await shiftsRepo.findActiveByIdAndBrigadier({ shiftId, brigadierId: brigadier.id })
      : null

    expensesSessions.delete(buildSessionKey(chatId, shiftId))
    setUserState(telegramId, USER_STATES.SHIFT_MENU)

    if (brigadier && shift && openShiftMenu) {
      await openShiftMenu({ bot, chatId, telegramId, brigadier, shift, messages, logger })
      return
    }

    await bot.sendMessage(chatId, messages.expenses.intro.missingShift)
  } catch (error) {
    logger.error('Не удалось вернуться в меню смены из блока расходов', { error: error.message })
    await bot.sendMessage(chatId, messages.systemError)
  }
}

module.exports = { registerExpensesModule }
