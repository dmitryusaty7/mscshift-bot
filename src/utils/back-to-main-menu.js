const { USER_STATES, setUserState } = require('../bot/middlewares/session')

// TODO: Code Review for mergeability — убедиться, что единая логика подходит для всех блоков
// Унифицированный возврат пользователя в главное меню без дублирования сообщений
async function backToMainMenu(ctx) {
  const {
    bot,
    chatId,
    telegramId,
    logger,
    openMainMenu,
    cleanups = [],
  } = ctx || {}

  // Русский комментарий: проверяем минимальный набор данных для безопасного возврата
  if (!bot || !chatId || !telegramId || typeof openMainMenu !== 'function') {
    logger?.warn('Недостаточно данных для возврата в главное меню', { chatId, telegramId })
    return
  }

  // Русский комментарий: последовательно выполняем переданные очистки, чтобы не оставлять клавиатуры
  for (const cleanup of cleanups) {
    if (typeof cleanup === 'function') {
      try {
        // Русский комментарий: если очистка упала, продолжаем, чтобы не блокировать возврат
        await cleanup()
      } catch (error) {
        logger?.warn('Очистка перед возвратом завершилась с ошибкой', { error: error.message })
      }
    }
  }

  // Русский комментарий: фиксируем состояние, чтобы остальные хендлеры не перехватывали сообщения
  setUserState(telegramId, USER_STATES.MAIN_PANEL)

  // Русский комментарий: показываем главное меню через переданный колбэк
  try {
    await openMainMenu()
  } catch (error) {
    logger?.error('Не удалось показать главное меню после возврата', { error: error.message })
  }
}

module.exports = { backToMainMenu }
