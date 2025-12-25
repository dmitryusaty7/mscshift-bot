const { USER_STATES, setUserState, getUserState } = require('../bot/middlewares/session')

// TODO: Review for merge — в этом модуле нет глобального bot, поэтому работаем через контекст с telegram
function buildExpensesCtx(bot, chat) {
  // TODO: Review for merge — привязываем chatId, чтобы использовать только ctx.telegram и ctx.reply
  const safeChat = chat?.id ? chat : { id: chat }

  return {
    chat: safeChat,
    reply: (text, extra) => bot.sendMessage(safeChat.id, text, extra),
    telegram: {
      // TODO: Review for merge — node-telegram-bot-api не добавляет telegram в бот, делаем обёртку руками
      sendMessage: (chatId, text, extra) => bot.sendMessage(chatId, text, extra),
      editMessageText: (chatId, messageId, _inlineMessageId, text, extra) =>
        bot.editMessageText(text, { chat_id: chatId, message_id: messageId, ...(extra || {}) }),
    },
  }
}

// TODO: Review for merge — текст хаба расходов (Telegram запрещает пустой текст)
const EXPENSES_HUB_TEXT =
  'Расходы — общий обзор:\n' +
  'Введите или измените суммы расходов.\n' +
  'Все значения отображаются на кнопках ниже.'

// TODO: Review for merge — режимы блока расходов
const EXPENSES_MODES = {
  INTRO: 'INTRO',
  HUB: 'HUB',
  INPUT_FOOD: 'INPUT_FOOD',
  INPUT_MATERIALS: 'INPUT_MATERIALS',
  INPUT_TAXI: 'INPUT_TAXI',
  INPUT_OTHER_AMOUNT: 'INPUT_OTHER_AMOUNT',
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
    const chat = query.message?.chat
    const chatId = chat?.id
    const session = chatId ? findSessionByChat(chatId) : null

    if (!session) {
      await bot.answerCallbackQuery(query.id)
      return
    }

    const ctx = buildExpensesCtx(bot, chat)

    try {
      if (action === 'expenses:food') {
        await bot.answerCallbackQuery(query.id)
        await renderExpenseInput({ ctx, mode: EXPENSES_MODES.INPUT_FOOD, messages })
        updateSessionMode({ chatId, shiftId: session.shiftId, mode: EXPENSES_MODES.INPUT_FOOD })
        return
      }

      if (action === 'expenses:materials') {
        await bot.answerCallbackQuery(query.id)
        await renderExpenseInput({ ctx, mode: EXPENSES_MODES.INPUT_MATERIALS, messages })
        updateSessionMode({ chatId, shiftId: session.shiftId, mode: EXPENSES_MODES.INPUT_MATERIALS })
        return
      }

      if (action === 'expenses:taxi') {
        await bot.answerCallbackQuery(query.id)
        await renderExpenseInput({ ctx, mode: EXPENSES_MODES.INPUT_TAXI, messages })
        updateSessionMode({ chatId, shiftId: session.shiftId, mode: EXPENSES_MODES.INPUT_TAXI })
        return
      }

      if (action === 'expenses:other') {
        await bot.answerCallbackQuery(query.id)
        await renderExpenseInput({ ctx, mode: EXPENSES_MODES.INPUT_OTHER_AMOUNT, messages })
        updateSessionMode({ chatId, shiftId: session.shiftId, mode: EXPENSES_MODES.INPUT_OTHER_AMOUNT })
        return
      }

      if (action === 'expenses:confirm') {
        await bot.answerCallbackQuery(query.id)

        if (!session.shiftId) {
          return
        }

        // TODO: Review for merge — подтверждение фиксирует завершение блока расходов и возвращает в меню смены
        await expensesRepo.markExpensesFilledOnExit(session.shiftId)
        updateSessionMode({ chatId, shiftId: session.shiftId, mode: EXPENSES_MODES.HUB })

        await returnToShiftMenu({
          bot,
          chatId,
          telegramId,
          shiftId: session.shiftId,
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
    const ctx = buildExpensesCtx(bot, msg.chat)

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
      if (!shiftId) {
        // TODO: Review for merge — shiftId обязателен, при его отсутствии возвращаемся в меню смены
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

      try {
        await expensesRepo.ensureShiftExpensesRow(shiftId)
        await renderExpensesHub({ ctx, shiftId, messages, logger, expensesRepo, withKeyboard: true })
      } catch (error) {
        // TODO: Review for merge — фиксируем ошибку, чтобы не заспамить пользователя
        logger.error('Не удалось открыть хаб расходов', { error: error.stack || error.message })
        await ctx.reply(messages.systemError)
      }
      return
    }

    if (msg.text === messages.expenses.hub.backToShift) {
      await expensesRepo.markExpensesFilledOnExit(shiftId)
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
      await renderExpensesHub({ ctx, shiftId, messages, logger, expensesRepo, withKeyboard: true })
      return
    }

    if (msg.text === messages.expenses.input.backToShift) {
      updateSessionMode({ chatId, shiftId, mode: EXPENSES_MODES.HUB })
      await expensesRepo.markExpensesFilledOnExit(shiftId)
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
      await processExpenseInput({ ctx, chatId, shiftId, text: msg.text, kind: 'food', messages, logger, expensesRepo })
      return
    }

    if (mode === EXPENSES_MODES.INPUT_MATERIALS) {
      await processExpenseInput({ ctx, chatId, shiftId, text: msg.text, kind: 'materials', messages, logger, expensesRepo })
      return
    }

    if (mode === EXPENSES_MODES.INPUT_TAXI) {
      await processExpenseInput({ ctx, chatId, shiftId, text: msg.text, kind: 'taxi', messages, logger, expensesRepo })
      return
    }

    if (mode === EXPENSES_MODES.INPUT_OTHER_AMOUNT) {
      await processExpenseInput({ ctx, chatId, shiftId, text: msg.text, kind: 'other', messages, logger, expensesRepo })
      return
    }
  })

  // TODO: Review for merge — открытие Блока 7 из меню смены
  async function openExpensesFromShiftMenu({ chatId, telegramId, session }) {
    try {
      const shiftId = session?.data?.shiftId
      const ctx = buildExpensesCtx(bot, { id: chatId })

      if (!shiftId) {
        await ctx.reply(messages.expenses.intro.missingShift)
        setUserState(telegramId, USER_STATES.SHIFT_MENU)
        return
      }

      expensesSessions.set(buildSessionKey(chatId, shiftId), {
        shiftId,
        chatId,
        hubMessageId: null,
        navMessageId: null,
        mode: EXPENSES_MODES.INTRO,
      })

      setUserState(telegramId, USER_STATES.SHIFT_EXPENSES)

      // TODO: Review for merge — предыдущая ошибка была из-за неверных колонок, гарантируем корректную строку перед экраном
      await expensesRepo.ensureShiftExpensesRow(shiftId)

      await renderExpensesIntro({ ctx, messages })
    } catch (error) {
      logger.error('Не удалось открыть блок расходов', { error: error.message })
      await ctx.reply(messages.systemError)
    }
  }

  return { openExpensesFromShiftMenu }
}

// TODO: Review for merge — показ вступительного экрана расходов
async function renderExpensesIntro({ ctx, messages }) {
  await ctx.reply(messages.expenses.intro.text, {
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
async function renderExpensesHub({ ctx, shiftId, messages, logger, expensesRepo, withKeyboard = false }) {
  try {
    const chatId = ctx?.chat?.id

    if (!chatId) {
      // TODO: Review for merge — без chatId невозможно отрисовать хаб
      return
    }

    if (!shiftId) {
      // TODO: Review for merge — shiftId обязателен для доступа к расходам, возвращаем пользователя в меню смены
      await ctx.reply(messages.expenses.intro.missingShift)
      return
    }

    const sessionKey = buildSessionKey(chatId, shiftId)
    const session = expensesSessions.get(sessionKey)

    if (!session) {
      return
    }

    await expensesRepo.ensureShiftExpensesRow(shiftId)
    const data = await expensesRepo.getShiftExpenses(shiftId)

    if (!data) {
      await ctx.reply(messages.systemError)
      return
    }

    const inlineKeyboard = buildInlineKeyboard(data, messages)

    if (withKeyboard && !session.navMessageId) {
      // TODO: Review for merge — отправляем подсказку только один раз, чтобы не заспамить чат
      const navText = messages.expenses.hub.navHint || messages.expenses.hub.backToShift
      const navMessage = await ctx.telegram.sendMessage(chatId, navText, {
        reply_markup: {
          keyboard: [[{ text: messages.expenses.hub.backToShift }]],
          resize_keyboard: true,
        },
      })
      session.navMessageId = navMessage.message_id
      expensesSessions.set(sessionKey, session)
    }

    // TODO: Review for merge — Telegram требует непустой текст для сообщений
    const hubText = (EXPENSES_HUB_TEXT || '').trim()

    if (!hubText) {
      throw new Error('Expenses hub text is empty')
    }

    const options = {
      reply_markup: {
        inline_keyboard: inlineKeyboard,
      },
    }

    await upsertExpensesHubMessage(ctx, session, hubText, options)
  } catch (error) {
    logger.error('Не удалось отрисовать хаб расходов', { error: error.stack || error.message })
    await ctx.reply(messages.systemError)
  }
}

// TODO: Review for merge — показ экрана ввода суммы
async function renderExpenseInput({ ctx, mode, messages }) {
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

  await ctx.reply(prompt, {
    reply_markup: {
      keyboard: [
        [{ text: messages.expenses.input.back }],
        [{ text: messages.expenses.input.backToShift }],
      ],
      resize_keyboard: true,
    },
  })
}

// TODO: Review for merge — обработка ввода суммы расходов по белому списку колонок
async function processExpenseInput({ ctx, chatId, shiftId, text, kind, messages, logger, expensesRepo }) {
  const parsed = parseExpenseValue(text)

  if (parsed === null) {
    await ctx.reply(messages.expenses.input.invalidNumber)
    return
  }

  const columnForLog = {
    food: 'food_amount',
    materials: 'materials_amount',
    taxi: 'taxi_amount',
    other: 'other_amount',
  }[kind]

  // TODO: Review for merge — логируем только безопасный шаблон UPDATE с WHERE, без мультистейтмента
  const amountSql = columnForLog
    ? `UPDATE public.shift_expenses SET ${columnForLog} = $2::numeric, total_expenses = COALESCE(food_amount,0) + COALESCE(materials_amount,0) + COALESCE(taxi_amount,0) + COALESCE(other_amount,0), updated_at = now() WHERE shift_id = $1 RETURNING ...`
    : null

  try {
    await expensesRepo.saveExpenseAmount({ shiftId, kind, amountRub: parsed })
    await expensesRepo.updateExpensesFilled(shiftId)

    updateSessionMode({ chatId, shiftId, mode: EXPENSES_MODES.HUB })

    await renderExpensesHub({ ctx, shiftId, messages, logger, expensesRepo, withKeyboard: true })
  } catch (error) {
    const session = findSessionByChat(chatId)

    // TODO: Review for merge — логируем детали запроса без утечки текста ввода
    logger.error('Не удалось сохранить сумму расходов', {
      ошибка: String(error?.message || error),
      shiftId,
      режим: session?.mode,
      sql: amountSql,
    })
    await ctx.reply(messages.systemError)
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

  const keyboard = [
    [
      {
        text: `${messages.expenses.hub.food} — ${formatRub(data.food_amount, fallback)} ${suffix}`,
        callback_data: 'expenses:food',
      },
    ],
    [
      {
        text: `${messages.expenses.hub.materials} — ${formatRub(data.materials_amount, fallback)} ${suffix}`,
        callback_data: 'expenses:materials',
      },
    ],
    [
      {
        text: `${messages.expenses.hub.taxi} — ${formatRub(data.taxi_amount, fallback)} ${suffix}`,
        callback_data: 'expenses:taxi',
      },
    ],
    [
      {
        text: `${messages.expenses.hub.other} — ${formatRub(data.other_amount, fallback)} ${suffix}`,
        callback_data: 'expenses:other',
      },
    ],
  ]

  keyboard.push([
    {
      text: '✅ Подтвердить',
      callback_data: 'expenses:confirm',
    },
  ])

  return keyboard
}

// TODO: Review for merge
// Приводим numeric(12,2) из БД к рублям без копеек для UI
function formatRub(val, fallback) {
  const n = Number(val)

  if (!Number.isFinite(n)) {
    return fallback
  }

  return String(Math.trunc(n))
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

// TODO: Review for merge — единая функция обновления/создания хаба без использования ctx.editMessageText
async function upsertExpensesHubMessage(ctx, session, text, extra) {
  // TODO: Review for merge — в контексте модуля нет глобального bot, используем ctx.telegram
  const chatId = ctx?.chat?.id

  if (!chatId) {
    throw new Error('Expenses hub: missing chatId')
  }

  const safeText = String(text || '').trim()

  if (!safeText) {
    throw new Error('Expenses hub: empty text')
  }

  if (session?.hubMessageId) {
    try {
      await ctx.telegram.editMessageText(chatId, session.hubMessageId, null, safeText, extra)
      return
    } catch (error) {
      // TODO: Review for merge — если редактирование не удалось (сообщение удалено/старое), отправляем новое
    }
  }

  const msg = await ctx.telegram.sendMessage(chatId, safeText, extra)
  session.hubMessageId = msg.message_id

  if (session?.shiftId) {
    const sessionKey = buildSessionKey(chatId, session.shiftId)
    expensesSessions.set(sessionKey, session)
  }
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
