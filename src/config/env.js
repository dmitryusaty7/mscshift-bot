// Настройка окружения и проверка обязательных переменных
require('dotenv').config()

// Проверяем обязательные переменные окружения и формируем конфиг
function validateEnv() {
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

module.exports = { validateEnv }
