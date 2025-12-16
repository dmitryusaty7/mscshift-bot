// Простое хранение состояния пользователя в памяти
const USER_STATES = {
  UNAUTHORIZED: 'UNAUTHORIZED',
  AUTHORIZED: 'AUTHORIZED',
  REGISTRATION: 'REGISTRATION',
}

const sessions = new Map()

// Устанавливаем состояние пользователя
function setUserState(telegramId, state) {
  sessions.set(telegramId, { state })
}

// Получаем состояние пользователя, по умолчанию UNAUTHORIZED
function getUserState(telegramId) {
  return sessions.get(telegramId)?.state || USER_STATES.UNAUTHORIZED
}

module.exports = { USER_STATES, setUserState, getUserState }
