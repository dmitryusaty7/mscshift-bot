const { validateEnv } = require('./config/env')
const messages = require('./messages')
const { createBot } = require('./bot')
const { createDbPool, testDbConnection } = require('./db')
const { createBrigadiersRepo } = require('./db/brigadiers.repo')
const { createShipsRepo } = require('./db/ships.repo')
const { createShiftsRepo } = require('./db/shifts.repo')
const { createLogger } = require('./utils/logger')
const { createDirectusClient } = require('./directus')

const logger = createLogger()
const config = validateEnv()
const pool = createDbPool(config.db)

bootstrap()

// Точка входа в приложение
async function bootstrap() {
  try {
    await testDbConnection(pool)
    logger.info('Подключение к БД установлено')
  } catch (error) {
    logger.error('Не удалось подключиться к БД', { error: error.message })
    process.exit(1)
  }

  const brigadiersRepo = createBrigadiersRepo(pool)
  const shipsRepo = createShipsRepo(pool)
  const shiftsRepo = createShiftsRepo(pool)
  const directusClient = createDirectusClient(config.directus, logger)

  createBot({
    token: config.bot.token,
    logger,
    repositories: {
      brigadiers: brigadiersRepo,
      ships: shipsRepo,
      shifts: shiftsRepo,
    },
    messages,
    directusClient,
  })

  logger.info('Бот MSCShift запущен и готов принимать команды')
}

process.on('uncaughtException', (err) => {
  logger.error('Неперехваченное исключение', { error: err.message })
})

process.on('unhandledRejection', (reason) => {
  logger.error('Необработанное отклонение промиса', { reason })
})
