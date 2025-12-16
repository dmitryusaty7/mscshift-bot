const TelegramBot = require('node-telegram-bot-api')
const { registerStartHandler } = require('./handlers/start.handler')

// Создаём экземпляр бота и регистрируем обработчики
function createBot({ token, logger, repositories, messages }) {
  const bot = new TelegramBot(token, { polling: true })

  registerStartHandler({
    bot,
    brigadiersRepo: repositories.brigadiers,
    logger,
    messages,
  })

  bot.on('polling_error', (error) => {
    logger.error('Ошибка long polling', { error: error.message })
  })

  return bot
}

module.exports = { createBot }
