const TelegramBot = require('node-telegram-bot-api')
const { registerStartHandler } = require('./handlers/start.handler')
const { registerPhotoHandler } = require('./handlers/photo.handler')
const { registerRegistrationModule } = require('../modules/register')
const { registerShiftMenuModule, startShiftMenuFlow, openShiftMenu } = require('../modules/shift-menu')
const { registerMainPanelModule, showMainPanel, openMainPanel } = require('../modules/main-panel')

// Создаём экземпляр бота и регистрируем обработчики
function createBot({ token, logger, repositories, messages, directusClient }) {
  const bot = new TelegramBot(token, { polling: true })

  registerStartHandler({
    bot,
    brigadiersRepo: repositories.brigadiers,
    logger,
    messages,
    showMainPanel: ({ bot: botInstance, chatId, brigadier, telegramId, forceSend = false }) =>
      showMainPanel({
        bot: botInstance,
        chatId,
        brigadier,
        telegramId,
        shiftsRepo: repositories.shifts,
        messages,
        forceSend,
      }),
  })

  registerRegistrationModule({
    bot,
    brigadiersRepo: repositories.brigadiers,
    logger,
    messages,
    showMainPanel: ({ bot: botInstance, chatId, brigadier, telegramId, forceSend = false }) =>
      showMainPanel({
        bot: botInstance,
        chatId,
        brigadier,
        telegramId,
        shiftsRepo: repositories.shifts,
        messages,
        forceSend,
      }),
  })

  registerPhotoHandler({
    bot,
    directusClient,
    logger,
    messages,
  })

  registerShiftMenuModule({
    bot,
    brigadiersRepo: repositories.brigadiers,
    shipsRepo: repositories.ships,
    shiftsRepo: repositories.shifts,
    logger,
    messages,
    returnToMainPanel: ({ chatId, telegramId }) =>
      openMainPanel({
        bot,
        chatId,
        telegramId,
        brigadiersRepo: repositories.brigadiers,
        shiftsRepo: repositories.shifts,
        messages,
        logger,
        forceSend: true,
      }),
  })

  registerMainPanelModule({
    bot,
    brigadiersRepo: repositories.brigadiers,
    shiftsRepo: repositories.shifts,
    messages,
    logger,
    startShiftMenuFlow: ({ chatId, telegramId }) =>
      startShiftMenuFlow({
        bot,
        chatId,
        telegramId,
        brigadiersRepo: repositories.brigadiers,
        messages,
        logger,
      }),
    openShiftMenu: ({ chatId, telegramId, brigadier, shift }) =>
      openShiftMenu({
        bot,
        chatId,
        telegramId,
        brigadier,
        shift,
        messages,
        logger,
      }),
  })

  bot.on('polling_error', (error) => {
    logger.error('Ошибка long polling', { error: error.message })
  })

  return bot
}

module.exports = { createBot }
