const { USER_STATES, setUserState, getUserState } = require('../bot/middlewares/session')
const { formatDateHuman } = require('../utils/time')
const { buildStatusesFromShift, isShiftComplete, statusIcon } = require('../utils/shift-status')

const activeShiftKeyboardSessions = new Map()
const mainPanelMessages = new Map()

// TODO: Добавить аналитику по кликам в панели бригадира
// TODO: Проверка на повторное открытие смены
// TODO: Поддержка возврата из смены в главное меню
// TODO: Собрать обратную связь по UX панели и зафиксировать быстрые улучшения

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

    if (msg.text === messages.navigation.back) {
      await openMainPanel({ bot, chatId, telegramId, brigadiersRepo, shiftsRepo, messages, logger })
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

    await clearActiveShiftsKeyboardSession({ telegramId, bot, logger })
    await showMainPanel({ bot, chatId, brigadier, shiftsRepo, messages, telegramId, logger })

    setUserState(telegramId, USER_STATES.MAIN_PANEL)
  } catch (error) {
    logger.error('Ошибка при открытии основной панели', { error: error.message })
    await bot.sendMessage(chatId, messages.systemError)
  }
}

// Отображение приветствия и клавиатуры главной панели
async function showMainPanel({ bot, chatId, brigadier, shiftsRepo, messages, telegramId, logger }) {
  const fullName = `${brigadier.last_name} ${brigadier.first_name}`.trim()
  const today = formatDateHuman(new Date())
  const activeShifts = await shiftsRepo.getActiveByBrigadier(brigadier.id)
  const activeList = activeShifts.map((shift) => formatActiveShiftButton({ shift }))

  const panelText = messages.mainPanel.summary({
    fullName,
    today,
    activeList,
  })

  await sendMainPanelMessage({
    bot,
    chatId,
    telegramId,
    panelText,
    messages,
    logger,
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

    await clearActiveShiftsKeyboardSession({ telegramId, bot, logger })

    const activeShiftsRaw = await shiftsRepo.getActiveByBrigadier(brigadier.id)
    const activeShifts = activeShiftsRaw.filter((shift) => {
      const isActive = shift?.is_closed === false || typeof shift?.is_closed === 'undefined'

      if (!isActive) {
        logger?.warn('Пропущена закрытая смена при построении списка', {
          telegramId,
          shiftId: shift?.id,
        })
      }

      return isActive
    })

    if (!activeShifts.length) {
      await bot.sendMessage(chatId, messages.mainPanel.noActiveShifts)
      return
    }

    const enrichedShifts = activeShifts
      .map((shift) => {
        try {
          const textWithoutStatus = formatActiveShiftButton({ shift, withStatusIcon: false })
          const statuses = buildStatusesFromShift(shift)
          const statusMark = statusIcon(isShiftComplete(statuses))

          return {
            shift,
            label: `${textWithoutStatus} ${statusMark}`,
          }
        } catch (error) {
          logger?.warn('Не удалось отрендерить активную смену', {
            telegramId,
            shiftId: shift?.id,
            error: error.message,
          })
          return null
        }
      })
      .filter(Boolean)

    if (!enrichedShifts.length) {
      await bot.sendMessage(chatId, messages.mainPanel.noActiveShifts)
      return
    }

    const inlineKeyboard = enrichedShifts.map((item) => [
      { text: item.label, callback_data: `activeShift:${item.shift.id}` },
    ])

    const sentMessage = await bot.sendMessage(
      chatId,
      messages.mainPanel.activeShiftsList(),
      {
        reply_markup: {
          inline_keyboard: inlineKeyboard,
        },
      },
    )

    activeShiftKeyboardSessions.set(telegramId, {
      chatId,
      messageId: sentMessage.message_id,
      inlineKeyboard,
    })
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

    await clearActiveShiftsKeyboardSession({ telegramId, bot, logger })
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
  return [[{ text: messages.mainPanel.newShiftButton }], [{ text: messages.mainPanel.activeShiftsButton }]]
}

// Формируем текст кнопки активной смены
function formatActiveShiftButton({ shift, withStatusIcon = true }) {
  const date = new Date(shift.date)
  const statuses = buildStatusesFromShift(shift)
  const completenessIcon = withStatusIcon ? ` ${statusIcon(isShiftComplete(statuses))}` : ''
  return `${formatDateHuman(date)} — ${shift.ship_name} (трюмов: ${shift.holds_count})${completenessIcon}`
}

// Скрываем inline-клавиатуры со списком активных смен, чтобы не оставлять лишние кнопки
async function clearActiveShiftsKeyboardSession({ telegramId, bot, logger }) {
  const session = activeShiftKeyboardSessions.get(telegramId)

  if (!session) {
    return
  }

  const hasButtons =
    Array.isArray(session.inlineKeyboard) &&
    session.inlineKeyboard.some((row) => Array.isArray(row) && row.length > 0)

  if (!hasButtons) {
    activeShiftKeyboardSessions.delete(telegramId)
    return
  }

  try {
    await bot.editMessageReplyMarkup(
      { inline_keyboard: [] },
      { chat_id: session.chatId, message_id: session.messageId },
    )
  } catch (error) {
    if (!String(error.message || '').includes('message is not modified')) {
      logger?.warn('Не удалось очистить клавиатуру активных смен', { error: error.message })
    }
  } finally {
    activeShiftKeyboardSessions.delete(telegramId)
  }
}

// Отправляем или переотправляем главное сообщение без дублирования
async function sendMainPanelMessage({ bot, chatId, telegramId, panelText, messages, logger }) {
  const previous = mainPanelMessages.get(telegramId)

  if (previous && previous.chatId === chatId && previous.text === panelText) {
    return
  }

  await deletePreviousMainPanelMessage({ bot, telegramId, logger })

  const sent = await bot.sendMessage(chatId, panelText, {
    reply_markup: {
      keyboard: buildMainKeyboard(messages),
      resize_keyboard: true,
    },
  })

  mainPanelMessages.set(telegramId, {
    chatId,
    messageId: sent.message_id,
    text: panelText,
  })
}

// Удаляем предыдущее приветственное сообщение, если оно ещё существует
async function deletePreviousMainPanelMessage({ bot, telegramId, logger }) {
  const previous = mainPanelMessages.get(telegramId)

  if (!previous) {
    return
  }

  try {
    await bot.deleteMessage(previous.chatId, previous.messageId)
  } catch (error) {
    logger?.warn('Не удалось удалить предыдущее сообщение главной панели', {
      error: error.message,
      telegramId,
      messageId: previous.messageId,
    })
  } finally {
    mainPanelMessages.delete(telegramId)
  }
}

module.exports = {
  registerMainPanelModule,
  showMainPanel,
  openMainPanel,
}
