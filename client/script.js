// импортируем необходимые модули
import 'https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js'

// создаем закрытый скоуп переменных
;(function() {
  document.querySelectorAll('.page-form').forEach(e => {
    // при попытке отправить любую из форм
    e.addEventListener('submit', async event => {
      event.preventDefault() // блокируем обычную обработку события
      const form = event.target
      const buttons = form.querySelectorAll('.form-buttons button')
      const submit = form.querySelector('[type="submit"]')
      buttons.forEach(e => e.setAttribute('disabled', '')) // отключаем кнопки
      // включаем на кнопке спиннер
      submit.querySelector('.btn-label').classList.add('hidden')
      submit.querySelector('.spinner').classList.remove('hidden')
      const request = await fetch(form.action, { // идем за данными в режиме ajax
        method: form.method,
        body: new URLSearchParams([...new FormData(form).entries()])
      })
      if (request.status !== 200) { // запрос провалился
        // todo: сделать вывод ошибки на клиент, а не только в консоль
        buttons.forEach(e => e.removeAttribute('disabled', ''))
        submit.querySelector('.btn-label').classList.remove('hidden')
        submit.querySelector('.spinner').classList.add('hidden')
        console.log('%can error occurred', 'color: red; font-size: 2em')
        return
      }
      // если все хорошо, уходим в чат
      // todo: запретить доступ на страницу, если вход уже выполнен
      location.href = '/chat'
    })
  })
})();
