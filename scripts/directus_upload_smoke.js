#!/usr/bin/env node
// Простой смоук-тест загрузки файла в Directus через сервис бота

const fs = require('fs')
const path = require('path')
const { createDirectusUploadService } = require('../src/services/directusUploadService')

async function main() {
  const directusUrl = process.env.DIRECTUS_URL
  const directusToken = process.env.DIRECTUS_TOKEN
  const directusFolderId = process.env.DIRECTUS_UPLOAD_FOLDER_ID

  if (!directusUrl || !directusToken || !directusFolderId) {
    throw new Error('Нужно указать DIRECTUS_URL, DIRECTUS_TOKEN и DIRECTUS_UPLOAD_FOLDER_ID')
  }

  const filePath = process.argv[2]

  if (!filePath) {
    throw new Error('Укажите путь к локальному файлу JPG как первый аргумент')
  }

  const buffer = await fs.promises.readFile(filePath)
  const filename = path.basename(filePath)

  const uploader = createDirectusUploadService({
    baseUrl: directusUrl,
    token: directusToken,
    logger: console,
  })

  const uploaded = await uploader.uploadFile({
    buffer,
    filename,
    mimeType: 'image/jpeg',
    folderId: directusFolderId,
    title: `Smoke upload ${new Date().toISOString()}`,
  })

  await uploader.patchFileMeta(uploaded.id, {
    folder: directusFolderId,
    title: `Smoke upload ${new Date().toISOString()}`,
    filename_download: filename,
  })

  const diskPath = `/assets/${uploaded.id}`
  const publicUrl = `${directusUrl}${diskPath}`

  console.log('Загрузка завершена', { id: uploaded.id, publicUrl })
}

main().catch((error) => {
  console.error('Смоук-тест Directus не прошёл', error)
  process.exit(1)
})
