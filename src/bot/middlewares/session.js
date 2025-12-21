// Простое хранение состояния пользователя в памяти
const USER_STATES = {
  UNAUTHORIZED: 'UNAUTHORIZED',
  REGISTRATION: 'REGISTRATION',
  MAIN_PANEL: 'MAIN_PANEL',
  ACTIVE_SHIFTS: 'ACTIVE_SHIFTS',
  SHIFT_CREATION: 'SHIFT_CREATION',
  SHIFT_MENU: 'SHIFT_MENU',
  SHIFT_CREW: 'SHIFT_CREW',
  SHIFT_SALARY: 'SHIFT_SALARY',
  SHIFT_MATERIALS: 'SHIFT_MATERIALS',
  // TODO: Review for merge — состояние работы с расходами
  SHIFT_EXPENSES: 'SHIFT_EXPENSES',
  // TODO: Review for merge — состояние работы с фото трюмов
  SHIFT_PHOTOS: 'SHIFT_PHOTOS',
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
