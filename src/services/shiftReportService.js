const { formatDateHuman } = require('../utils/time')

const DEFAULT_REPORT_CHAT_ID = -1003298300145
const SEPARATOR = '— — — — — — — — — —'

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
    const brigadierName = brigadier
      ? `${brigadier.last_name} ${brigadier.first_name}`.trim()
      : '—'

    const crew = await repositories.crew.getCrewByShift(shiftId)
    const wages = await repositories.wages.getShiftWages(shiftId)
    const materials = await repositories.materials.getShiftMaterials(shiftId)
    const expenses = await repositories.expenses.getShiftExpenses(shiftId)
    const photosCount = await repositories.holdPhotos.countTotalByShift(shiftId)

    const brigadierSalary = toNumberOrNull(wages?.brigadier_amount)
    const deputySalary = crew?.deputy ? toNumberOrNull(wages?.deputy_amount) : null
    const driverSalary = crew?.driver ? toNumberOrNull(wages?.driver_amount) : null
    const workersTotal = toNumberOrNull(wages?.workers_total)

    const salaryParts = [brigadierSalary, deputySalary, driverSalary, workersTotal]
    const totalSalary = salaryParts.reduce((acc, value) => acc + (value ?? 0), 0)

    const otherExpenses = toNumberOrNull(expenses?.other_amount)
    const expenseParts = [
      toNumberOrNull(expenses?.food_amount),
      toNumberOrNull(expenses?.materials_amount),
      toNumberOrNull(expenses?.taxi_amount),
      otherExpenses,
    ]
    const expensesTotal = toNumberOrNull(expenses?.total_expenses)
    const monetaryExpenses =
      expensesTotal != null
        ? expensesTotal
        : expenseParts.reduce((acc, value) => acc + (value ?? 0), 0)

    const totalExpenses = totalSalary + (monetaryExpenses ?? 0)

    const message = buildShiftCompletionMessage({
      shiftNumber: shift.id,
      vesselName: shift.ship_name,
      startDate: formatDateHuman(shift.date),
      endDate: formatDateHuman(new Date()),
      brigadierName,
      holdsCount: shift.holds_count,
      photosCount,
      brigadierSalary,
      deputySalary,
      driverSalary,
      totalSalary,
      materials,
      otherExpenses,
      totalExpenses,
    })

    logger?.info('Shift completion report prepared', { shiftId, chatId: targetChatId })

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

function buildShiftCompletionMessage({
  shiftNumber,
  vesselName,
  startDate,
  endDate,
  brigadierName,
  holdsCount,
  photosCount,
  brigadierSalary,
  deputySalary,
  driverSalary,
  totalSalary,
  materials,
  otherExpenses,
  totalExpenses,
}) {
  const lines = []
  lines.push(`✅ Смена №${shiftNumber} завершена`)
  lines.push('')
  lines.push(`Судно: ${vesselName ?? '—'}`)
  lines.push('')
  lines.push(`Дата начала смены: ${startDate}`)
  lines.push(`Дата завершения смены: ${endDate}`)
  lines.push('')
  lines.push(`Бригадир: ${brigadierName ?? '—'}`)
  lines.push('')
  lines.push(SEPARATOR)
  lines.push('')
  lines.push('📦 Производственные данные')
  lines.push(`• Трюмов обработано: ${formatNumericValue(holdsCount)}`)
  lines.push(`• Фото загружено: ${formatNumericValue(photosCount)}`)
  lines.push('')
  lines.push(SEPARATOR)
  lines.push('')
  lines.push('💰 Заработная плата')
  lines.push(`• Бригадир: ${formatCurrency(brigadierSalary)}`)

  if (deputySalary != null) {
    lines.push(`• Заместитель: ${formatCurrency(deputySalary)}`)
  }

  if (driverSalary != null) {
    lines.push(`• Водитель: ${formatCurrency(driverSalary)}`)
  }

  lines.push(`• Итого зарплата: ${formatCurrency(totalSalary)}`)
  lines.push('')

  const materialLines = buildMaterialsBlock(materials)

  if (materialLines.length) {
    lines.push(SEPARATOR)
    lines.push('')
    lines.push('🧾 Материалы')
    lines.push(...materialLines)
    lines.push('')
  }

  if (otherExpenses != null) {
    lines.push(SEPARATOR)
    lines.push('')
    lines.push('💸 Прочие расходы')
    lines.push(`• ${formatCurrency(otherExpenses)}`)
    lines.push('')
  }

  lines.push(SEPARATOR)
  lines.push('')
  lines.push('📊 Итого по смене')
  lines.push(`• Общие расходы: ${formatCurrency(totalExpenses)}`)

  return lines.join('\n')
}

function buildMaterialsBlock(materials) {
  if (!materials) {
    return []
  }

  const items = [
    { label: '• Рулоны ПВД 3 м', value: materials.pvd_3m_used },
    { label: '• Рулоны ПВД 6 м', value: materials.pvd_6m_used },
    { label: '• Рулоны ПВД 12 м', value: materials.pvd_12m_used },
    { label: '• Рулоны ПВД 14 м', value: materials.pvd_14m_used },
    { label: '• Трубки ПВХ', value: materials.pvh_tubes_used },
    { label: '• Клейкая лента', value: materials.tape_used },
  ]

  const filledItems = items.filter((item) => item.value != null)

  if (!filledItems.length) {
    return []
  }

  return filledItems.map((item) => `${item.label}: ${formatNumericValue(item.value, true)}`)
}

function formatCurrency(value) {
  if (value == null) {
    return '—'
  }

  return `${value} ₽`
}

function formatNumericValue(value, allowZero = false) {
  if (value == null) {
    return allowZero ? 0 : '—'
  }

  return value
}

function toNumberOrNull(value) {
  if (value == null) {
    return null
  }

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

module.exports = { createShiftReportService, buildShiftCompletionMessage, DEFAULT_REPORT_CHAT_ID }
