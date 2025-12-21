// Репозиторий для работы с таблицей hold_photos
function createHoldPhotosRepo(pool) {
  return {
    addPhoto,
    deleteLastPhoto,
    countByHold,
    countTotalByShift,
  }

  // TODO: Review for merge — сохраняем запись о фото трюма
  async function addPhoto({ shiftId, holdId, telegramFileId, diskPath, diskPublicUrl, directusFileId }) {
    const query = `
      INSERT INTO hold_photos (
        shift_id,
        hold_id,
        telegram_file_id,
        disk_path,
        disk_public_url,
        directus_file_id
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id
    `

    const { rows } = await pool.query(query, [
      shiftId,
      holdId,
      telegramFileId,
      diskPath,
      diskPublicUrl,
      directusFileId,
    ])

    return rows[0] || null
  }

  // TODO: Review for merge — удаляем последнюю фотографию трюма
  async function deleteLastPhoto({ shiftId, holdId }) {
    const selectQuery = `
      SELECT id, directus_file_id, disk_path
      FROM hold_photos
      WHERE shift_id = $1 AND hold_id = $2
      ORDER BY id DESC
      LIMIT 1
    `

    const { rows } = await pool.query(selectQuery, [shiftId, holdId])
    const lastPhoto = rows[0]

    if (!lastPhoto) {
      return null
    }

    await pool.query('DELETE FROM hold_photos WHERE id = $1', [lastPhoto.id])
    return lastPhoto
  }

  // TODO: Review for merge — считаем фото по трюму
  async function countByHold({ shiftId, holdId }) {
    const { rows } = await pool.query(
      'SELECT COUNT(*)::int AS total FROM hold_photos WHERE shift_id = $1 AND hold_id = $2',
      [shiftId, holdId],
    )

    return Number.parseInt(rows[0]?.total ?? '0', 10)
  }

  // TODO: Review for merge — считаем общее количество фото по смене
  async function countTotalByShift(shiftId) {
    const { rows } = await pool.query('SELECT COUNT(*)::int AS total FROM hold_photos WHERE shift_id = $1', [shiftId])
    return Number.parseInt(rows[0]?.total ?? '0', 10)
  }
}

module.exports = { createHoldPhotosRepo }
