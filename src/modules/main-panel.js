const { USER_STATES, setUserState, getUserState } = require('../bot/middlewares/session')
const { formatDateHuman } = require('../utils/time')

const activeShiftKeyboardSessions = new Map()
// TODO: Проверка на повторное открытие смены
// TODO: Поддержка возврата из смены в главное меню

// Регистрация обработчиков для Блока 2 — главная панель бригадира
function registerMainPanelModule({
  bot,
  brigadiersRepo,
  shiftsRepo,
  messages,
  logger,
  startShiftMenuFlow,
  openShiftMenu,
}) {
  // Отображение главной панели по команде
  bot.onText(/\/(menu|main)/, async (msg) => {
    const chatId = msg.chat.id
    const telegramId = msg.from?.id

    if (!telegramId || !/^\d+$/.test(String(telegramId))) {
      logger.error('Не удалось определить корректный telegram_id у пользователя', { telegramId })
      await bot.sendMessage(chatId, messages.systemError)
      return
    }

    await openMainPanel({ bot, chatId, telegramId, brigadiersRepo, shiftsRepo, messages, logger })
  })

  // Отработка кнопок главной панели
  bot.on('message', async (msg) => {
    const telegramId = msg.from?.id
    const chatId = msg.chat.id

    if (!telegramId || !/^\d+$/.test(String(telegramId))) {
      return
    }

    if (msg.text?.startsWith('/')) {
      return
    }

    const state = getUserState(telegramId)

    if (state !== USER_STATES.MAIN_PANEL) {
      return
    }

    const handledByShiftSelection = await handleShiftSelectionIfNeeded({
      bot,
      msg,
      telegramId,
      chatId,
      brigadiersRepo,
      shiftsRepo,
      messages,
      logger,
      openShiftMenu,
    })

    if (handledByShiftSelection) {
      return
    }

    if (msg.text === messages.mainPanel.newShiftButton) {
      await handleNewShiftRequest({
        bot,
        chatId,
        telegramId,
        brigadiersRepo,
        messages,
        logger,
        startShiftMenuFlow,
      })
      return
    }

    if (msg.text === messages.mainPanel.activeShiftsButton) {
      await handleActiveShiftsRequest({
        bot,
        chatId,
        telegramId,
        brigadiersRepo,
        shiftsRepo,
        messages,
        logger,
      })
    }
  })
}

// Отображение основной панели и сброс вспомогательных клавиатур
async function openMainPanel({ bot, chatId, telegramId, brigadiersRepo, shiftsRepo, messages, logger }) {
  try {
    const brigadier = await brigadiersRepo.findByTelegramId(String(telegramId))

    if (!brigadier) {
      await bot.sendMessage(chatId, messages.registrationRequired)
      return
    }

    activeShiftKeyboardSessions.delete(telegramId)
    await showMainPanel({ bot, chatId, brigadier, shiftsRepo, messages, telegramId })

    setUserState(telegramId, USER_STATES.MAIN_PANEL)
  } catch (error) {
    logger.error('Ошибка при открытии основной панели', { error: error.message })
    await bot.sendMessage(chatId, messages.systemError)
  }
}

// Отображение приветствия и клавиатуры главной панели
async function showMainPanel({ bot, chatId, brigadier, shiftsRepo, messages, telegramId }) {
  if (telegramId) {
    activeShiftKeyboardSessions.delete(telegramId)
  }

  const fullName = `${brigadier.last_name} ${brigadier.first_name}`.trim()
  const today = formatDateHuman(new Date())
  const activeShifts = await shiftsRepo.getActiveByBrigadier(brigadier.id)
  const activeList = activeShifts.map((shift) => formatActiveShiftButton(shift))

  const panelText = messages.mainPanel.summary({
    fullName,
    today,
    activeList,
  })

  await bot.sendMessage(chatId, panelText, {
    reply_markup: {
      keyboard: buildMainKeyboard(messages),
      resize_keyboard: true,
    },
  })
}

// Обработка запроса списка активных смен
async function handleActiveShiftsRequest({ bot, chatId, telegramId, brigadiersRepo, shiftsRepo, messages, logger }) {
  try {
    const brigadier = await brigadiersRepo.findByTelegramId(String(telegramId))

    if (!brigadier) {
      await bot.sendMessage(chatId, messages.registrationRequired)
      return
    }

    const activeShifts = await shiftsRepo.getActiveByBrigadier(brigadier.id)

    if (!activeShifts.length) {
      await bot.sendMessage(chatId, messages.mainPanel.noActiveShifts)
      return
    }

    const buttons = buildActiveShiftButtons(activeShifts)
    activeShiftKeyboardSessions.set(telegramId, buttons)

    await bot.sendMessage(chatId, messages.mainPanel.activeShiftsList(buttons.map((button) => button.text)), {
      reply_markup: {
        keyboard: [...buttons.map((button) => [{ text: button.text }]), [{ text: messages.mainPanel.backButton }]],
        resize_keyboard: true,
      },
    })

    await bot.sendMessage(chatId, messages.mainPanel.activeShiftsHint)
  } catch (error) {
    logger.error('Ошибка при получении активных смен', { error: error.message })
    await bot.sendMessage(chatId, messages.systemError)
  }
}

// Обрабатываем выбор смены или возврат назад
async function handleShiftSelectionIfNeeded({
  bot,
  msg,
  telegramId,
  chatId,
  brigadiersRepo,
  shiftsRepo,
  messages,
  logger,
  openShiftMenu,
}) {
  const session = activeShiftKeyboardSessions.get(telegramId)

  if (!session) {
    return false
  }

  if (msg.text === messages.mainPanel.backButton) {
    activeShiftKeyboardSessions.delete(telegramId)
    await botSendMainKeyboard({ bot, chatId, messages })
    return true
  }

  const targetShift = session.find((item) => item.text === msg.text)

  if (!targetShift) {
    return false
  }

  try {
    const brigadier = await brigadiersRepo.findByTelegramId(String(telegramId))

    if (!brigadier) {
      await bot.sendMessage(chatId, messages.registrationRequired)
      return true
    }

    const shift = await shiftsRepo.findActiveByIdAndBrigadier({
      shiftId: targetShift.shiftId,
      brigadierId: brigadier.id,
    })

    if (!shift) {
      await bot.sendMessage(chatId, messages.mainPanel.noActiveShifts)
      activeShiftKeyboardSessions.delete(telegramId)
      await botSendMainKeyboard({ bot, chatId, messages })
      return true
    }

    activeShiftKeyboardSessions.delete(telegramId)
    await openShiftMenu({ chatId, telegramId, brigadier, shift })
    return true
  } catch (error) {
    logger.error('Не удалось открыть выбранную смену', { error: error.message })
    await bot.sendMessage(chatId, messages.systemError)
    return true
  }
}

// Запуск сценария создания новой смены
async function handleNewShiftRequest({
  bot,
  chatId,
  telegramId,
  brigadiersRepo,
  messages,
  logger,
  startShiftMenuFlow,
}) {
  try {
    const brigadier = await brigadiersRepo.findByTelegramId(String(telegramId))

    if (!brigadier) {
      await bot.sendMessage(chatId, messages.registrationRequired)
      return
    }

    activeShiftKeyboardSessions.delete(telegramId)
    setUserState(telegramId, USER_STATES.SHIFT_CREATION)

    await startShiftMenuFlow({
      chatId,
      telegramId,
    })
  } catch (error) {
    logger.error('Не удалось запустить создание смены из главной панели', { error: error.message })
    await bot.sendMessage(chatId, messages.systemError)
  }
}

// Формируем основную клавиатуру панели
function buildMainKeyboard(messages) {
  return [
    [{ text: messages.mainPanel.newShiftButton }],
    [{ text: messages.mainPanel.activeShiftsButton }],
  ]
}

// Форматирование кнопок активных смен
function buildActiveShiftButtons(activeShifts) {
  return activeShifts.map((shift) => ({
    text: formatActiveShiftButton(shift),
    shiftId: shift.id,
  }))
}

// Формируем текст кнопки активной смены
function formatActiveShiftButton(shift) {
  const date = new Date(shift.date)
  return `${formatDateHuman(date)} — ${shift.ship_name} (трюмов: ${shift.holds_count})`
}

// Возврат на основную клавиатуру без дублирования приветствия
async function botSendMainKeyboard({ bot, chatId, messages }) {
  await bot.sendMessage(chatId, messages.mainPanel.returnedToMain, {
    reply_markup: {
      keyboard: buildMainKeyboard(messages),
      resize_keyboard: true,
    },
  })
}

module.exports = {
  registerMainPanelModule,
  showMainPanel,
  openMainPanel,
}
