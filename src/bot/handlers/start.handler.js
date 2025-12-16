const { USER_STATES, setUserState } = require('../middlewares/session')
const { mainMenu } = require('../main-menu')

// Обработчик /start для входа в систему
function registerStartHandler({ bot, brigadiersRepo, logger, messages }) {
  bot.start(async (ctx) => {
    const telegramId = ctx.from?.id
    const firstName = ctx.from?.first_name || ''

    if (!telegramId) {
      logger.error('Не удалось определить telegram_id у пользователя')
      await ctx.reply(messages.systemError)
      return
    }

    try {
      const brigadier = await brigadiersRepo.findByTelegramId(String(telegramId))

      if (brigadier) {
        setUserState(telegramId, USER_STATES.AUTHORIZED)
        await ctx.reply(messages.welcomeExistingUser(firstName))
        await mainMenu(ctx, messages)
        return
      }

      setUserState(telegramId, USER_STATES.REGISTRATION)
      await ctx.scene.enter('register')
    } catch (error) {
      logger.error('Ошибка обработки команды /start', { error: error.message })
      await ctx.reply(messages.systemError)
    }
  })
}

module.exports = { registerStartHandler }
