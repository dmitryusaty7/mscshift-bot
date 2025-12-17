const { USER_STATES, getUserState, setUserState } = require('../bot/middlewares/session')

// Этапы FSM для регистрации
const REGISTRATION_STEPS = {
  WAITING_FULL_NAME: 'WAITING_FULL_NAME',
}

// Простое хранение шагов регистрации в памяти
const registrationSessions = new Map()

// Регистрация обработчика шагов регистрации
function registerRegistrationModule({ bot, brigadiersRepo, messages, logger }) {
  bot.on('message', async (msg) => {
    const telegramId = msg.from?.id
    const chatId = msg.chat.id

    if (!telegramId) {
      // TODO: добавить алерт в админку
      return
    }

    if (getUserState(telegramId) !== USER_STATES.REGISTRATION) {
      return
    }

    const currentStep = registrationSessions.get(telegramId)?.step || REGISTRATION_STEPS.WAITING_FULL_NAME

    switch (currentStep) {
      case REGISTRATION_STEPS.WAITING_FULL_NAME:
        await handleFullNameStep({
          bot,
          msg,
          telegramId,
          chatId,
          brigadiersRepo,
          messages,
          logger,
        })
        break
      default:
        registrationSessions.set(telegramId, { step: REGISTRATION_STEPS.WAITING_FULL_NAME })
        await bot.sendMessage(chatId, messages.registration.askFullName)
    }
  })
}

// Запускаем регистрацию для нового пользователя
async function startRegistrationFlow({ bot, chatId, telegramId, messages }) {
  registrationSessions.set(telegramId, { step: REGISTRATION_STEPS.WAITING_FULL_NAME })
  await bot.sendMessage(chatId, messages.registration.intro)
  await bot.sendMessage(chatId, messages.registration.askFullName)
}

// Обрабатываем ввод ФИО
async function handleFullNameStep({ bot, msg, telegramId, chatId, brigadiersRepo, messages, logger }) {
  const fullName = msg.text?.trim()

  if (!fullName) {
    await bot.sendMessage(chatId, messages.registration.invalidFullName)
    return
  }

  const parsedName = parseFullName(fullName)

  if (!parsedName) {
    await bot.sendMessage(chatId, messages.registration.invalidFullName)
    return
  }

  try {
    await brigadiersRepo.create({
      telegramId: String(telegramId),
      firstName: parsedName.firstName,
      lastName: parsedName.lastName,
    })

    setUserState(telegramId, USER_STATES.AUTHORIZED)
    registrationSessions.delete(telegramId)

    await bot.sendMessage(chatId, messages.registration.completed(`${parsedName.firstName} ${parsedName.lastName}`))
    await bot.sendMessage(chatId, messages.mainPanelRedirect)
    // TODO: перейти в блок основной панели
  } catch (error) {
    logger.error('Ошибка регистрации бригадира', { error: error.message })
    await bot.sendMessage(chatId, messages.systemError)
    // TODO: уведомить админов о падении
  }
}

// Проверяем корректность ФИО: только кириллица, минимум имя и фамилия
function parseFullName(fullName) {
  const normalized = fullName.replace(/\s+/g, ' ').trim()
  const parts = normalized.split(' ')

  if (parts.length < 2) {
    return null
  }

  const [firstName, ...lastNameParts] = parts

  if (!isCyrillicWord(firstName) || lastNameParts.some((part) => !isCyrillicWord(part))) {
    return null
  }

  return {
    firstName: capitalize(firstName),
    lastName: capitalize(lastNameParts.join(' ')),
  }
}

function isCyrillicWord(value) {
  return /^[А-ЯЁа-яё-]{2,}$/.test(value)
}

function capitalize(value) {
  if (!value) return value
  const lower = value.toLowerCase()
  return `${lower.charAt(0).toUpperCase()}${lower.slice(1)}`
}

module.exports = {
  registerRegistrationModule,
  startRegistrationFlow,
}
