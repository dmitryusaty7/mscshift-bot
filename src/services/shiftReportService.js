const DEFAULT_REPORT_CHAT_ID = -1003298300145

function createShiftReportService({ bot, logger, repositories, reportChatId }) {
  const targetChatId = Number.isFinite(reportChatId) ? reportChatId : DEFAULT_REPORT_CHAT_ID

  return { sendShiftCompletionReport }

  async function sendShiftCompletionReport(shiftId) {
    const shift = await repositories.shifts.getByIdWithShip(shiftId)

    if (!shift) {
      logger?.warn('Не удалось подготовить отчёт: смена не найдена', { shiftId })
      return
    }

    if (shift.group_message_id) {
      logger?.info('Отчёт о завершении смены уже был отправлен', {
        shiftId,
        chatId: targetChatId,
        messageId: shift.group_message_id,
      })
      return
    }

    const brigadier = await repositories.brigadiers.findById(shift.brigadier_id)
    const crew = await repositories.crew.getCrewByShift(shiftId)
    const wages = await repositories.wages.getShiftWages(shiftId)
    const materials = await repositories.materials.getShiftMaterials(shiftId)
    const expenses = await repositories.expenses.getShiftExpenses(shiftId)
    const photosCount = await repositories.holdPhotos.countTotalByShift(shiftId)
    const holdsWithCounts = await repositories.holds.getHoldsWithCounts(shiftId)

    const brigadierSalary = toIntOrZero(wages?.brigadier_amount)
    const deputySalary = toIntOrZero(crew?.deputy ? wages?.deputy_amount : null)
    const driverSalary = toIntOrZero(crew?.driver ? wages?.driver_amount : null)
    const workersTotal = toIntOrZero(wages?.workers_total)

    const salaryTotal = brigadierSalary + deputySalary + driverSalary + workersTotal

    const expenseFood = toIntOrZero(expenses?.food_amount)
    const expenseConsumables = toIntOrZero(expenses?.materials_amount)
    const expenseTaxi = toIntOrZero(expenses?.taxi_amount)
    const expenseOther = toIntOrZero(expenses?.other_amount)
    const expensesTotal = expenseFood + expenseConsumables + expenseTaxi + expenseOther

    const materialsSafe = materials || {}

    const reportData = {
      shiftNumber: toIntOrZero(shift.id),
      vesselName: shift.ship_name || '—',
      dateStart: formatDateDDMMYYYY(shift.date),
      dateEnd: formatDateDDMMYYYY(new Date()),
      brigadierFullName: normalizeName(
        brigadier ? `${brigadier.last_name} ${brigadier.first_name}` : '—',
      ),
      holdsCount: Array.isArray(holdsWithCounts)
        ? holdsWithCounts.filter((hold) => toIntOrZero(hold.photos_count) > 0).length
        : 0,
      photosCount: toIntOrZero(photosCount),
      salaryBrigadier: brigadierSalary,
      salaryDeputy: deputySalary,
      salaryDriver: driverSalary,
      salaryWorkersTotal: workersTotal,
      salaryTotal,
      pvd_3: toIntOrZero(materialsSafe.pvd_3m_used),
      pvd_6: toIntOrZero(materialsSafe.pvd_6m_used),
      pvd_12: toIntOrZero(materialsSafe.pvd_12m_used),
      pvd_14: toIntOrZero(materialsSafe.pvd_14m_used),
      pvcTubes: toNumberPretty(materialsSafe.pvh_tubes_used),
      tape: toIntOrZero(materialsSafe.tape_used),
      expenseFood,
      expenseConsumables,
      expenseTaxi,
      expenseOther,
      expensesTotal,
    }

    logger?.info('Shift completion report prepared', { shiftId, chatId: targetChatId, reportData })

    const message = formatReport(reportData)

    try {
      const sentMessage = await bot.sendMessage(targetChatId, message)
      await repositories.shifts.saveGroupMessageId({ shiftId, messageId: sentMessage.message_id })
      logger?.info('Shift completion report sent', {
        shiftId,
        chatId: targetChatId,
        messageId: sentMessage.message_id,
      })
    } catch (error) {
      logger?.warn('Failed to send shift completion report', {
        shiftId,
        chatId: targetChatId,
        error: error.message,
      })
    }
  }
}

function formatReport(reportData) {
  const lines = [
    `Смена №${reportData.shiftNumber} завершена`,
    '',
    `🛳 Судно: ${reportData.vesselName}`,
    `📅 Дата начала: ${reportData.dateStart}`,
    `📅 Дата завершения: ${reportData.dateEnd}`,
    `👷 Бригадир: ${reportData.brigadierFullName}`,
    '',
    '📦 Производство',
    `• Трюмов: ${reportData.holdsCount}`,
    `• Фото: ${reportData.photosCount}`,
    '',
    '💰 Заработная плата',
    `• Бригадир: ${reportData.salaryBrigadier} ₽`,
    `• Заместитель: ${reportData.salaryDeputy} ₽`,
    `• Водитель: ${reportData.salaryDriver} ₽`,
    `• Рабочие (всего): ${reportData.salaryWorkersTotal} ₽`,
    `• Итого: ${reportData.salaryTotal} ₽`,
    '',
    '🧾 Материалы израсходованы',
    `• ПВД (3 / 6 / 12 / 14 м): ${reportData.pvd_3} / ${reportData.pvd_6} / ${reportData.pvd_12} / ${reportData.pvd_14}`,
    `• Трубки ПВХ: ${reportData.pvcTubes} м.п.`,
    `• Клейкая лента: ${reportData.tape}`,
    '',
    '💸 Расходы',
    `• Питание: ${reportData.expenseFood} ₽`,
    `• Расходники: ${reportData.expenseConsumables} ₽`,
    `• Такси: ${reportData.expenseTaxi} ₽`,
    `• Прочее: ${reportData.expenseOther} ₽`,
    `• Итого: ${reportData.expensesTotal} ₽`,
    '',
    '🤖 Отчёт сформирован автоматически',
  ]

  return lines.join('\n')
}

function toIntOrZero(value) {
  const parsed = Number(value)

  if (!Number.isFinite(parsed)) {
    return 0
  }

  return Math.trunc(parsed)
}

function toNumberPretty(value) {
  const parsed = Number(value)

  if (!Number.isFinite(parsed)) {
    return 0
  }

  return Number.isInteger(parsed) ? Math.trunc(parsed) : parsed
}

function formatDateDDMMYYYY(date) {
  const parsedDate = new Date(date)

  if (Number.isNaN(parsedDate.getTime())) {
    return ''
  }

  const day = String(parsedDate.getDate()).padStart(2, '0')
  const month = String(parsedDate.getMonth() + 1).padStart(2, '0')
  const year = parsedDate.getFullYear()

  return `${day}.${month}.${year}`
}

function normalizeName(str) {
  if (!str) {
    return '—'
  }

  return str
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : ''))
    .filter(Boolean)
    .join(' ')
}

module.exports = { createShiftReportService, DEFAULT_REPORT_CHAT_ID }
