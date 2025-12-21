// Репозиторий для работы с таблицей hold_photos
function createHoldPhotosRepo(pool, logger) {
  // TODO: Review for merge — флаг, чтобы дамп схемы выполнялся один раз
  let schemaLogged = false

  return {
    addPhoto,
    deleteLastPhoto,
    countByHold,
    countTotalByShift,
  }

  // TODO: Review for merge — сохраняем запись о фото трюма
  async function addPhoto({ shiftId, holdId, telegramFileId, diskPath, diskPublicUrl }) {
    try {
      const query = `
        INSERT INTO hold_photos (
          shift_id,
          hold_id,
          telegram_file_id,
          disk_path,
          disk_public_url
        )
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id
      `

      const { rows } = await pool.query(query, [
        shiftId,
        holdId,
        telegramFileId,
        diskPath,
        diskPublicUrl,
      ])

      return rows[0] || null
    } catch (error) {
      // TODO: Review for merge — подробный лог для выявления расхождений схемы
      await handleDbError({ error, operation: 'addPhoto', shiftId, holdId })
      throw error
    }
  }

  // TODO: Review for merge — удаляем последнюю фотографию трюма
  async function deleteLastPhoto({ shiftId, holdId }) {
    try {
      const deleteQuery = `
        DELETE FROM hold_photos
        WHERE id = (
          SELECT id
          FROM hold_photos
          WHERE shift_id = $1 AND hold_id = $2
          ORDER BY created_at DESC
          LIMIT 1
        )
        RETURNING id, disk_path
      `

      const { rows } = await pool.query(deleteQuery, [shiftId, holdId])
      return rows[0] || null
    } catch (error) {
      // TODO: Review for merge — логируем ошибку БД с подсказкой про патч
      await handleDbError({ error, operation: 'deleteLastPhoto', shiftId, holdId })
      throw error
    }
  }

  // TODO: Review for merge — считаем фото по трюму
  async function countByHold({ shiftId, holdId }) {
    try {
      const { rows } = await pool.query(
        'SELECT COUNT(*)::int AS total FROM hold_photos WHERE shift_id = $1 AND hold_id = $2',
        [shiftId, holdId],
      )

      return Number.parseInt(rows[0]?.total ?? '0', 10)
    } catch (error) {
      // TODO: Review for merge — логируем ошибку подсчёта фото
      await handleDbError({ error, operation: 'countByHold', shiftId, holdId })
      throw error
    }
  }

  // TODO: Review for merge — считаем общее количество фото по смене
  async function countTotalByShift(shiftId) {
    try {
      const { rows } = await pool.query('SELECT COUNT(*)::int AS total FROM hold_photos WHERE shift_id = $1', [shiftId])
      return Number.parseInt(rows[0]?.total ?? '0', 10)
    } catch (error) {
      // TODO: Review for merge — логируем ошибку подсчёта по смене
      await handleDbError({ error, operation: 'countTotalByShift', shiftId })
      throw error
    }
  }

  // TODO: Review for merge — единообразный дамп схемы для отладки в продакшене
  async function handleDbError({ error, operation, shiftId, holdId }) {
    if (logger) {
      logger.error('Сбой работы с таблицей hold_photos', {
        operation,
        shiftId,
        holdId,
        error: error.message,
        hint: 'Проверьте схему public.hold_photos и наличие колонок shift_id, hold_id, telegram_file_id, disk_path, disk_public_url, created_at',
      })
    }

    if (!logger || schemaLogged) {
      return
    }

    try {
      const { rows } = await pool.query(
        `SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='hold_photos' ORDER BY ordinal_position`,
      )

      schemaLogged = true
      // TODO: Review for merge — сохраняем полный дамп колонок, чтобы администратор применил патч
      logger.error('Текущие колонки public.hold_photos', { columns: rows })
    } catch (schemaError) {
      schemaLogged = true
      logger.error('Не удалось получить колонки public.hold_photos', { error: schemaError.message })
    }
  }
}

module.exports = { createHoldPhotosRepo }
