// Простое хранение состояния пользователя в памяти
const USER_STATES = {
  UNAUTHORIZED: 'UNAUTHORIZED',
  REGISTRATION: 'REGISTRATION',
  MAIN_PANEL: 'MAIN_PANEL',
  SHIFT_CREATION: 'SHIFT_CREATION',
  SHIFT_MENU: 'SHIFT_MENU',
}

const sessions = new Map()
// TODO: при добавлении таблицы user_states синхронизировать состояние в БД

// Устанавливаем состояние пользователя
function setUserState(telegramId, state) {
  sessions.set(telegramId, { state })
}

// Получаем состояние пользователя, по умолчанию UNAUTHORIZED
function getUserState(telegramId) {
  return sessions.get(telegramId)?.state || USER_STATES.UNAUTHORIZED
}

module.exports = { USER_STATES, setUserState, getUserState }
