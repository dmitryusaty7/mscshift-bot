const { USER_STATES, setUserState } = require('../middlewares/session')
const { startRegistrationFlow } = require('../../modules/register')

// Обработчик /start для входа в систему
function registerStartHandler({ bot, brigadiersRepo, logger, messages, showMainPanel }) {
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
        setUserState(telegramId, USER_STATES.MAIN_PANEL)
        await bot.sendMessage(chatId, messages.welcomeExistingUser(firstName))
        if (showMainPanel) {
          await showMainPanel({ bot, chatId, brigadier })
        } else {
          await bot.sendMessage(chatId, messages.mainPanelRedirect)
        }
        return
      }

      setUserState(telegramId, USER_STATES.REGISTRATION)
      await bot.sendMessage(chatId, messages.welcomeNewUser)
      await startRegistrationFlow({ bot, chatId, telegramId, messages })
    } catch (error) {
      logger.error('Ошибка обработки команды /start', { error: error.message })
      await bot.sendMessage(chatId, messages.systemError)
    }
  })
}

module.exports = { registerStartHandler }
