const TelegramBot = require('node-telegram-bot-api')
const { registerStartHandler } = require('./handlers/start.handler')
const { registerPhotoHandler } = require('./handlers/photo.handler')

// Создаём экземпляр бота и регистрируем обработчики
function createBot({ token, logger, repositories, messages, directusClient }) {
  const bot = new TelegramBot(token, { polling: true })

  registerStartHandler({
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
  
  bot.on('polling_error', (error) => {
    logger.error('Ошибка long polling', { error: error.message })
  })

  return bot
}

module.exports = { createBot }
