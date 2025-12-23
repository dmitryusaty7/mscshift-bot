require('dotenv').config()
const fs = require('fs')
const path = require('path')
const { createDirectusUploadService } = require('../src/services/directusUploadService')

function createLogger() {
  return {
    info: console.log,
    warn: console.warn,
    error: console.error,
  }
}

async function main() {
  const filePath = process.argv[2]

  if (!filePath) {
    console.error('Укажите путь к файлу как аргумент: node scripts/directus_upload_smoke.js ./sample.jpg')
    process.exit(1)
  }

  const { DIRECTUS_URL, DIRECTUS_TOKEN, DIRECTUS_UPLOAD_FOLDER_ID } = process.env

  if (!DIRECTUS_URL || !DIRECTUS_TOKEN) {
    console.error('Не заданы DIRECTUS_URL или DIRECTUS_TOKEN')
    process.exit(1)
  }

  const absolutePath = path.resolve(filePath)
  const buffer = fs.readFileSync(absolutePath)

  const uploader = createDirectusUploadService({
    baseUrl: DIRECTUS_URL,
    token: DIRECTUS_TOKEN,
    logger: createLogger(),
  })

  const uploaded = await uploader.uploadFile({
    buffer,
    filename: path.basename(absolutePath),
    mimeType: 'image/jpeg',
    folderId: DIRECTUS_UPLOAD_FOLDER_ID,
  })

  console.log('Файл загружен, id:', uploaded.id)
}

main().catch((error) => {
  console.error('Smoke-загрузка завершилась ошибкой', error)
  process.exit(1)
})
