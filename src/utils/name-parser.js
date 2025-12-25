function toTitleCasePart(part) {
  const lower = part.toLocaleLowerCase('ru-RU')
  return lower.charAt(0).toLocaleUpperCase('ru-RU') + lower.slice(1)
}

function normalizePart(part) {
  return part
    .split('-')
    .filter(Boolean)
    .map((segment) => toTitleCasePart(segment))
    .join('-')
}

function parseFullName(input) {
  const raw = (input ?? '').trim()
  const tokens = raw.split(/\s+/).filter(Boolean)

  if (tokens.length !== 2) {
    return { ok: false, errorMessage: 'Введите ровно два слова: Фамилию и Имя через пробел' }
  }

  const surnameRaw = tokens[0]
  const nameRaw = tokens[1]

  const validPart = /^[\p{L}]+(?:[-'][\p{L}]+)*$/u

  if (!validPart.test(surnameRaw) || !validPart.test(nameRaw)) {
    return { ok: false, errorMessage: 'Только буквы. Формат: Фамилия Имя. Пример: Иванов Иван' }
  }

  const surname = normalizePart(surnameRaw)
  const name = normalizePart(nameRaw)
  const normalizedFullName = `${surname} ${name}`

  return { ok: true, surname, name, normalizedFullName }
}

module.exports = { parseFullName }
