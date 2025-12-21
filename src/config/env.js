// Настройка окружения и проверка обязательных переменных
require('dotenv').config()

// Проверяем обязательные переменные окружения и формируем конфиг
function validateEnv() {
  // TODO: Review for merge — базовая валидация окружения
  const config = {
    bot: {
      token: requireEnv('TELEGRAM_BOT_TOKEN'),
    },
    db: {
      host: requireEnv('PG_HOST'),
      port: Number(requireEnv('PG_PORT')),
      database: requireEnv('PG_DATABASE'),
      user: requireEnv('PG_USER'),
      password: requireEnv('PG_PASSWORD'),
    },
    uploadsDir: process.env.UPLOADS_DIR || '/opt/mscshift-bot/uploads/holds',
  }

  // TODO: Review for merge — Directus настраивается опционально и не должен блокировать запуск
  const directusUrl = readEnvSoft('DIRECTUS_URL')
  const directusToken = readEnvSoft('DIRECTUS_TOKEN')
  const directusRootFolder = process.env.DIRECTUS_ROOT_FOLDER || 'MSCShiftBot'

  if (directusUrl && directusToken) {
    config.directus = {
      baseUrl: removeTrailingSlash(directusUrl),
      token: directusToken,
      rootFolder: directusRootFolder,
    }
  } else {
    config.directus = null
  }

  return config
}

// Вытягиваем переменную окружения или завершаем процесс с ошибкой
function requireEnv(name) {
  const value = process.env[name]

  if (!value || String(value).trim() === '') {
    throw new Error(`Переменная окружения ${name} не задана`)
  }

  return value
}

// Мягкое чтение переменной окружения без остановки процесса
function readEnvSoft(name) {
  const value = process.env[name]
  return value && String(value).trim() !== '' ? String(value).trim() : null
}

// Удаляем завершающий слэш для единообразия URL
function removeTrailingSlash(url) {
  if (!url) {
    return url
  }

  return url.endsWith('/') ? url.slice(0, -1) : url
}

module.exports = { validateEnv }
