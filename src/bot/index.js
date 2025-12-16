const { Telegraf, Scenes, session } = require('telegraf')
const { registerStartHandler } = require('./handlers/start.handler')
const { createRegisterScene } = require('../scenes/register.scene')

// Создаём экземпляр бота и регистрируем обработчики
function createBot({ token, logger, repositories, messages }) {
  const bot = new Telegraf(token)

  const registerScene = createRegisterScene({
    messages,
    brigadiersRepo: repositories.brigadiers,
    logger,
  })

  const stage = new Scenes.Stage([registerScene])

  bot.use(session())
  bot.use(stage.middleware())

  registerStartHandler({
    bot,
    brigadiersRepo: repositories.brigadiers,
    logger,
    messages,
  })

  bot.catch((error, ctx) => {
    logger.error('Глобальная ошибка бота', {
      error: error.message,
      updateType: ctx.updateType,
    })
  })

  bot.launch()

  process.once('SIGINT', () => bot.stop('SIGINT'))
  process.once('SIGTERM', () => bot.stop('SIGTERM'))

  return bot
}

module.exports = { createBot }
