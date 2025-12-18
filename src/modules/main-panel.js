const { USER_STATES, setUserState, getUserState } = require('../bot/middlewares/session')
const { formatDateHuman } = require('../utils/time')

// TODO: Добавить аналитику по кликам в панели бригадира
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

  bot.on('callback_query', async (query) => {
    const telegramId = query.from?.id
    const chatId = query.message?.chat.id
    const action = query.data

    if (!telegramId || !chatId || !action) {
      await bot.answerCallbackQuery(query.id)
      return
    }

    if (action === 'back') {
      await bot.answerCallbackQuery(query.id)
      await openMainPanel({ bot, chatId, telegramId, brigadiersRepo, shiftsRepo, messages, logger })
      return
    }

    if (!action.startsWith('activeShift:')) {
      return
    }

    const shiftId = Number.parseInt(action.split(':')[1], 10)

    if (!Number.isInteger(shiftId)) {
      await bot.answerCallbackQuery(query.id)
      return
    }

    try {
      const brigadier = await brigadiersRepo.findByTelegramId(String(telegramId))

      if (!brigadier) {
        await bot.answerCallbackQuery(query.id)
        await bot.sendMessage(chatId, messages.registrationRequired)
        return
      }

      const shift = await shiftsRepo.findActiveByIdAndBrigadier({ shiftId, brigadierId: brigadier.id })

      if (!shift) {
        await bot.answerCallbackQuery(query.id)
        await bot.sendMessage(chatId, messages.mainPanel.noActiveShifts)
        await openMainPanel({ bot, chatId, telegramId, brigadiersRepo, shiftsRepo, messages, logger })
        return
      }

      await bot.answerCallbackQuery(query.id)
      // TODO: Синхронизировать состояние пользователя с другими подсистемами
      await openShiftMenu({ chatId, telegramId, brigadier, shift })
    } catch (error) {
      logger.error('Не удалось обработать выбор активной смены', { error: error.message })
      await bot.answerCallbackQuery(query.id)
      await bot.sendMessage(chatId, messages.systemError)
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

    await showMainPanel({ bot, chatId, brigadier, shiftsRepo, messages, telegramId })

    setUserState(telegramId, USER_STATES.MAIN_PANEL)
  } catch (error) {
    logger.error('Ошибка при открытии основной панели', { error: error.message })
    await bot.sendMessage(chatId, messages.systemError)
  }
}

// Отображение приветствия и клавиатуры главной панели
async function showMainPanel({ bot, chatId, brigadier, shiftsRepo, messages, telegramId }) {
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

    const [latestShift, ...otherShifts] = activeShifts
    const latestShiftLine = `${formatActiveShiftButton(latestShift)} - ✅`
    const otherShiftButtons = otherShifts.map((shift) => ({
      text: `${formatActiveShiftButton(shift)} ✍️`,
      callback_data: `activeShift:${shift.id}`,
    }))

    const inlineKeyboard = [
      ...otherShiftButtons.map((button) => [button]),
      [{ text: messages.mainPanel.backButton, callback_data: 'back' }],
    ]

    await bot.sendMessage(
      chatId,
      messages.mainPanel.activeShiftsList({
        latestShiftLine,
        otherLines: otherShiftButtons.map((button) => button.text),
      }),
      {
        reply_markup: {
          inline_keyboard: inlineKeyboard,
        },
      },
    )
  } catch (error) {
    logger.error('Ошибка при получении активных смен', { error: error.message })
    await bot.sendMessage(chatId, messages.systemError)
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

// Формируем текст кнопки активной смены
function formatActiveShiftButton(shift) {
  const date = new Date(shift.date)
  return `${formatDateHuman(date)} — ${shift.ship_name} (трюмов: ${shift.holds_count})`
}

module.exports = {
  registerMainPanelModule,
  showMainPanel,
  openMainPanel,
}
