const { USER_STATES, setUserState, getUserState } = require('../bot/middlewares/session')
const { formatDateHuman } = require('../utils/time')

// Регистрация обработчиков для Блока 2 — основная панель бригадира
function registerMainPanelModule({ bot, brigadiersRepo, shiftsRepo, messages, logger, startShiftMenuFlow }) {
  bot.onText(/\/(menu|main)/, async (msg) => {
    const chatId = msg.chat.id
    const telegramId = msg.from?.id

    if (!telegramId) {
      logger.error('Не удалось определить telegram_id у пользователя')
      await bot.sendMessage(chatId, messages.systemError)
      return
    }

    await openMainPanel({ bot, chatId, telegramId, brigadiersRepo, shiftsRepo, messages, logger })
  })

  bot.on('message', async (msg) => {
    const telegramId = msg.from?.id

    if (!telegramId || msg.text?.startsWith('/')) {
      return
    }

    const state = getUserState(telegramId)

    if (state !== USER_STATES.MAIN_PANEL) {
      return
    }

    if (msg.text === messages.mainPanel.newShiftButton) {
      setUserState(telegramId, USER_STATES.SHIFT_CREATION)
      await startShiftMenuFlow({
        bot,
        chatId: msg.chat.id,
        telegramId,
        brigadiersRepo,
        messages,
        logger,
      })
      return
    }

    if (msg.text === messages.mainPanel.activeShiftsButton) {
      await sendActiveShiftsSummary({ bot, chatId: msg.chat.id, telegramId, brigadiersRepo, shiftsRepo, messages, logger })
    }
  })
}

// Показ основной панели
async function openMainPanel({ bot, chatId, telegramId, brigadiersRepo, shiftsRepo, messages, logger }) {
  try {
    const brigadier = await brigadiersRepo.findByTelegramId(String(telegramId))

    if (!brigadier) {
      await bot.sendMessage(chatId, messages.registrationRequired)
      return
    }

    await showMainPanel({ bot, chatId, brigadier, shiftsRepo, messages })

    setUserState(telegramId, USER_STATES.MAIN_PANEL)
  } catch (error) {
    logger.error('Ошибка при открытии основной панели', { error: error.message })
    await bot.sendMessage(chatId, messages.systemError)
  }
}

// Отправка основного меню с клавиатурой
async function showMainPanel({ bot, chatId, brigadier, shiftsRepo, messages }) {
  const fullName = `${brigadier.last_name} ${brigadier.first_name}`.trim()
  const today = formatDateHuman(new Date())
  const activeCount = await shiftsRepo.countActiveByBrigadier(brigadier.id)

  const panelText = messages.mainPanel.summary({
    fullName,
    today,
    activeCount,
  })

  await bot.sendMessage(chatId, panelText, {
    reply_markup: {
      keyboard: [
        [{ text: messages.mainPanel.newShiftButton }],
        [{ text: messages.mainPanel.activeShiftsButton }],
      ],
      resize_keyboard: true,
    },
  })
}

// Отправляем список активных смен
async function sendActiveShiftsSummary({ bot, chatId, telegramId, brigadiersRepo, shiftsRepo, messages, logger }) {
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

    const lines = activeShifts.map((shift) => {
      const date = new Date(shift.date)
      return `${formatDateHuman(date)} — ${shift.ship_name} (трюмов: ${shift.holds_count})`
    })

    await bot.sendMessage(chatId, messages.mainPanel.activeShiftsList(lines))
  } catch (error) {
    logger.error('Ошибка при получении активных смен', { error: error.message })
    await bot.sendMessage(chatId, messages.systemError)
    // TODO: добавить оповещение администратору о сбое выборки активных смен
  }
}

module.exports = {
  registerMainPanelModule,
  showMainPanel,
  openMainPanel,
}
