const TelegramBot = require('node-telegram-bot-api')
const { registerStartHandler } = require('./handlers/start.handler')
const { registerPhotoHandler } = require('./handlers/photo.handler')
const { registerRegistrationModule } = require('../modules/register')
const { registerShiftMenuModule, startShiftMenuFlow } = require('../modules/shift-menu')
const { registerMainPanelModule, showMainPanel } = require('../modules/main-panel')

// Создаём экземпляр бота и регистрируем обработчики
function createBot({ token, logger, repositories, messages, directusClient }) {
  const bot = new TelegramBot(token, { polling: true })

  registerStartHandler({
    bot,
    brigadiersRepo: repositories.brigadiers,
    logger,
    messages,
    showMainPanel: ({ bot: botInstance, chatId, brigadier }) =>
      showMainPanel({ bot: botInstance, chatId, brigadier, shiftsRepo: repositories.shifts, messages }),
  })

  registerRegistrationModule({
    bot,
    brigadiersRepo: repositories.brigadiers,
    logger,
    messages,
    showMainPanel: ({ bot: botInstance, chatId, brigadier }) =>
      showMainPanel({ bot: botInstance, chatId, brigadier, shiftsRepo: repositories.shifts, messages }),
  })

  registerRegistrationModule({
    bot,
    brigadiersRepo: repositories.brigadiers,
    logger,
    messages,
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
  })

  bot.on('polling_error', (error) => {
    logger.error('Ошибка long polling', { error: error.message })
  })

  return bot
}

module.exports = { createBot }
