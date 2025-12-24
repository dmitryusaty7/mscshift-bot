// Репозиторий для хранения идентификаторов папок Directus по трюмам
function createHoldDirectusFoldersRepo(pool, logger) {
  return {
    findByHold,
    saveFolderId,
    clearFolderId,
  }

  // Возвращает сохранённый идентификатор папки для указанного трюма смены
  async function findByHold({ shiftId, holdId }) {
    const query = `
      SELECT shift_id, hold_id, directus_folder_id, created_at
      FROM hold_directus_folders
      WHERE shift_id = $1 AND hold_id = $2
      LIMIT 1
    `

    const { rows } = await pool.query(query, [shiftId, holdId])
    return rows[0] || null
  }

  // Сохраняем или обновляем идентификатор папки Directus
  async function saveFolderId({ shiftId, holdId, folderId }) {
    const query = `
      INSERT INTO hold_directus_folders (shift_id, hold_id, directus_folder_id)
      VALUES ($1, $2, $3)
      ON CONFLICT (shift_id, hold_id)
      DO UPDATE SET directus_folder_id = EXCLUDED.directus_folder_id
      RETURNING shift_id, hold_id, directus_folder_id
    `

    const { rows } = await pool.query(query, [shiftId, holdId, folderId])

    if (logger) {
      logger.info('Идентификатор папки Directus сохранён для трюма', {
        shiftId,
        holdId,
        folderId,
      })
    }

    return rows[0] || null
  }

  // Очищаем сохранённый идентификатор папки Directus
  async function clearFolderId({ shiftId, holdId }) {
    const query = 'DELETE FROM hold_directus_folders WHERE shift_id = $1 AND hold_id = $2'

    await pool.query(query, [shiftId, holdId])

    if (logger) {
      logger.info('Ссылка на папку Directus очищена для трюма', { shiftId, holdId })
    }
  }
}

module.exports = { createHoldDirectusFoldersRepo }
