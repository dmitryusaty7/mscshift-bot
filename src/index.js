const { validateEnv } = require('./config/env')
const messages = require('./messages')
const { createBot } = require('./bot')
const { createDbPool, testDbConnection } = require('./db')
const { createBrigadiersRepo } = require('./db/brigadiers.repo')
const { createShipsRepo } = require('./db/ships.repo')
const { createShiftsRepo } = require('./db/shifts.repo')
const { createCrewRepo } = require('./db/crew.repo')
const { createWagesRepo } = require('./db/wages.repo')
const { createMaterialsRepo } = require('./db/materials.repo')
// TODO: Review for merge — репозиторий расходов смены
const { createExpensesRepo } = require('./db/expenses.repo')
// TODO: Review for merge — репозитории трюмов и фото трюмов
const { createHoldsRepo } = require('./db/holds.repo')
const { createHoldPhotosRepo } = require('./db/hold-photos.repo')
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
  const crewRepo = createCrewRepo(pool)
  const wagesRepo = createWagesRepo(pool)
  const materialsRepo = createMaterialsRepo(pool)
  // TODO: Review for merge — инициализация работы с расходами
  const expensesRepo = createExpensesRepo(pool)
  // TODO: Review for merge — инициализация работы с трюмами и фото трюмов
  const holdsRepo = createHoldsRepo(pool)
  const holdPhotosRepo = createHoldPhotosRepo(pool, logger)
  // TODO: Review for merge — Directus может быть не настроен, поэтому клиент создаётся только при наличии конфигурации
  const directusClient = config.directus
    ? createDirectusClient({
        baseUrl: config.directus.baseUrl,
        token: config.directus.token,
        collections: {
          users: 'users',
          shifts: 'shifts',
          shiftPhotos: 'shift_photos',
        },
      }, logger)
    : null

  createBot({
    token: config.bot.token,
    logger,
    repositories: {
      brigadiers: brigadiersRepo,
      ships: shipsRepo,
      shifts: shiftsRepo,
      crew: crewRepo,
      wages: wagesRepo,
      materials: materialsRepo,
      expenses: expensesRepo,
      holds: holdsRepo,
      holdPhotos: holdPhotosRepo,
    },
    messages,
    directusClient,
    uploadsDir: config.uploadsDir,
  })

  logger.info('Бот MSCShift запущен и готов принимать команды')
}

process.on('uncaughtException', (err) => {
  logger.error('Неперехваченное исключение', { error: err.message })
})

process.on('unhandledRejection', (reason) => {
  logger.error('Необработанное отклонение промиса', { reason })
})
