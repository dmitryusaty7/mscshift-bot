const TelegramBot = require('node-telegram-bot-api')
const { registerStartHandler } = require('./handlers/start.handler')
const { registerRegistrationModule } = require('../modules/register')
const { registerShiftMenuModule, startShiftMenuFlow, openShiftMenu } = require('../modules/shift-menu')
const { registerMainPanelModule, showMainPanel, openMainPanel } = require('../modules/main-panel')
const { registerCrewModule } = require('../modules/crew')
const { registerSalaryModule } = require('../modules/salary')
const { registerMaterialsModule } = require('../modules/materials')
// TODO: Review for merge — регистрация блока расходов
const { registerExpensesModule } = require('../modules/expenses')
// TODO: Review for merge — регистрация блока 8 «Фото трюмов»
const { registerPhotosModule } = require('../modules/photos')

// Создаём экземпляр бота и регистрируем обработчики
function createBot({ token, logger, repositories, messages, directusClient, directusConfig }) {
  const bot = new TelegramBot(token, { polling: true })

  const crewModule = registerCrewModule({
    bot,
    logger,
    messages,
    crewRepo: repositories.crew,
    shiftsRepo: repositories.shifts,
    brigadiersRepo: repositories.brigadiers,
    wagesRepo: repositories.wages,
    openShiftMenu: ({ chatId, telegramId, brigadier, shift }) =>
      openShiftMenu({ bot, chatId, telegramId, brigadier, shift, messages, logger }),
  })

  const salaryModule = registerSalaryModule({
    bot,
    logger,
    messages,
    crewRepo: repositories.crew,
    wagesRepo: repositories.wages,
    shiftsRepo: repositories.shifts,
    brigadiersRepo: repositories.brigadiers,
    openShiftMenu: ({ chatId, telegramId, brigadier, shift }) =>
      openShiftMenu({ bot, chatId, telegramId, brigadier, shift, messages, logger }),
  })

  const materialsModule = registerMaterialsModule({
    bot,
    logger,
    messages,
    materialsRepo: repositories.materials,
    shiftsRepo: repositories.shifts,
    brigadiersRepo: repositories.brigadiers,
    openShiftMenu: ({ chatId, telegramId, brigadier, shift }) =>
      openShiftMenu({ bot, chatId, telegramId, brigadier, shift, messages, logger }),
  })

  // TODO: Review for merge — подключаем блок расходов
  const expensesModule = registerExpensesModule({
    bot,
    logger,
    messages,
    expensesRepo: repositories.expenses,
    shiftsRepo: repositories.shifts,
    brigadiersRepo: repositories.brigadiers,
      openShiftMenu: ({ chatId, telegramId, brigadier, shift }) =>
      openShiftMenu({ bot, chatId, telegramId, brigadier, shift, messages, logger }),
  })

  // TODO: Review for merge — подключаем блок фото трюмов
  const photosModule = registerPhotosModule({
    bot,
    logger,
    messages,
    shiftsRepo: repositories.shifts,
    holdsRepo: repositories.holds,
    holdPhotosRepo: repositories.holdPhotos,
    brigadiersRepo: repositories.brigadiers,
    directusConfig,
    openShiftMenu: ({ chatId, telegramId, brigadier, shift }) =>
      openShiftMenu({ bot, chatId, telegramId, brigadier, shift, messages, logger }),
  })

  // TODO: Review for merge — подключаем блок фото трюмов
  const photosModule = registerPhotosModule({
    bot,
    logger,
    messages,
    shiftsRepo: repositories.shifts,
    holdsRepo: repositories.holds,
    holdPhotosRepo: repositories.holdPhotos,
    brigadiersRepo: repositories.brigadiers,
    directusConfig,
    openShiftMenu: ({ chatId, telegramId, brigadier, shift }) =>
      openShiftMenu({ bot, chatId, telegramId, brigadier, shift, messages, logger }),
  })

  registerStartHandler({
    bot,
    brigadiersRepo: repositories.brigadiers,
    logger,
    messages,
    showMainPanel: ({ bot: botInstance, chatId, brigadier, telegramId, forceSend = false }) =>
      showMainPanel({
        bot: botInstance,
        chatId,
        brigadier,
        telegramId,
        shiftsRepo: repositories.shifts,
        messages,
        forceSend,
      }),
  })

  registerRegistrationModule({
    bot,
    brigadiersRepo: repositories.brigadiers,
    logger,
    messages,
    showMainPanel: ({ bot: botInstance, chatId, brigadier, telegramId, forceSend = false }) =>
      showMainPanel({
        bot: botInstance,
        chatId,
        brigadier,
        telegramId,
        shiftsRepo: repositories.shifts,
        messages,
        forceSend,
      }),
  })

  registerShiftMenuModule({
    bot,
    brigadiersRepo: repositories.brigadiers,
    shipsRepo: repositories.ships,
    shiftsRepo: repositories.shifts,
    logger,
    messages,
    returnToMainPanel: ({ chatId, telegramId }) =>
      openMainPanel({
        bot,
        chatId,
        telegramId,
        brigadiersRepo: repositories.brigadiers,
        shiftsRepo: repositories.shifts,
        messages,
        logger,
        forceSend: true,
      }),
    openCrewScene: ({ chatId, telegramId, session }) =>
      crewModule.openCrewFromShiftMenu({ chatId, telegramId, session }),
    openSalaryScene: ({ chatId, telegramId, session }) =>
      salaryModule.openSalaryFromShiftMenu({ chatId, telegramId, session }),
    openMaterialsScene: ({ chatId, telegramId, session }) =>
      materialsModule.openMaterialsFromShiftMenu({ chatId, telegramId, session }),
    openExpensesScene: ({ chatId, telegramId, session }) =>
      expensesModule.openExpensesFromShiftMenu({ chatId, telegramId, session }),
    openPhotosScene: ({ chatId, telegramId, session }) =>
      photosModule.openPhotosFromShiftMenu({ chatId, telegramId, session }),
  })

  registerMainPanelModule({
    bot,
    brigadiersRepo: repositories.brigadiers,
    shiftsRepo: repositories.shifts,
    messages,
    logger,
    startShiftMenuFlow: ({ chatId, telegramId }) =>
      startShiftMenuFlow({
        bot,
        chatId,
        telegramId,
        brigadiersRepo: repositories.brigadiers,
        messages,
        logger,
      }),
    openShiftMenu: ({ chatId, telegramId, brigadier, shift }) =>
      openShiftMenu({
        bot,
        chatId,
        telegramId,
        brigadier,
        shift,
        messages,
        logger,
      }),
  })

  bot.on('polling_error', (error) => {
    logger.error('Ошибка long polling', { error: error.message })
  })

  return bot
}

module.exports = { createBot }
