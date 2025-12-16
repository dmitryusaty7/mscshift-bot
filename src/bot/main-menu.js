// Заглушка основной панели — будет расширена в Блоке 2
async function mainMenu(ctx, messages) {
  await ctx.reply(messages.mainPanelRedirect)
  // TODO: Block 2 — вывести реальные элементы главной панели
}

module.exports = { mainMenu }
