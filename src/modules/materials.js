const { USER_STATES, setUserState, getUserState } = require('../bot/middlewares/session')

const MATERIAL_KEYS = {
  pvd3: 'pvd_3m_used',
  pvd6: 'pvd_6m_used',
  pvd12: 'pvd_12m_used',
  pvd14: 'pvd_14m_used',
  tubes: 'pvh_tubes_used',
  tape: 'tape_used',
}

const materialsSessions = new Map()

// TODO: Review for merge — шаги сценария материалов (вступление и хаб)
const MATERIAL_STEPS = {
  INTRO: 'INTRO',
  HUB: 'HUB',
}

// TODO: Review for merge — регистрация модуля Блока 6 «Материалы»
function registerMaterialsModule({
  bot,
  logger,
  messages,
  materialsRepo,
  shiftsRepo,
  brigadiersRepo,
  openShiftMenu,
}) {
  bot.on('callback_query', async (query) => {
    const action = query.data

    if (!action || !action.startsWith('materials:')) {
      return
    }

    const telegramId = query.from?.id
    const chatId = query.message?.chat.id
    const session = telegramId ? materialsSessions.get(telegramId) : null

    if (!session || !chatId) {
      await bot.answerCallbackQuery(query.id)
      return
    }

    if (!session.shiftId) {
      // TODO: Review for merge — shiftId обязателен для работы с материалами
      await bot.answerCallbackQuery(query.id)
      await bot.sendMessage(chatId, messages.materials.intro.missingShift)
      materialsSessions.delete(telegramId)
      setUserState(telegramId, USER_STATES.SHIFT_MENU)
      return
    }

    try {
      const [, materialKey] = action.split(':')

      if (materialKey === 'confirm') {
        // TODO: Review for merge — обработка подтверждения заполнения материалов
        await bot.answerCallbackQuery(query.id)
        await finishMaterialsAndReturn({
          bot,
          chatId,
          telegramId,
          session,
          brigadiersRepo,
          shiftsRepo,
          materialsRepo,
          messages,
          logger,
          openShiftMenu,
        })
        return
      }

      if (materialKey && MATERIAL_KEYS[materialKey]) {
        session.currentMaterialKey = materialKey
        materialsSessions.set(telegramId, session)
        await bot.answerCallbackQuery(query.id)
        await renderMaterialInput({ bot, chatId, telegramId, materialKey, messages })
        return
      }

      await bot.answerCallbackQuery(query.id)
    } catch (error) {
      logger.error('Ошибка обработки callback в модуле материалов', { error: error.message })
      await bot.answerCallbackQuery(query.id)
    }
  })

  bot.on('message', async (msg) => {
    const telegramId = msg.from?.id
    const chatId = msg.chat.id

    if (!telegramId || !/^\d+$/.test(String(telegramId))) {
      return
    }

    if (getUserState(telegramId) !== USER_STATES.SHIFT_MATERIALS) {
      return
    }

    const session = materialsSessions.get(telegramId)

    if (!session) {
      return
    }

    if (msg.text?.startsWith('/')) {
      return
    }

    if (msg.text === messages.materials.intro.back && session.step === MATERIAL_STEPS.INTRO) {
      // TODO: Review for merge — возврат в меню смены с экрана вступления обязателен для корректной навигации
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

    if (msg.text === messages.materials.intro.start && session.step === MATERIAL_STEPS.INTRO) {
      // TODO: Review for merge — запуск заполнения материалов возможен только после показа экрана 6.1
      session.step = MATERIAL_STEPS.HUB
      materialsSessions.set(telegramId, session)
      await materialsRepo.ensureShiftMaterials(session.shiftId)
      await renderMaterialsHub({
        bot,
        chatId,
        telegramId,
        materialsRepo,
        messages,
        logger,
        withKeyboard: true,
      })
      return
    }

    if (msg.text === messages.materials.hub.backToShift) {
      await finishMaterialsAndReturn({
        bot,
        chatId,
        telegramId,
        session,
        brigadiersRepo,
        shiftsRepo,
        materialsRepo,
        messages,
        logger,
        openShiftMenu,
      })
      return
    }

    if (msg.text === messages.materials.hub.backButton && session.step === MATERIAL_STEPS.HUB) {
      session.currentMaterialKey = null
      materialsSessions.set(telegramId, session)
      await renderMaterialsHub({
        bot,
        chatId,
        telegramId,
        materialsRepo,
        messages,
        logger,
      })
      return
    }

    const currentMaterialKey = session.currentMaterialKey

    if (!currentMaterialKey || session.step !== MATERIAL_STEPS.HUB) {
      return
    }

    await handleMaterialInput({
      bot,
      chatId,
      telegramId,
      text: msg.text,
      materialKey: currentMaterialKey,
      materialsRepo,
      messages,
      logger,
    })
  })

  // TODO: Review for merge — открытие Блока 6 из меню смены
  async function openMaterialsFromShiftMenu({ chatId, telegramId, session }) {
    try {
      const shiftId = session?.data?.shiftId

      if (!shiftId) {
        // TODO: Review for merge — shiftId обязателен для работы с материалами
        await bot.sendMessage(chatId, messages.materials.intro.missingShift)
        setUserState(telegramId, USER_STATES.SHIFT_MENU)
        return
      }

      materialsSessions.set(telegramId, {
        shiftId,
        currentMaterialKey: null,
        hubMessageId: null,
        step: MATERIAL_STEPS.INTRO,
      })

      setUserState(telegramId, USER_STATES.SHIFT_MATERIALS)

      await materialsRepo.ensureShiftMaterials(shiftId)

      await renderMaterialsIntro({ bot, chatId, messages })
    } catch (error) {
      logger.error('Не удалось открыть блок материалов', { error: error.message })
      await bot.sendMessage(chatId, messages.systemError)
    }
  }

  return { openMaterialsFromShiftMenu }
}

// TODO: Review for merge — рендер хаба материалов
async function renderMaterialsHub({ bot, chatId, telegramId, materialsRepo, messages, logger, withKeyboard = false }) {
  const session = materialsSessions.get(telegramId)

  if (!session) {
    return
  }

  if (!session.shiftId) {
    // TODO: Review for merge — shiftId обязателен для загрузки значений материалов
    await bot.sendMessage(chatId, messages.materials.intro.missingShift)
    materialsSessions.delete(telegramId)
    setUserState(telegramId, USER_STATES.SHIFT_MENU)
    return
  }

  try {
    await materialsRepo.ensureShiftMaterials(session.shiftId)
    const materials = await materialsRepo.getShiftMaterials(session.shiftId)

    if (!materials) {
      await bot.sendMessage(chatId, messages.systemError)
      return
    }

    const textLines = [
      messages.materials.hub.title,
      '',
      `${messages.materials.hub.pvd3}: ${materials.pvd_3m_used ?? 0}`,
      `${messages.materials.hub.pvd6}: ${materials.pvd_6m_used ?? 0}`,
      `${messages.materials.hub.pvd12}: ${materials.pvd_12m_used ?? 0}`,
      `${messages.materials.hub.pvd14}: ${materials.pvd_14m_used ?? 0}`,
      `${messages.materials.hub.tubes}: ${materials.pvh_tubes_used ?? 0}`,
      `${messages.materials.hub.tape}: ${materials.tape_used ?? 0}`,
    ]

    const inlineKeyboard = [
      [
        {
          text: `${messages.materials.hub.pvd3} — ${materials.pvd_3m_used ?? 0}`,
          callback_data: 'materials:pvd3',
        },
      ],
      [
        {
          text: `${messages.materials.hub.pvd6} — ${materials.pvd_6m_used ?? 0}`,
          callback_data: 'materials:pvd6',
        },
      ],
      [
        {
          text: `${messages.materials.hub.pvd12} — ${materials.pvd_12m_used ?? 0}`,
          callback_data: 'materials:pvd12',
        },
      ],
      [
        {
          text: `${messages.materials.hub.pvd14} — ${materials.pvd_14m_used ?? 0}`,
          callback_data: 'materials:pvd14',
        },
      ],
      [
        {
          text: `${messages.materials.hub.tubes} — ${materials.pvh_tubes_used ?? 0}`,
          callback_data: 'materials:tubes',
        },
      ],
      [
        {
          text: `${messages.materials.hub.tape} — ${materials.tape_used ?? 0}`,
          callback_data: 'materials:tape',
        },
      ],
      [
        {
          text: messages.materials.hub.confirm,
          callback_data: 'materials:confirm',
        },
      ],
    ]

    const messageOptions = {
      reply_markup: { inline_keyboard: inlineKeyboard },
    }

    if (session.hubMessageId) {
      try {
        await bot.editMessageText(textLines.join('\n'), {
          chat_id: chatId,
          message_id: session.hubMessageId,
          ...messageOptions,
        })
      } catch (error) {
        if (!String(error.message || '').includes('message is not modified')) {
          throw error
        }
      }
    } else {
      const sent = await bot.sendMessage(chatId, textLines.join('\n'), messageOptions)
      session.hubMessageId = sent.message_id
      materialsSessions.set(telegramId, session)
    }

    session.currentMaterialKey = null
    session.step = MATERIAL_STEPS.HUB
    materialsSessions.set(telegramId, session)

    if (withKeyboard) {
      await bot.sendMessage(chatId, messages.materials.hub.navHint, {
        reply_markup: {
          keyboard: [
            [{ text: messages.materials.hub.backButton }],
            [{ text: messages.materials.hub.backToShift }],
          ],
          resize_keyboard: true,
        },
      })
    }
  } catch (error) {
    logger.error('Ошибка при отображении хаба материалов', { error: error.message })
    await bot.sendMessage(chatId, messages.systemError)
  }
}

// TODO: Review for merge — показ экрана ввода количества материала
async function renderMaterialInput({ bot, chatId, telegramId, materialKey, messages }) {
  const session = materialsSessions.get(telegramId)

  if (!session) {
    return
  }

  const titles = {
    pvd3: messages.materials.hub.pvd3,
    pvd6: messages.materials.hub.pvd6,
    pvd12: messages.materials.hub.pvd12,
    pvd14: messages.materials.hub.pvd14,
    tubes: messages.materials.hub.tubes,
    tape: messages.materials.hub.tape,
  }

  const title = titles[materialKey]

  if (!title) {
    return
  }

  await bot.sendMessage(chatId, `${title}\n\n${messages.materials.input.prompt}`, {
    reply_markup: {
      keyboard: [
        [{ text: messages.materials.hub.backButton }],
        [{ text: messages.materials.hub.backToShift }],
      ],
      resize_keyboard: true,
    },
  })
}

// TODO: Review for merge — обработка ввода расхода материала
async function handleMaterialInput({
  bot,
  chatId,
  telegramId,
  text,
  materialKey,
  materialsRepo,
  messages,
  logger,
}) {
  const session = materialsSessions.get(telegramId)

  if (!session) {
    return
  }

  const column = MATERIAL_KEYS[materialKey]

  if (!column) {
    return
  }

  const isDecimalField = column === 'pvh_tubes_used'
  const isValid = isDecimalField
    ? /^\d+(?:\.\d{1,2})?$/.test(text)
    : /^\d+$/.test(text)

  if (!isValid) {
    const errorMessage = isDecimalField
      ? messages.materials.input.invalidDecimal
      : messages.materials.input.invalidInteger
    await bot.sendMessage(chatId, errorMessage)
    return
  }

  const value = isDecimalField ? Number(Number.parseFloat(text).toFixed(2)) : Number.parseInt(text, 10)

  if (Number.isNaN(value) || value < 0) {
    const errorMessage = isDecimalField
      ? messages.materials.input.invalidDecimal
      : messages.materials.input.invalidInteger
    await bot.sendMessage(chatId, errorMessage)
    return
  }

  try {
    await materialsRepo.updateMaterialUsed({ shiftId: session.shiftId, column, value })
    await renderMaterialsHub({ bot, chatId, telegramId, materialsRepo, messages, logger })
  } catch (error) {
    logger.error('Ошибка сохранения расхода материала', { error: error.message })
    await bot.sendMessage(chatId, messages.systemError)
  }
}

// TODO: Review for merge — завершение работы с блоком и возврат в меню смены
async function finishMaterialsAndReturn({
  bot,
  chatId,
  telegramId,
  session,
  brigadiersRepo,
  shiftsRepo,
  materialsRepo,
  messages,
  logger,
  openShiftMenu,
}) {
  try {
    await materialsRepo.markMaterialsFilled(session.shiftId)
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
    logger.error('Не удалось завершить блок материалов', { error: error.message })
    await bot.sendMessage(chatId, messages.systemError)
  }
}

// TODO: Review for merge — показ вступительного экрана Блока 6
async function renderMaterialsIntro({ bot, chatId, messages }) {
  await bot.sendMessage(chatId, `${messages.materials.intro.title}\n${messages.materials.intro.description}`, {
    reply_markup: {
      keyboard: [
        [{ text: messages.materials.intro.start }],
        [{ text: messages.materials.intro.back }],
      ],
      resize_keyboard: true,
    },
  })
}

// TODO: Review for merge — возврат в меню смены без потери навигации
async function returnToShiftMenu({
  bot,
  chatId,
  telegramId,
  session,
  brigadiersRepo,
  shiftsRepo,
  messages,
  logger,
  openShiftMenu,
}) {
  try {
    // Русский комментарий: shiftId — ключевой параметр, без него запись в БД невозможна
    const shiftId = session?.shiftId

    const brigadier = await brigadiersRepo.findByTelegramId(String(telegramId))
    const shift = brigadier && shiftId
      ? await shiftsRepo.findActiveByIdAndBrigadier({ shiftId, brigadierId: brigadier.id })
      : null

    materialsSessions.delete(telegramId)
    setUserState(telegramId, USER_STATES.SHIFT_MENU)

    if (brigadier && shift && openShiftMenu) {
      await openShiftMenu({ bot, chatId, telegramId, brigadier, shift, messages, logger })
      return
    }

    await bot.sendMessage(chatId, messages.materials.intro.missingShift)
  } catch (error) {
    logger.error('Не удалось вернуться в меню смены из блока материалов', { error: error.message })
    await bot.sendMessage(chatId, messages.systemError)
  }
}

module.exports = { registerMaterialsModule }
