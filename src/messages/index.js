// Все тексты бота в одном месте
const messages = {
  welcomeExistingUser: (name) =>
    `Добро пожаловать${name ? `, ${name}` : ''}! Рады видеть вас снова.`,
  welcomeNewUser: 'Вы ещё не зарегистрированы. Сейчас начнём регистрацию.',
  systemError: 'Произошла системная ошибка. Попробуйте ещё раз позже.',
  registrationRedirect: 'Переходим к регистрации. Последовательность шагов появится здесь позже.', // TODO: Block 1
  mainPanelRedirect: 'Открываю главную панель. Основные функции появятся здесь позже.', // TODO: Block 2
}

module.exports = messages
