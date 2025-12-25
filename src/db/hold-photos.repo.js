// Репозиторий для работы с таблицей hold_photos
function createHoldPhotosRepo(pool, logger) {
  // TODO: Review for merge — флаг, чтобы дамп схемы выполнялся один раз
  let schemaLogged = false

  return {
    addPhoto,
    findLastPhoto,
    deletePhotoById,
    countByHold,
    countTotalByShift,
    getShiftPhotoStats,
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

  // TODO: Review for merge — получаем последнюю фотографию трюма
  async function findLastPhoto({ shiftId, holdId }) {
    try {
      const selectQuery = `
        SELECT id, disk_public_url, disk_path
        FROM hold_photos
        WHERE shift_id = $1 AND hold_id = $2
        ORDER BY created_at DESC
        LIMIT 1
      `

      const { rows } = await pool.query(selectQuery, [shiftId, holdId])
      return rows[0] || null
    } catch (error) {
      await handleDbError({ error, operation: 'findLastPhoto', shiftId, holdId })
      throw error
    }
  }

  // TODO: Review for merge — удаляем фото по идентификатору
  async function deletePhotoById(id) {
    if (!id) {
      return null
    }

    try {
      const deleteQuery = 'DELETE FROM hold_photos WHERE id = $1 RETURNING id'
      const { rows } = await pool.query(deleteQuery, [id])
      return rows[0] || null
    } catch (error) {
      await handleDbError({ error, operation: 'deletePhotoById', holdPhotoId: id })
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

  // Сводка по трюмам и фото для смены
  async function getShiftPhotoStats(shiftId) {
    try {
      const { rows } = await pool.query(
        `
          SELECT
            COUNT(DISTINCT hold_id)::int AS holds_count,
            COUNT(*)::int AS photos_count,
            COUNT(*) FILTER (WHERE disk_public_url IS NOT NULL)::int AS directus_photos_count
          FROM hold_photos
          WHERE shift_id = $1
        `,
        [shiftId],
      )

      const stats = rows[0] || {}

      return {
        holdsCount: Number.parseInt(stats.holds_count ?? '0', 10),
        photosCount: Number.parseInt(stats.photos_count ?? '0', 10),
        directusPhotosCount: Number.parseInt(stats.directus_photos_count ?? '0', 10),
      }
    } catch (error) {
      await handleDbError({ error, operation: 'getShiftPhotoStats', shiftId })
      throw error
    }
  }

  // TODO: Review for merge — единообразный дамп схемы для отладки в продакшене
  async function handleDbError({ error, operation, shiftId, holdId, holdPhotoId }) {
    if (logger) {
      logger.error('Сбой работы с таблицей hold_photos', {
        operation,
        shiftId,
        holdId,
        holdPhotoId,
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
