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
    directus: {
      baseUrl: requireEnv('DIRECTUS_URL'),
      token: requireEnv('DIRECTUS_STATIC_TOKEN'),
      collections: {
        users: process.env.DIRECTUS_USERS_COLLECTION || 'users',
        shifts: process.env.DIRECTUS_SHIFTS_COLLECTION || 'shifts',
        shiftPhotos: process.env.DIRECTUS_SHIFT_PHOTOS_COLLECTION || 'shift_photos',
      },
      defaultShiftStatus: process.env.DIRECTUS_SHIFT_DEFAULT_STATUS || undefined,
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
