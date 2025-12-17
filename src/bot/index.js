const TelegramBot = require('node-telegram-bot-api')
const { registerStartHandler } = require('./handlers/start.handler')
const { registerPhotoHandler } = require('./handlers/photo.handler')
const { registerRegistrationModule } = require('../modules/register')
const { registerShiftMenuModule } = require('../modules/shift-menu')

// Создаём экземпляр бота и регистрируем обработчики
function createBot({ token, logger, repositories, messages, directusClient }) {
  const bot = new TelegramBot(token, { polling: true })

  registerStartHandler({
    bot,
    brigadiersRepo: repositories.brigadiers,
    logger,
    messages,
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
    holdsRepo: repositories.holds,
    logger,
    messages,
  })

  bot.on('polling_error', (error) => {
    logger.error('Ошибка long polling', { error: error.message })
  })

  return bot
}

module.exports = { createBot }
