;(function() {
  document.querySelectorAll('.page-form').forEach(e => {
    e.addEventListener('submit', async event => {
      event.preventDefault()
      const form = event.target
      const buttons = form.querySelectorAll('.form-buttons button')
      const submit = form.querySelector('[type="submit"]')
      buttons.forEach(e => e.setAttribute('disabled', ''))
      submit.querySelector('.btn-label').classList.add('hidden')
      submit.querySelector('.spinner').classList.remove('hidden')
      const request = await fetch(form.action, {
        method: form.method,
        body: new URLSearchParams([...new FormData(form).entries()])
      })
      if (request.status !== 200) {
        buttons.forEach(e => e.removeAttribute('disabled', ''))
        submit.querySelector('.btn-label').classList.remove('hidden')
        submit.querySelector('.spinner').classList.add('hidden')
        console.log('%can error occurred', 'color: red; font-size: 2em')
        return
      }
      location.href = '/chat'
    })
  })
})();
