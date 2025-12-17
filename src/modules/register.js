const { USER_STATES, getUserState, setUserState } = require('../bot/middlewares/session')

// Этапы FSM для регистрации
const REGISTRATION_STEPS = {
  WAITING_FIRST_NAME: 'WAITING_FIRST_NAME',
  WAITING_LAST_NAME: 'WAITING_LAST_NAME',
}

// Простое хранение шагов регистрации в памяти
const registrationSessions = new Map()

// Регистрация обработчика шагов регистрации
function registerRegistrationModule({ bot, brigadiersRepo, messages, logger, showMainPanel }) {
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

    const currentStep = registrationSessions.get(telegramId)?.step || REGISTRATION_STEPS.WAITING_FIRST_NAME

    switch (currentStep) {
      case REGISTRATION_STEPS.WAITING_FIRST_NAME:
        await handleFirstNameStep({
          bot,
          msg,
          telegramId,
          chatId,
          messages,
        })
        break
      case REGISTRATION_STEPS.WAITING_LAST_NAME:
        await handleLastNameStep({
          bot,
          msg,
          telegramId,
          chatId,
          brigadiersRepo,
          messages,
          logger,
          showMainPanel,
        })
        break
      default:
        registrationSessions.set(telegramId, { step: REGISTRATION_STEPS.WAITING_FIRST_NAME })
        await bot.sendMessage(chatId, messages.registration.askFirstName)
    }
  })
}

// Запускаем регистрацию для нового пользователя
async function startRegistrationFlow({ bot, chatId, telegramId, messages }) {
  setUserState(telegramId, USER_STATES.REGISTRATION)
  registrationSessions.set(telegramId, { step: REGISTRATION_STEPS.WAITING_FIRST_NAME })
  await bot.sendMessage(chatId, messages.registration.intro)
  await bot.sendMessage(chatId, messages.registration.askFirstName)
}

// Обрабатываем ввод имени
async function handleFirstNameStep({ bot, msg, telegramId, chatId, messages }) {
  const firstNameRaw = msg.text?.trim()

  if (!isValidName(firstNameRaw)) {
    await bot.sendMessage(chatId, messages.registration.invalidName)
    return
  }

  const firstName = normalizeName(firstNameRaw)

  registrationSessions.set(telegramId, {
    step: REGISTRATION_STEPS.WAITING_LAST_NAME,
    data: { firstName },
  })

  await bot.sendMessage(chatId, messages.registration.askLastName)
}

// Обрабатываем ввод фамилии
async function handleLastNameStep({ bot, msg, telegramId, chatId, brigadiersRepo, messages, logger, showMainPanel }) {
  const lastNameRaw = msg.text?.trim()

  if (!isValidName(lastNameRaw)) {
    await bot.sendMessage(chatId, messages.registration.invalidName)
    return
  }

  const session = registrationSessions.get(telegramId)

  if (!session || !session.data?.firstName) {
    registrationSessions.set(telegramId, { step: REGISTRATION_STEPS.WAITING_FIRST_NAME })
    await bot.sendMessage(chatId, messages.registration.askFirstName)
    return
  }

  const lastName = normalizeName(lastNameRaw)

  try {
    const brigadier = await brigadiersRepo.create({
      telegramId: String(telegramId),
      firstName: session.data.firstName,
      lastName,
    })

    setUserState(telegramId, USER_STATES.MAIN_PANEL)
    registrationSessions.delete(telegramId)

    const fullName = `${lastName} ${session.data.firstName}`

    await bot.sendMessage(chatId, messages.registration.completed(fullName))
    if (showMainPanel) {
      await showMainPanel({ bot, chatId, brigadier })
    } else {
      await bot.sendMessage(chatId, messages.mainPanelRedirect)
      // TODO: перейти в блок основной панели
    }
  } catch (error) {
    logger.error('Ошибка регистрации бригадира', { error: error.message })
    await bot.sendMessage(chatId, messages.systemError)
    // TODO: уведомить админов о падении
  }
}

// Валидация имени/фамилии: кириллица, 2-50 символов, первая буква заглавная
function isValidName(value) {
  if (!value) return false

  const normalized = value.trim().replace(/\s+/g, ' ')

  if (normalized.length < 2 || normalized.length > 50) {
    return false
  }

  return /^[А-ЯЁ][А-ЯЁа-яё\-\s]{1,49}$/u.test(normalized)
}

// Нормализация ФИО с заглавными буквами для составных частей
function normalizeName(value) {
  return value
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .map((part) =>
      part
        .split('-')
        .map((segment) => capitalize(segment))
        .join('-')
    )
    .join(' ')
}

function capitalize(segment) {
  if (!segment) return segment
  const lower = segment.toLowerCase()
  return `${lower.charAt(0).toUpperCase()}${lower.slice(1)}`
}

module.exports = {
  registerRegistrationModule,
  startRegistrationFlow,
}
