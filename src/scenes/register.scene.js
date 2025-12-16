const { Scenes } = require('telegraf')
const { USER_STATES, setUserState } = require('../bot/middlewares/session')
const { mainMenu } = require('../bot/main-menu')

// Регулярное выражение для проверки имени/фамилии на русском языке
const NAME_REGEX = /^[А-ЯЁ][а-яё]{1,49}$/

// Создаём сцену регистрации нового пользователя
function createRegisterScene({ messages, brigadiersRepo, logger }) {
  const scene = new Scenes.WizardScene(
    'register',
    async (ctx) => {
      // TODO: добавить сбор пола и языка
      await ctx.reply(messages.registration.welcomeNewUser)
      await ctx.reply(messages.registration.askFirstName)
      return ctx.wizard.next()
    },
    async (ctx) => {
      const firstName = ctx.message?.text?.trim()

      if (!isValidName(firstName)) {
        await ctx.reply(messages.registration.invalidName)
        return
      }

      ctx.wizard.state.firstName = firstName
      await ctx.reply(messages.registration.askLastName)
      return ctx.wizard.next()
    },
    async (ctx) => {
      const lastName = ctx.message?.text?.trim()

      if (!isValidName(lastName)) {
        await ctx.reply(messages.registration.invalidName)
        return
      }

      const firstName = ctx.wizard.state.firstName
      const telegramId = String(ctx.from?.id)

      try {
        await brigadiersRepo.create({
          firstName,
          lastName,
          telegramId,
        })

        setUserState(telegramId, USER_STATES.AUTHORIZED)
        await ctx.reply(messages.registration.completed(firstName))
        await mainMenu(ctx, messages)
      } catch (error) {
        logger.error('Ошибка записи бригадира при регистрации', { error: error.message })
        await ctx.reply(messages.systemError)
      } finally {
        await ctx.scene.leave()
      }
    }
  )

  return scene
}

// Проверка имени/фамилии на соответствие требованиям
function isValidName(value) {
  return Boolean(value) && NAME_REGEX.test(value)
}

module.exports = {
  createRegisterScene,
  isValidName,
}
