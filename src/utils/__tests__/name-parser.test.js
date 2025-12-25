const { parseFullName } = require('../name-parser')

describe('parseFullName', () => {
  test('принимает базовый ввод и нормализует регистр', () => {
    const result = parseFullName('иванов иван')
    expect(result).toEqual({
      ok: true,
      surname: 'Иванов',
      name: 'Иван',
      normalizedFullName: 'Иванов Иван',
    })
  })

  test('поддерживает дефисы и лишние пробелы', () => {
    const result = parseFullName('  Иванова-ПЕТРОВА   анна-мАрия   ')
    expect(result.normalizedFullName).toBe('Иванова-Петрова Анна-Мария')
  })

  test('отклоняет одно слово', () => {
    const result = parseFullName('Иванов')
    expect(result.ok).toBe(false)
  })

  test('отклоняет цифры и символы', () => {
    const result = parseFullName('Иванов1 Иван!')
    expect(result.ok).toBe(false)
  })
})
