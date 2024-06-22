// импортируем необходимые файлы и модули для работы
import '../helpers/external/bootstrap/bundle.js' // бутстрап
import '../helpers/external/prism/script.js' // подсветка синтаксиса
import '../helpers/external/dompurify/script.js' // санитайзер для парсера
import { Marked } from '../helpers/external/marked/script.js' // парсер маркдауна
import * as Utils from './utils.js' // утилиты
import EmojiPanel from '../helpers/emoji-panel/script.js' // панель эмодзи
import './types.js' // типы

// самовызывающаяся функция для создания закрытого скоупа переменных в рантайме
(async function() {
  'use strict'
  const theme = (function setTheme() { // ставим тему сайта (бутстрап сам не умеет)
    const _ = document.documentElement
    const theme = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
    if (_.getAttribute('data-bs-theme') === theme) return
    _.setAttribute('data-bs-theme', theme)
    return theme
  })();

  ;[...document.querySelectorAll('[data-bs-tooltip]')].forEach(e => new bootstrap.Tooltip(e))

  ;(function checkDependencies() {
    const packages = ['Picker', 'Bootstrap', 'Marked', 'DOMPurify']
    const state = [
      typeof Picker, typeof bootstrap,
      typeof Marked, typeof DOMPurify
    ]
    const failed = state.findIndex(f => f === 'undefined')
    if (failed === -1) return
    document.innerHTML = `Не удалось загрузить библиотеку ${packages[failed]}. Повторите попытку позже.`
  })();

  // готовим парсер маркдауна и сочетания клавич
  const marked = new Marked()
  marked.use({
    extensions: [
      // этот фрагмент делает "вжух", и все картинки с html превращаются в тыкву
      { name: 'image', renderer(token) { return token.raw.replace(token.href, match => `<a href="${match}">${match}</a>`) } },
      { name: 'html', renderer(token) { return token.raw.replace(/[<>]/g, match => ({'<':'&lt;','>':'&gt;'}[match])) } },
      // рендерим упоминания
      {
        name: 'mention',
        level: 'inline',
        start(src) { return src.match(/(^|[ -\/:-@\[-`\{-~])@/)?.index },
        tokenizer(src, tokens) {
          const match = src.match(/^@\w+\b/)
          if (match) return {
            type: 'mention',
            raw: match[0],
            target: match[0].slice(1)
          }
        },
        renderer(token) {
          return `<span class="mention" data-target="${token.target}">${token.raw}</span>`
        }
      },
      // и ответы на сообщения
      {
        name: 'reply',
        level: 'block',
        start(src) { return src.match(/^->/?.index) },
        tokenizer(src, tokens) {
          const match = src.match(/^->\s*(\d+)(?:\n|$)/)
          if (match) return {
            type: 'reply',
            raw: match[0],
            target: match[1]
          }
        },
        renderer(token) {
          return `<div class="reply-link">В ответ на сообщение <a href="#" class="btn-link" type="button" data-target="${token.target}">#${token.target}</a>:</div>`
        }
      }
    ]
  })
  const MARKUP_BINDS = {
    KeyB: 'bold', KeyI: 'italic',
    KeyS: 'strike', KeyM: 'mono',
    KeyL: 'link', KeyK: 'code'
  }

  // получаем данные пользователя
  let self = JSON.parse(localStorage.getItem('self-data'))
  {
    const request = await fetch('/api/@me')
    const response = await request.json()
    self = response
    applyRights()
    localStorage.setItem('self-data', JSON.stringify(self))
  }
  document.querySelector('#self-avatar').src = `/avatars/${self.avatar}`

  // применяем нужный стиль блоков с подсветкой синтаксиса
  {
    const el = document.createElement('link')
    el.href = `../helpers/external/prism/style${theme === 'dark' ? '.dark' : ''}.css`
    el.type = 'text/css'
    el.rel = 'stylesheet'
    document.head.append(el)
  }

  // панель эмодзи
  const emoji_panel = new EmojiPanel('../helpers/emoji-panel/data.min.json')
  emoji_panel.onclick = emoji => {
    if (!document.querySelector('.channel.selected')) return
    const input = document.querySelector('#message-input')
    const sel_start = input.selectionStart
    const sel_end = input.selectionEnd
    const val = input.value
    const offset = emoji.length

    input.value = val.slice(0, sel_start) + emoji + val.slice(sel_end)
    input.focus()
    input.selectionStart = sel_start + offset
    input.selectionEnd = sel_end + offset
  }
  // панель будет всплывать при нажатии кнопки в бутстраповском поповере
  const emoji_panel_popover = new bootstrap.Popover(document.querySelector('#emojis'), {
    html: true,
    customClass: 'emoji-popover',
    placement: 'top',
    fallbackPlacements: ['bottom', 'left'],
    content: emoji_panel.wrp,
    trigger: 'manual'
  })
  document.querySelector('#emojis').addEventListener('click', (function(event) {
    const input = document.querySelector('#message-input')
    this.toggle()
    if (!this._isShown()) { // был закрыт, открывается
      event.currentTarget.addEventListener('shown.bs.popover', () => {
        emoji_panel.scroll_spy.refresh()
      }, { once: true })
    }
    input.focus()
  }).bind(emoji_panel_popover))

  // биндим кнопку со скрепкой на выбор файлов для прикрепления
  document.querySelector('#attach').addEventListener('click', () => {
    document.querySelector('#attachments-input').click()
  })

  // слушаем нажатия клавиш глобально
  document.body.addEventListener('keydown', event => {
    // шорткат на редактирование последнего сообщения
    if (event.code === 'ArrowUp') {
      const channel = document.querySelector('.channel.selected')
      if (!channel) return
      if (document.querySelector('#message-input').value) return
      const msg = [...document.querySelectorAll('.message.self')].at(-1)
      msg.querySelector('[data-act="edit"]').setAttribute('disabled', '')
      ws.send(JSON.stringify({
        event: 'RAW_MESSAGE',
        message: +msg.getAttribute('data-id')
      }))
    }

    // отмена редактирования и/или закрытие канала по нажатию на эскейп
    if (event.code === 'Escape') {
      const input = document.querySelector('#message-input')
      if (input.hasAttribute('data-edit-id')) {
        const msg = document.querySelector(`.message[data-id="${input.getAttribute('data-edit-id')}"]`)
        msg.classList.remove('editing')
        input.value = ''
        input.removeAttribute('data-edit-id')
        return
      }

      const channel = document.querySelector('.channel.selected')
      if (!channel) return
      channel.classList.remove('selected')
      document.querySelectorAll('.contents-piece').forEach(e => e.classList.toggle('hidden'))
    }
  })
  // здесь к клавиатуре нужен особый подход
  document.querySelector('#message-input').addEventListener('keydown', event => {
    // позволяем ставить табы
    if (event.code === 'Tab') {
      event.preventDefault()
      event.currentTarget.value += '\t'
    }
    // активируем кейбинды для быстрого форматирования
    if ((event.metaKey || event.ctrlKey) && MARKUP_BINDS[event.code]) {
      event.preventDefault()
      addMarkup(MARKUP_BINDS[event.code])
    }
  })

  // обработчик drag&drop
  /** @type {Map<number, {id: string, filename: string}>} */ const ready_files = new Map()
  /** @type {Map<number, FileList>} */ const queued_files = new Map()
  {
    const cont = document.querySelector('.contents')
    document.body.addEventListeners('dragenter dragover dragleave drop', Utils.preventDefaults)
    cont.addEventListeners('dragenter dragover dragleave drop', Utils.preventDefaults)
    cont.addEventListener('dragenter', () => {
      if (!checkAvailability()) return
      cont.classList.add('dropping')
    })
    cont.addEventListeners('dragleave drop', e => {
      if (!checkAvailability()) return
      if (!e.target.className.startsWith('contents')) return
      cont.classList.remove('dropping')
    })
    cont.addEventListeners('dragend drop', handleFiles)
    document.querySelector('#attachments-input').addEventListener('change', handleFiles)

    function checkAvailability() {
      return document.querySelector('.channel.selected') !== null &&
        !document.querySelector('#message-input').hasAttribute('data-edit-id')
    }
    function encodeFile(file) {
      let code = 0
      for (let i = 0; i < file.name.length; i++) {
        code += file.name.codePointAt(i) ^ i
      }
      code *= file.size
      code ^= file.lastModified
      console.log(code)
      return code
    }
    function checkFile(file) {
      const allowed = [/^image\//, /^application\//, /^text\//]
      if (file.size > 10 * 2 ** 20) return 1
      for (const pattern of allowed) {
        if (pattern.test(file.type)) return 0
      }
      return 2
    }
    function getFileSize(bytes) {
      const formatter = new Intl.NumberFormat('ru', { maximumFractionDigits: 1 })
      if (bytes >= 2 ** 20) return `${formatter.format(bytes / 2 ** 20)} МиБ`
      else if (bytes >= 2 ** 10) return `${formatter.format(bytes / 2 ** 10)} КиБ`
      else return `${formatter.format(bytes)} Б`
    }
    function getFileIcon(mime) {
      let name = 'bi-file-earmark-'
      if (mime.match(/(spread)?sheet$/)) name += 'spreadsheet'
      else if (mime.match(/presentation$/)) name += 'slides'
      else if (mime.match(/(document|text)$/)) name += 'richtext'
      else if (mime.match(/(gzip|tar|rar|zip|compressed)$/)) name += 'zip'
      else if (mime === 'application/pdf') name += 'pdf'
      else if (mime === 'text/plain') name += 'text'
      else if (mime.match(/^image\//)) name += 'image'
      else if (mime.match(/^(application|text)\//)) name += 'code'
      else name += 'binary'
      return name
    }
    function drawFilesList(files) {
      for (const file of files) {
        const test = checkFile(file)
        const code = encodeFile(file)
        if (queued_files.has(code)) continue
        if (test > 0) continue
        queued_files.set(code, file)

        const tem = document.querySelector('#tem-attachment').cloneNode(true).content
        const cont = tem.querySelector('.ag-entry')
        cont.setAttribute('data-code', code)
        tem.querySelector('.ag-entry__preview svg').innerHTML = `<use href="#${getFileIcon(file.type)}"></use>`
        tem.querySelector('.ag-entry__info-title').innerText = getFileName(file.name)
        tem.querySelector('.ag-entry__info-size').innerText = `(${getFileSize(file.size)})`
        tem.querySelector('.ag-entry__action-status').innerText = 'В очереди'
        tem.querySelector('.ag-entry__action-delete').addEventListener('click', () => {
          if (queued_files.has(code)) queued_files.delete(code)
          if (ready_files.has(code)) {
            fetch('/api/attach', {
              method: 'delete',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ id: ready_files.get(code).id }) 
            })
            ready_files.delete(code)
          }
          cont.remove()
        })
        document.querySelector('.attachments-gallery').append(tem)
      }
      Utils.scrollToBottom('.attachments-gallery')
    }
    async function uploadFiles() {
      const btn = document.querySelector('#message-send')
      btn.setAttribute('disabled', '')
      for (const [code, file] of queued_files) {
        const entry = document.querySelector(`.ag-entry[data-code="${code}"]`)
        const status = entry.querySelector('.ag-entry__action-status')
        if (!entry) continue

        const xhr = new XMLHttpRequest()
        const fd = new FormData()
        fd.append('file', file)
        xhr.open('post', '/api/attach')
        xhr.upload.addEventListener('loadstart', () => {
          status.innerText = `Подготовка`
        })
        xhr.upload.addEventListener('progress', ({ loaded, total, lengthComputable }) => {
          status.innerText = `Загрузка ${lengthComputable ? `(${Math.floor(loaded / total * 100)}%)` : ''}`
        })
        xhr.send(fd)
        await new Promise(res => {
          xhr.addEventListener('load', () => {
            const { id, file_name } = JSON.parse(xhr.response)
            status.innerText = 'Готово'
            entry.querySelector('.ag-entry__info-title').innerText = getFileName(file_name)
            entry.setAttribute('data-id', id)
            queued_files.delete(code)
            ready_files.set(code, { id, filename: file_name })
            res()
          })
        })
      }
      btn.removeAttribute('disabled')
    }

    async function handleFiles(event) {
      if (!checkAvailability()) return
      const files = event instanceof DragEvent ? event.dataTransfer.files : event.target.files
      drawFilesList(files)
      uploadFiles()
    }
  }

  // обновляем счетчики минут там, где это необходимо
  setInterval(function updateTimeago() {
    document.querySelectorAll('.timeago[datetime]').forEach(element => {
      const now = Date.now()
      const ms = new Date(element.dateTime).getTime()
      element.innerText = isNaN(ms) ? '—' : Utils.timeago(now - ms)
    })
  }, 10000)

  // открываем соединение по вебсокету
  class WSConnection {
    ws
    #PATH = `wss://${location.host}/ws`
    constructor () {
      this.ws = new WebSocket(this.#PATH)
      this.ws.addEventListener('open', this.#handleOpen)
    }

    #handleOpen() {
      console.log('Socket is online')
      ws.send(JSON.stringify({
        event: 'HANDSHAKE',
        id: self.id,
        ticket: self.ticket
      }))
    }
  }
  const ws = new WebSocket(`wss://${location.host}/ws`)
  ws.onopen = () => {
    // аутентифицируемся
    console.log('Socket is online')
    ws.send(JSON.stringify({
      event: 'HANDSHAKE',
      id: self.id,
      ticket: self.ticket
    }))

    document.querySelector('button[data-bs-target="#modal-new-channel"]')?.removeAttribute('disabled')
    document.querySelector('button[data-bs-target="#modal-new-dm"]')?.removeAttribute('disabled')

    // обработка всех событий
    ws.onmessage = event => {
      const data = JSON.parse(event.data) // парсим данные от сервера
      switch (data.event) { // обрабатываем события по их названию
        case 'FEED': { // оформление списка каналов
          buildChannelList(data.feed)
          break
        }
        case 'CHANNEL': { // вход в канал; показ последних сообщений
          if (!data.messages.length) { // если канал пустой
            const wrp = document.querySelector('.messages-wrapper')
            const badge = document.createElement('div')
            badge.className = 'empty-channel-badge badge bg-secondary'
            badge.innerText = 'В этом канале нет сообщений...'
            wrp.querySelector('.spinner').remove()
            wrp.append(badge)
          }
          buildMessagesList(data.messages)
          Utils.scrollToBottom('.contents-main')

          const current = document.querySelector('.channel.selected')
          if (typeof current !== null) {
            current.querySelector('.badge').innerText = ''
            ws.send(JSON.stringify({
              event: 'ACKNOWLEDGEMENT',
              channel: current.getAttribute('data-id')
            }))
          }
          break
        }
        case 'MESSAGE': { // подтверждение отправки своего сообщения
          const msg = document.querySelector(`.message[data-ticket="${data.ticket}"]`)
          msg.classList.remove('pending')
          msg.setAttribute('data-id', data.id)
          msg.removeAttribute('data-ticket')

          const channel = document.querySelector(`.channel[data-id="${data.channel}"]`)
          if (channel) { // обновляем миниатюру
            document.querySelector('.channels').prepend(channel)
            channel.setAttribute('data-msg-id', data.id)
            channel.querySelector('.timeago').dateTime = data.created_at
            channel.querySelector('.timeago').innerText = 'сейчас'
            channel.querySelector('.last-author').innerText = self.name
            channel.querySelector('.last-msg').innerHTML = parseMarkup(data.contents, true)
          }

          ws.send(JSON.stringify({
            event: 'ACKNOWLEDGEMENT',
            channel: data.channel
          }))
          break
        }
        case 'RAW_MESSAGE': { // код выбранного сообщения (для редактирования)
          const input = document.querySelector('#message-input')
          input.value = data.contents
          input.focus()
          input.setAttribute('data-edit-id', data.id)
          document.querySelector(`.message[data-id="${data.id}"]`).classList.add('editing')
          break
        }
        case 'PREVIEW_MESSAGE': {
          const modal = document.querySelector('#modal-message')
          const bs_modal = bootstrap.Modal.getOrCreateInstance(modal)
          const body = modal.querySelector('.modal-body')
          const msg = makeMessage(data)
          msg.classList.add('preview')
          msg.querySelector('.message-manage').remove()
          body.innerHTML = ''
          body.append(msg)
          bs_modal.show()
          break
        }
        case 'NEW_MESSAGE': { // новое чужое сообщение
          const channel = document.querySelector(`.channel[data-id="${data.channel}"]`)
          if (channel) { // обновляем миниатюру канала
            const badge = channel.querySelector('.badge')
            document.querySelector('.channels').prepend(channel)
            badge.innerText = (parseInt(badge.innerText) || 0) + 1
            channel.setAttribute('data-msg-id', data.id)
            channel.querySelector('.timeago').dateTime = data.created_at
            channel.querySelector('.timeago').innerText = 'сейчас'
            channel.querySelector('.last-author').innerText = data.name
            channel.querySelector('.last-msg').innerHTML = parseMarkup(data.contents, true)
          }
          // канал открыт
          if (channel.classList.contains('selected')) {
            const wrp = document.querySelector('.messages-wrapper')
            if (!document.querySelectorAll('.message').length) // это первое сообщение
              wrp.querySelector('.badge').remove()
            wrp.append(makeMessage(data))
            channel.querySelector('.badge').innerText = ''
            Utils.scrollToBottom('.contents-main')
          }
          break
        }
        case 'DELETE': { // удаление сообщения
          if (data.type !== 'MESSAGE') return // предполагается, что удалять можно будет не только сообщения
          const msg = document.querySelector(`.message[data-id="${data.target}"]`)
          if (msg !== null) { // такого сообщения нет
            msg.remove()
            if (!document.querySelectorAll('.message').length) { // это было последнее сообщение
              const wrp = document.querySelector('.messages-wrapper')
              const badge = document.createElement('div')
              badge.className = 'empty-channel-badge badge bg-secondary'
              badge.innerText = 'В этом канале нет сообщений...'
              wrp.append(badge)
            }
          }
          const channel = document.querySelector(`.channel[data-msg-id="${data.target}"]`)
          if (channel !== null) { // обновляем миниатюру
            const badge = channel.querySelector('.badge')
            document.querySelector('.channels').prepend(channel)
            badge.innerText = (parseInt(badge.innerText) || 1) - 1 || ''
            channel.removeAttribute('data-msg-id')
            channel.querySelector('.last-author').innerText = ''
            channel.querySelector('.last-msg').innerText = 'Сообщение было удалено'
            channel.querySelector('.timeago').dateTime = new Date().toISOString()
            channel.querySelector('.timeago').innerText = 'сейчас'
          }
          break
        }
        case 'EDIT': { // редактирование сообщения; общий смысл аналогичен DELETE
          if (data.type !== 'MESSAGE') return
          const msg = document.querySelector(`.message[data-id="${data.target}"]`)
          if (msg) {
            msg.classList.remove('pending')
            msg.classList.add('edited')
            msg.querySelector('.message-text').innerHTML = parseMarkup(data.text)
            msg.querySelector('.message-manage [data-act="edit"]')?.removeAttribute('disabled')
          }
          const channel = document.querySelector(`.channel[data-msg-id="${data.target}"]`)
          if (channel) { // обновляем миниатюру
            channel.querySelector('.last-msg').innerHTML = parseMarkup(data.text, true)
          }
          break
        }
        case 'MEMBERS': { // просмотр участников канала
          showMembersModal(data.members)
          break
        }
        case 'SUGGESTED_USERS': {
          for (const user of data.users) {
            const tem = document.querySelector('#tem-suggested').cloneNode(true).content
            const group = Utils.USER_GROUPS[user.role]
            tem.querySelector('.avatar').src = `/avatars/${user.avatar}`
            tem.querySelector('.user-name').innerText = user.name
            if (group.icon !== null) tem.querySelector('.user-group').innerHTML = String.prototype.concat(
              `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${group.icon[1]}">`,
                `<use href="#fa-${group.icon[0]}"></use>`,
              `</svg>`
            )
            tem.querySelector('.user-group').title = group.name
            tem.querySelector('input').value = user.id
            if (data.target === 'modal-new-dm') tem.querySelector('input').type = 'radio'
            document.querySelector(`#${data.target} .suggested-users`).append(tem)
          }
          break
        }
        case 'NEW_CHANNEL': {
          bootstrap.Modal.getOrCreateInstance(document.querySelector('#modal-new-channel')).hide()
          bootstrap.Modal.getOrCreateInstance(document.querySelector('#modal-new-dm')).hide()
          document.querySelector('.channels').prepend(makeChannel(data.channel))
          break
        }
        case 'PRESENCE': {
          const channel = document.querySelector(`.channel[data-peer="${data.user}"]`)
          if (!channel) return
          if (data.online) channel.classList.add('online')
          else channel.classList.remove('online')
          break
        }
      }
    }

    // при разрыве соединения
    ws.onclose = event => {
      const reasons = {
        0x03ee: 'Ошибка сервера или проблемы с сетью',
        0x1000: 'Подпись токена аутентификации недействительна',
        0x1001: 'Токен аутентификации просрочен',
        0x1002: 'Попытка использования чужого токена аутентификации',
        0x100f: 'Подключение без подписи запрещено'
      }
      console.log('Socket closed:', event.code)

      // создаем тост с оповещением
      const toast = document.createElement('div')
      toast.className = 'toast'
      toast.id = 'toast-ws-closed'
      toast.setAttribute('data-bs-autohide', false)
      toast.innerHTML = String.prototype.concat(
        `<div class="toast-header">`,
          `<strong class="me-auto">Соединение потеряно!</strong>`,
          `<time class="timeago" datetime="${new Date().toISOString()}">сейчас</time>`,
          `<button type="button" class="btn-close" data-bs-dismiss="toast"></button>`,
        `</div>`,
        `<div class="toast-body">`,
          `<div>${reasons[event.code] || 'Причина неизвестна'}</div>`,
          `<small class="text-body-tertiary">Код: 0x${event.code.toString(16).padStart(4, '0').toUpperCase()}</small>`,
          `<div class="mt-2 pt-2 border-top">`,
            `<button type="button" class="btn btn-primary btn-sm" onclick="location.reload()">Перезагрузить</button>`,
          `</div>`,
        `</div>`
      )
      document.querySelector('.toast-container').append(toast)
      bootstrap.Toast.getOrCreateInstance(toast).show()
      toast.addEventListener('hidden.bs.toast', e => e.currentTarget.remove())
    }
  }

  document.addEventListener('visibilitychange', () => {
    if (ws.readyState !== ws.OPEN) return
    ws.send(JSON.stringify({
      event: 'PRESENCE',
      online: document.visibilityState === 'visible'
    }))
  })

  // помечаем сообщения прочитанными при скролле до конца вниз
  document.querySelector('.contents-main').addEventListener('scroll', event => {
    const _ = event.currentTarget
    const channel_id = document.querySelector('.channel.selected')?.getAttribute('data-id')
    if (typeof channel_id === 'undefined') return
    if (_.scrollTop + _.clientHeight < _.scrollHeight) return
    ws.send(JSON.stringify({
      event: 'ACKNOWLEDGEMENT',
      channel: channel_id
    }))
  })

  // запрашиваем список участников канала при выборе пункта дропдауна
  document.querySelector('.contents-manage [data-act="members"]').addEventListener('click', event => {
    const channel_id = document.querySelector('.channel.selected')?.getAttribute('data-id')
    if (typeof channel_id === 'undefined') return
    event.currentTarget.setAttribute('disabled', '')
    ws.send(JSON.stringify({
      event: 'MEMBERS',
      channel: channel_id
    }))
  })
  // удаляем содержимое модали со списком участников при ее закрытии
  document.querySelector('#modal-members').addEventListener('hidden.bs.modal', event => {
    const _ = event.currentTarget
    document.querySelector('.contents-manage [data-act="members"]').removeAttribute('disabled')
    _.querySelectorAll('.member').forEach(el => el.remove())
    _.querySelectorAll('#members__count').innerText = '?'
  })

  // предлагаем пользователей при создании канала и лс
  document.querySelectorAll('#modal-new-channel, #modal-new-dm').forEach(e => e.addEventListener('show.bs.modal', event => {
    ws.send(JSON.stringify({ event: 'SUGGEST_USERS', target: event.currentTarget.id }))
  }))
  // удаляем содержимое модалей для создания при их закрытии
  document.querySelector('#modal-new-channel').addEventListener('hidden.bs.modal', event => {
    const _ = event.currentTarget
    _.querySelector('#mnc-title').value = ''
    Array.from(_.querySelector('.suggested-users').children).forEach(el => el.remove())
  })
  document.querySelector('#modal-new-dm').addEventListener('hidden.bs.modal', event => {
    Array.from(event.currentTarget.querySelector('.suggested-users').children).forEach(el => el.remove())
  })
  // поиск пользователей в модали лс
  document.querySelector('#mnd-search').addEventListener('change', event => {
    ws.send(JSON.stringify({
      event: 'SEARCH_USERS',
      query: event.currentTarget.value
    }))
  })
  document.querySelector('#mnd-search').addEventListener('keydown', event => {
    if (event.code !== 'Enter') return
    event.preventDefault()
    event.currentTarget.dispatchEvent(new Event('change'))
  })
  // передаем данные на сервер для создания
  document.querySelector('#modal-new-channel .modal-content').addEventListener('submit', event => {
    event.preventDefault()
    const fd = new FormData(event.target)
    fd.append('users', self.id)
    ws.send(JSON.stringify({
      event: 'CREATE_CHANNEL',
      ...Array.from(fd.entries()).reduce((obj, [key, val]) => {
        if (obj[key] instanceof Array) obj[key].push(val)
        else if (typeof obj[key] !== 'undefined') {
          obj[key] = new Array(obj[key])
          obj[key].push(val)
        } else obj[key] = val
        return obj
      }, {})
    }))
  })
  document.querySelector('#modal-new-dm .modal-content').addEventListener('submit', event => {
    event.preventDefault()
    const fd = new FormData(event.target)
    ws.send(JSON.stringify({
      event: 'CREATE_DM',
      peer: fd.get('users')
    }))
  })

  function applyRights() {
    if (!['admin', 'curator'].includes(self.role)) {
      document.querySelector('.panel-tools .btn').remove()
    }
  }

  /**
   * Оформляет список каналов
   * @param {FeedChannel[]} list Массив с информацией о каналах
   */
  function buildChannelList(list) {
    for (const channel of list) {
      document.querySelector('.channels').append(makeChannel(channel))
    }
  }
  /**
   * @param {FeedChannel} data
   */
  function makeChannel(data) {
    // делаем копию шаблона и заполняем ее данными
    const tem = document.getElementById('tem-channel').cloneNode(true).content
    const cont = tem.querySelector('.channel')
    cont.setAttribute('data-id', data.id)
    cont.setAttribute('data-msg-id', data.last_id)
    if (data.private_id) cont.setAttribute('data-peer', data.private_id)
    tem.querySelector('.avatar').src = `/avatars/${data.avatar}`
    tem.querySelector('.title').innerText = data.title
    if (data.last_at) tem.querySelector('time').dateTime = new Date(data.last_at).toISOString()
    tem.querySelector('time').innerText = data.last_at
      ? Utils.timeago(Date.now() - new Date(data.last_at).getTime())
      : ''
    tem.querySelector('.last-author').innerText = data.last_author_name ?? ''
    tem.querySelector('.last-msg').innerHTML = parseMarkup(data.last_id ? (data.last_content || 'Без текста') : 'Сообщений нет', true)
    if (+data.unread_count) tem.querySelector('.badge').innerText = Utils.getShortNum(data.unread_count)

    // вешаем хандлер на клик, чтобы открывать выбранный канал
    cont.onclick = event => {
      const _t = event.currentTarget
      const _c = document.querySelector('.contents')
      document.querySelectorAll('.channel').forEach(e => e.classList.remove('selected'))
      _t.classList.add('selected')

      document.querySelectorAll('.contents-piece').forEach(e => e.classList.remove('hidden'))
      _c.querySelector('.badge').classList.add('hidden')
      _c.querySelectorAll('.messages-wrapper > *').forEach(e => e.remove())
      _c.querySelector('.current-title').innerText = _t.querySelector('.title').innerText
      _c.querySelector('.avatar').src = _t.querySelector('.avatar').src
      _c.querySelector('#message-input').onkeydown = event => {
        // при нажатом шифте переносим сообщение на новую строчку, а не отправляем
        if (event.code === 'Enter' && !event.shiftKey) { event.preventDefault(); publishMessage() }
      }
      _c.querySelector('#message-send').onclick = publishMessage

      // пока данные бегут к серверу и обратно, пусть крутится спиннер
      const spinner = document.createElement('div')
      spinner.className = 'spinner spinner-border'
      _c.querySelector('.messages-wrapper').append(spinner)

      // идем за данными
      ws.send(JSON.stringify({
        event: 'CHANNEL',
        channel_id: _t.getAttribute('data-id')
      }))
    }
    return cont
  }

  /**
   * Заполняет модаль данными участников канала и показывает ее
   * @param {ChannelMember[]} members Массив данных участников канала
   */
  function showMembersModal(members) {
    const modal = document.querySelector('#modal-members')
    const bs_modal = bootstrap.Modal.getOrCreateInstance(modal)
    modal.querySelector('#members__count').innerText = members.length
    for (const member of members) {
      const tem = document.getElementById('tem-member').cloneNode(true).content
      const subtem = document.getElementById('tem-user').cloneNode(true).content
      const group = Utils.USER_GROUPS[member.role]
      tem.querySelector('.member').setAttribute('data-id', member.id)
      subtem.querySelector('.avatar').src = `/avatars/${member.avatar}`
      subtem.querySelector('.user-name .dropdown-toggle').innerText = member.name
      if (group.icon !== null) subtem.querySelector('.user-group').innerHTML = String.prototype.concat(
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${group.icon[1]}">`,
          `<use href="#fa-${group.icon[0]}"></use>`,
        `</svg>`
      )
      subtem.querySelector('.user-group').title = group.name
      tem.querySelector('.member-messages').innerText = Utils.xplural(member.messages, ['сообщение', 'сообщения', 'сообщений'])
      if (typeof member.joined_at === 'undefined') tem.querySelector('.member-joined').remove()
      else {
        tem.querySelector('.member-joined time').dateTime = member.joined_at
        tem.querySelector('.member-joined time').innerText = Utils.getMessageStamp(member.joined_at)
      }
      tem.querySelector('.member-head').append(subtem)
      new bootstrap.Dropdown(tem.querySelector('.user-name'))
      modal.querySelector('.modal-body').append(tem)
    }
    bs_modal.show()
  }
  function buildMessagesList(messages) {
    const wrp = document.querySelector('.messages-wrapper')
    wrp.querySelector('.spinner')?.remove()
    messages.forEach(e => wrp.append(makeMessage(e)))
  }
  function makeMessage(data) {
    const tem = document.getElementById('tem-message').cloneNode(true).content
    const cont = tem.querySelector('.message')
    const text = tem.querySelector('.message-text')
    const content = parseMarkup(data.contents)
    cont.setAttribute('data-id', data.id)
    cont.setAttribute('data-author', data.author)
    if (data.author === self.id) cont.classList.add('self')
    if (data.edited_at) cont.classList.add('edited')
    tem.querySelector('.avatar').src = `/avatars/${data.avatar}`
    tem.querySelector('.author').innerText = data.name
    tem.querySelector('time').dateTime = new Date(data.created_at).toISOString()
    tem.querySelector('time').innerText = Utils.getMessageStamp(data.created_at)
    text.innerHTML = content
    Prism.highlightAllUnder(text)
    if (text.querySelector(`.mention[data-target="${self.login}"]`)) cont.classList.add('mentioned')

    if (!data.attachments.length) tem.querySelector('.attachments').remove()
    else {
      const wrp = tem.querySelector('.attachments')
      const aid = 'attachments-' + data.id
      wrp.id = aid
      wrp.querySelector('.accordion-collapse').setAttribute('data-bs-parent', '#' + aid)
      wrp.querySelector('.accordion-collapse').id = aid + '-list'
      wrp.querySelector('.accordion-button').setAttribute('data-bs-target', `#${aid}-list`)
      wrp.querySelector('.accordion-button span').innerText =
        Utils.xplural(data.attachments.length, ['вложение', 'вложения', 'вложений'])

      for (const attachment of data.attachments) {
        const { filename } = attachment
        const li = document.createElement('li')
        const a = document.createElement('a')
        a.href = `/attachments/${filename[0]}/${filename.slice(0, 2)}/${filename}`
        a.target = '_blank'
        a.innerText = getFileName(filename, 25)
        li.append(a)
        wrp.querySelector('.accordion-body').append(li)
      }
    }

    ;(function applyRights() {
      if (self.role !== 'student') return
      tem.querySelector('[data-act="pin"]').remove()
      if (data.author === self.id) return
      tem.querySelector('[data-act="edit"]').remove()
      tem.querySelector('[data-act="delete"]').remove()
    })()

    tem.querySelector('[data-act="edit"]')?.addEventListener('click', function() {
      this.setAttribute('disabled', '')
      ws.send(JSON.stringify({
        event: 'RAW_MESSAGE',
        message: this.takeNthParent(4).getAttribute('data-id')
      }))
    })
    tem.querySelector('[data-act="delete"]')?.addEventListener('click', function() {
      this.setAttribute('disabled', '')
      ws.send(JSON.stringify({
        event: 'DELETE',
        type: 'MESSAGE',
        target: +this.takeNthParent(4).getAttribute('data-id')
      }))
    })
    tem.querySelector('[data-act="pin"]')?.addEventListener('click', function() {
      this.setAttribute('disabled', '')
      ws.send(JSON.stringify({
        event: 'PIN',
        target: +this.takeNthParent(4).getAttribute('data-id')
      }))
    })
    tem.querySelector('[data-act="reply"]')?.addEventListener('click', function() {
      const input = document.querySelector('#message-input')
      input.value = `-> ${this.takeNthParent(4).getAttribute('data-id')}\n${input.value}`
      input.focus()
    })
    tem.querySelector('.reply-link a')?.addEventListener('click', function(event) {
      event.preventDefault()
      ws.send(JSON.stringify({
        event: 'PREVIEW_MESSAGE',
        target: +this.getAttribute('data-target')
      }))
    })

    return cont
  }
  function publishMessage() {
    if (queued_files.size) return
    const input = document.querySelector('#message-input')
    if (!input.value.length && !ready_files.size) return
    const _c = document.querySelector('.messages-wrapper')
    const text = input.value.slice(0, 1024)
    if (input.hasAttribute('data-edit-id')) { // редактирование
      const id = +input.getAttribute('data-edit-id')
      ws.send(JSON.stringify({
        event: 'EDIT',
        type: 'MESSAGE',
        target: id,
        text
      }))
      input.removeAttribute('data-edit-id')
      const msg = document.querySelector(`.message[data-id="${id}"]`)
      msg.classList.remove('editing')
      msg.classList.add('pending')
    } else { // отправка
      const attachments = Array.from(ready_files.values())
      const ticket = 'x'.repeat(16).replace(/x/g, () => Math.floor(Math.random() * 36).toString(36))
      ws.send(JSON.stringify({
        event: 'MESSAGE',
        channel_id: document.querySelector('.channel.selected').getAttribute('data-id'),
        text,
        ticket,
        attachments
      }))
      const msg = makeMessage({
        author: self.id,
        avatar: self.avatar,
        name: self.name,
        created_at: Date.now(),
        contents: text,
        attachments
      })
      msg.classList.add('pending')
      msg.setAttribute('data-ticket', ticket)
      _c.append(msg)
      Utils.scrollToBottom('.contents-main')
      if (_c.querySelector('.badge')) _c.querySelector('.badge').remove()
    }
    ready_files.clear()
    document.querySelectorAll('.ag-entry').forEach(e => e.remove())
    input.value = ''
    input.focus()
  }
  function parseMarkup(text, inline = false) {
    let markup = inline ? marked.parseInline(text) : marked.parse(text)
    return DOMPurify.sanitize(markup)
  }
  function addMarkup(type) {
    const field = document.querySelector('#message-input')
    const sel_start = field.selectionStart
    const sel_end = field.selectionEnd
    const selection = field.value.slice(sel_start, sel_end)
    let str = ''
    let offset = 1
    switch (type) {
      case 'bold': str = `**$1**`; offset = 2; break
      case 'italic': str = `_$1_`; break
      case 'strike': str = `~$1~`; break
      case 'mono': str = `\`$1\``; break
      case 'link': str = `[$1](https://)`; break
      case 'code': str = `\`\`\`\n$1\n\`\`\``; offset = 4; break
      default: offset = 0
    }
    field.value = field.value.slice(0, sel_start) + str.replace('$1', selection) + field.value.slice(sel_end)
    field.focus()
    field.selectionStart = sel_start + offset
    field.selectionEnd = sel_end + offset
  }
  function getFileName(name, limit = 10) {
    const _p = name.split('.')
    const ext = _p.length >= 2 ? '.' + _p.pop() : ''
    const fname = _p.join('.')
    if (fname.length > limit) return `${fname.slice(0, limit)}… ${ext}`
    return fname + ext
  }
})();
