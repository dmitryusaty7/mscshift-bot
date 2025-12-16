const { USER_STATES, setUserState } = require('../middlewares/session')

// Обработчик /start для входа в систему
function registerStartHandler({ bot, brigadiersRepo, logger, messages }) {
  bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id
    const telegramId = msg.from?.id
    const firstName = msg.from?.first_name || ''

    if (!telegramId) {
      logger.error('Не удалось определить telegram_id у пользователя')
      await bot.sendMessage(chatId, messages.systemError)
      return
    }

    try {
      const brigadier = await brigadiersRepo.findByTelegramId(String(telegramId))

      if (brigadier) {
        setUserState(telegramId, USER_STATES.AUTHORIZED)
        await bot.sendMessage(chatId, messages.welcomeExistingUser(firstName))
        await bot.sendMessage(chatId, messages.mainPanelRedirect)
        // TODO: Block 2 — перейти в основную панель
        return
      }

      setUserState(telegramId, USER_STATES.REGISTRATION)
      await bot.sendMessage(chatId, messages.welcomeNewUser)
      await bot.sendMessage(chatId, messages.registrationRedirect)
      // TODO: Block 1 — запуск регистрации
    } catch (error) {
      logger.error('Ошибка обработки команды /start', { error: error.message })
      await bot.sendMessage(chatId, messages.systemError)
    }
  })
}

module.exports = { registerStartHandler }
