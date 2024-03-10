// импортируем необходимые модули
import 'https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js'

// создаем закрытый скоуп переменных
;(function() {
  const theme = (function setTheme() { // ставим тему сайта (бутстрап сам не умеет)
    const _ = document.documentElement
    const theme = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
    if (_.getAttribute('data-bs-theme') === theme) return
    _.setAttribute('data-bs-theme', theme)
    return theme
  })();

  let error_timeout

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
      }).catch(() => { // запрос не прошел
        enableForm()
        showError('Ошибка сети. Проверьте поключение к интернету!')
      })
      if (typeof request === 'undefined') return
      // запрос прошел, но провалился
      if (request.status !== 200) {
        enableForm()
        showError((await request.json())?.message || 'Неизвестная ошибка!')
        return
      }
      // если все хорошо, уходим в чат
      location.href = '/chat'

      /**
       * Разблокирует форму после выполнения запроса
       */
      function enableForm() {
        buttons.forEach(e => e.removeAttribute('disabled', ''))
        submit.querySelector('.btn-label').classList.remove('hidden')
        submit.querySelector('.spinner').classList.add('hidden')
      }

      /**
       * Показывает ошибку
       * @param {string} text текст ошибки
       */
      function showError(text) {
        const _ = document.querySelector('.error')
        const collapse = bootstrap.Collapse.getOrCreateInstance(_)
        _.innerText = text
        collapse.show()

        clearTimeout(error_timeout)
        error_timeout = setTimeout(() => collapse.hide(), 5000)
      }
    })
  })
})();
