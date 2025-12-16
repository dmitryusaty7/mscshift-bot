const { isValidName } = require('../src/scenes/register.scene')

describe('isValidName', () => {
  test('возвращает true для корректных имён', () => {
    expect(isValidName('Иван')).toBe(true)
    expect(isValidName('Пётр')).toBe(true)
    expect(isValidName('Ёлка')).toBe(true)
    expect(isValidName('Ан')).toBe(true)
  })

  test('возвращает false для коротких или неверных значений', () => {
    expect(isValidName('иvan')).toBe(false)
    expect(isValidName('Iv')).toBe(false)
    expect(isValidName('А')).toBe(false)
    expect(isValidName('Ан-на')).toBe(false)
  })

  test('возвращает false для пустых значений', () => {
    expect(isValidName('')).toBe(false)
    expect(isValidName(null)).toBe(false)
    expect(isValidName(undefined)).toBe(false)
  })
})
