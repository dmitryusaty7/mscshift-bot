/**
 * MSCShift Bot — MVP core
 * - Telegram Long Polling
 * - Upload photo -> Directus (/files)
 * - Save metadata -> Postgres (hold_photos) WITHOUT linking to shift/hold yet
 */

require('dotenv').config()

const fs = require('fs')
const path = require('path')
const TelegramBot = require('node-telegram-bot-api')
const { Pool } = require('pg')
const FormData = require('form-data')

// ===== ENV CHECK =====
function requireEnv(name) {
  const v = process.env[name]
  if (!v || String(v).trim() === '') {
    console.error(`❌ ${name} is not set`)
    process.exit(1)
  }
  return v
}

const TELEGRAM_BOT_TOKEN = requireEnv('TELEGRAM_BOT_TOKEN')

const PG_HOST = requireEnv('PG_HOST')
const PG_PORT = requireEnv('PG_PORT')
const PG_DATABASE = requireEnv('PG_DATABASE')
const PG_USER = requireEnv('PG_USER')
const PG_PASSWORD = requireEnv('PG_PASSWORD')

const DIRECTUS_URL = requireEnv('DIRECTUS_URL').replace(/\/$/, '')
const DIRECTUS_TOKEN = requireEnv('DIRECTUS_TOKEN')

// Куда бот складывает временный файл, который потом улетит в Directus
const BOT_UPLOAD_DIR = requireEnv('BOT_UPLOAD_DIR')

// Просто логируем, чтобы не путаться. Сам Directus хранит у себя в uploads автоматически.
requireEnv('DIRECTUS_UPLOADS_DIR')

// ===== INIT: Postgres =====
const pool = new Pool({
  host: PG_HOST,
  port: Number(PG_PORT),
  database: PG_DATABASE,
  user: PG_USER,
  password: PG_PASSWORD,
})

async function testDbConnection() {
  const res = await pool.query('SELECT 1 AS ok')
  console.log('✅ PostgreSQL connected:', res.rows[0])
}

// ===== INIT: Telegram =====
const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true })
console.log('🚀 MSCShift Bot started')
console.log('✅ Bot upload dir:', BOT_UPLOAD_DIR)
console.log('ℹ️ Directus URL:', DIRECTUS_URL)

// ===== Directus upload =====
async function uploadFileToDirectus(localFilePath) {
  const url = `${DIRECTUS_URL}/files`

  const form = new FormData()
  form.append('file', fs.createReadStream(localFilePath))

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${DIRECTUS_TOKEN}`,
      ...form.getHeaders(),
    },
    body: form,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Directus /files failed: ${res.status} ${text}`)
  }

  const json = await res.json()
  const id = json?.data?.id
  if (!id) throw new Error('Directus /files: no file id in response')

  const assetsUrl = `${DIRECTUS_URL}/assets/${id}`
  return { id, assetsUrl, raw: json }
}

// ===== Commands =====
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id
  await bot.sendMessage(
    chatId,
    '👋 MSCShift Bot is online\n\nОтправь фото — я загружу его в Directus и сохраню запись в БД',
  )
})

// ===== Photo handler =====
bot.on('photo', async (msg) => {
  const chatId = msg.chat.id

  try {
    // берём самое большое фото
    const photo = msg.photo?.[msg.photo.length - 1]
    if (!photo?.file_id) return

    // 1) скачиваем во временную папку
    // node-telegram-bot-api сам создаёт файл, вернёт путь
    const localPath = await bot.downloadFile(photo.file_id, BOT_UPLOAD_DIR)
    console.log(`📸 photo downloaded: ${localPath}`)

    // 2) грузим в Directus (это то, из-за чего появится в UI Directus)
    const { id: directusFileId, assetsUrl } = await uploadFileToDirectus(localPath)
    console.log(`✅ directus file id: ${directusFileId}`)
    console.log(`🔗 assets url: ${assetsUrl}`)

    // 3) пишем в БД (без привязки к смене)
    // disk_path: пусть пока будет путь временного файла (для трассировки)
    // disk_public_url: кладём assets URL
    await pool.query(
      `
      INSERT INTO hold_photos (telegram_file_id, disk_path, disk_public_url, directus_file_id)
      VALUES ($1, $2, $3, $4)
      `,
      [photo.file_id, localPath, assetsUrl, directusFileId],
    )

    // 4) чистим временный файл (чтобы /uploads/bot не раздувался)
    try {
      fs.unlinkSync(localPath)
      console.log(`🧹 temp file removed: ${localPath}`)
    } catch (e) {
      console.warn(`⚠️ cannot remove temp file: ${localPath}:`, e.message)
    }

    // 5) ответ пользователю
    await bot.sendMessage(
      chatId,
      `✅ фото загружено в Directus\n${assetsUrl}\n\nDirectus file id: ${directusFileId}`,
    )
  } catch (err) {
    console.error('❌ photo handler failed:', err)
    await bot.sendMessage(chatId, `❌ ошибка обработки фото: ${err.message}`)
  }
})

// ===== Errors =====
bot.on('polling_error', (error) => {
  console.error('Polling error:', error.message)
})

process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err)
})

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason)
})

// ===== Bootstrap =====
;(async () => {
  try {
    await testDbConnection()
  } catch (err) {
    console.error('❌ Database connection failed:', err.message)
    process.exit(1)
  }
})()
