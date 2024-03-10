// импортируем необходимые файлы и модули для работы
import { Picker } from 'https://cdn.jsdelivr.net/npm/emoji-mart@5.5.2/+esm' // панель эмодзи
import 'https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js' // бутстрап
import { Marked } from 'https://cdn.jsdelivr.net/npm/marked/lib/marked.esm.js' // парсер маркдауна
import 'https://cdn.jsdelivr.net/npm/dompurify@3.0.9/dist/purify.min.js' // санитайзер для парсера
import * as Utils from './utils.js' // утилиты
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
  const MARKUP_BINDS = {
    KeyB: 'bold', KeyI: 'italic',
    KeyS: 'strike', KeyM: 'mono',
    KeyL: 'link'
  }

  // получаем данные пользователя
  let self = JSON.parse(localStorage.getItem('self-data'))
  {
    const request = await fetch('/api/@me')
    const response = await request.json()
    self = response
    localStorage.setItem('self-data', JSON.stringify(self))
  }
  document.querySelector('#self-avatar').src = `/avatars/${self.avatar}`

  // применяем нужный стиль блоков с подсветкой синтаксиса
  {
    const el = document.createElement('link')
    el.href = `../helpers/prism.${theme === 'dark' ? 'dark.' : ''}css`
    el.type = 'text/css'
    el.rel = 'stylesheet'
    document.head.append(el)
  }

  // панель эмодзи
  // todo: адекватно подружить панель с бутстрапом
  // todo: решить проблему с ошибками рендера при повторном открытии панели
  const emoji_panel = new Picker({
    async data() {
      const response = await fetch('https://cdn.jsdelivr.net/npm/@emoji-mart/data')
      return response.json()
    },
    onEmojiSelect(emoji) {
      console.log(emoji)
      document.querySelector('#message-input').value += emoji.native
    },
    locale: 'ru',
    theme
  })
  console.dir(emoji_panel)
  emoji_panel.id = 'emoji-panel'
  // панель будет всплывать по нажатию кнопки в бутстраповском поповере
  const emoji_panel_popover = new bootstrap.Popover(document.querySelector('#emojis'), {
    html: true,
    customClass: 'emoji-popover',
    placement: 'top',
    offset: [-175, 0],
    content: emoji_panel
  })
  document.querySelector('#emojis').addEventListener('click', event => {
    if (typeof event.currentTarget.popover !== 'undefined') {
      event.currentTarget.popover('show')
      emoji_panel.component.prototype.render()
    }
  })

  // биндим кнопку со скрепкой на выбор файлов для прикрепления
  document.querySelector('#attach').addEventListener('click', () => {
    document.querySelector('#attachments-input').click()
  })

  // слушаем нажатия клавиш глобально
  document.body.addEventListener('keydown', event => {
    // шорткат на редактирование последнего сообщения
    // todo: выбирать только свои сообщения
    if (event.code === 'ArrowUp') {
      const channel = document.querySelector('.channel.selected')
      if (!channel) return
      const msg = [...document.querySelectorAll('.message')].at(-1)
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
  // активируем кейбинды для быстрого форматирования
  document.querySelector('#message-input').addEventListener('keydown', event => {
    if ((event.metaKey || event.ctrlKey) && MARKUP_BINDS[event.code]) {
      event.preventDefault()
      addMarkup(MARKUP_BINDS[event.code])
    }
  })
  
  // обработчик drag&drop
  // todo: загрузка файлов на сервер и отображение миниатюр на клиенте
  {
    const body = document.body
    const cont = document.querySelector('.contents')
    body.addEventListeners('dragenter dragover dragleave drop', Utils.preventDefaults)
    cont.addEventListeners('dragenter dragover dragleave drop', Utils.preventDefaults)
    cont.addEventListener('dragenter', () => cont.classList.add('dropping'))
    cont.addEventListeners('dragleave drop', e => {
      if (!e.target.className.startsWith('contents')) return
      cont.classList.remove('dropping')
    })
    cont.addEventListeners('dragend drop', event => {
      const dataurls = []
      const files = event.dataTransfer.files
      for (const file of files) {
        const reader = new FileReader()
        reader.addEventListener('load', event => {
          const url = event.target.result
          dataurls.push({ type: file.type, url })
        })
        reader.readAsDataURL(file)
      }
      const timer = setInterval(() => {
        if (dataurls.length !== files.length) return
        console.log(dataurls)
        clearInterval(timer)
      }, 1000)
    })
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
  const ws = new WebSocket(`wss://${location.host}/ws`)
  ws.onopen = () => {
    // аутентифицируемся
    console.log('Socket is online')
    ws.send(JSON.stringify({
      event: 'HANDSHAKE',
      id: self.id,
      ticket: self.ticket
    }))

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
          Utils.scrollToBottom()
          break
        }
        case 'MESSAGE': { // подтверждение отправки своего сообщения
          const msg = document.querySelector(`.message[data-ticket="${data.ticket}"]`)
          msg.classList.remove('pending')
          msg.setAttribute('data-id', data.id)
          msg.removeAttribute('data-ticket')
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
        case 'NEW_MESSAGE': { // новое чужое сообщение
          if (data.channel !== document.querySelector('.channel.selected')?.getAttribute('data-id')) return
          document.querySelector('.messages-wrapper').append(makeMessage(data))
          Utils.scrollToBottom()
          break
        }
        case 'DELETE': { // удаление сообщения
          if (data.type !== 'MESSAGE') return // предполагается, что удалять можно будет не только сообщения
          const msg = document.querySelector(`.message[data-id="${data.target}"]`)
          if (msg === null) return // такого сообщения нет
          msg.remove()
          if (!document.querySelectorAll('.message').length) { // это было последнее сообщение
            const wrp = document.querySelector('.messages-wrapper')
            const badge = document.createElement('div')
            badge.className = 'empty-channel-badge badge bg-secondary'
            badge.innerText = 'В этом канале нет сообщений...'
            wrp.append(badge)
          }
          break
        }
        case 'EDIT': { // редактирование сообщения; общий смысл аналогичен DELETE
          if (data.type !== 'MESSAGE') return
          const msg = document.querySelector(`.message[data-id="${data.target}"]`)
          console.log(msg)
          if (msg === null) return
          msg.classList.remove('pending')
          msg.classList.add('edited')
          msg.querySelector('.message-text').innerHTML = parseMD(data.text)
          msg.querySelector('.message-manage [data-act="edit"]').removeAttribute('disabled')
          break
        }
        case 'MEMBERS': { // просмотр участников канала
          showMembersModal(data.members)
          break
        }
      }
    }

    // при разрыве соединения
    ws.onclose = event => {
      console.log('Socket closed:', event.code)

      // создаем тост с оповещением
      const toast = document.createElement('div')
      toast.className = 'toast'
      toast.id = 'toast-ws-closed'
      toast.setAttribute('data-bs-autohide', false)
      toast.innerHTML = String.prototype.concat(
        `<div class="toast-header">`,
          `<strong class="me-auto">Сервер отключился!</strong>`,
          `<time class="timeago" datetime="${new Date().toISOString()}">сейчас</time>`,
          `<button type="button" class="btn-close" data-bs-dismiss="toast" aria-label="Close"></button>`,
        `</div>`,
        `<div class="toast-body">Код закрытия: ${event.code}</div>`,
      )
      document.querySelector('.toast-container').append(toast)
      bootstrap.Toast.getOrCreateInstance(toast).show()
      toast.addEventListener('hidden.bs.toast', e => e.currentTarget.remove())
    }
  }

  // помечаем сообщения прочитанными при скролле до конца вниз
  // todo: отмечать прочитанные, даже если скролла нет
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

  // запрашиваем список участников канала при нажатии на пункт дропдауна
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

  /**
   * Оформляет список каналов
   * @param {FeedChannel[]} list Массив с информацией о каналах
   */
  function buildChannelList(list) {
    list.forEach(e => {
      // делаем копию шаблона и заполняем ее данными
      const tem = document.getElementById('temp-channel').cloneNode(true).content
      const cont = tem.querySelector('.channel')
      cont.setAttribute('data-id', e.id)
      tem.querySelector('.avatar').src = `/avatars/${e.avatar}`
      tem.querySelector('.title').innerText = e.title
      if (e.created_at) tem.querySelector('time').dateTime = new Date(e.created_at).toISOString()
      tem.querySelector('time').innerText = e.created_at
        ? Utils.timeago(Date.now() - new Date(e.created_at).getTime())
        : ''
      tem.querySelector('.last-author').innerText = e.username
      tem.querySelector('.last-msg').innerHTML = parseMD(e.contents || 'Сообщений нет', true)
      if (e.unread) tem.querySelector('.badge').innerText = Utils.getShortNum(e.unread)

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

      // заполненный шаблон пихаем в список каналов
      document.querySelector('.channels').append(tem)
    })
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
      const tem = document.querySelector('#temp-member').cloneNode(true).content
      const group = Utils.USER_GROUPS[member.role]
      tem.querySelector('.member').setAttribute('data-id', member.id)
      tem.querySelector('.avatar').src = `/avatars/${member.avatar}`
      tem.querySelector('.member-name').innerText = member.name
      if (group.icon !== null) tem.querySelector('.member-group').innerHTML = String.prototype.concat(
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${group.icon[1]} 512">`,
          `<use href="#fa-${group.icon[0]}"></use>`,
        `</svg>`
      )
      tem.querySelector('.member-group').title = group.name
      tem.querySelector('.member-messages').innerText = Utils.xplural(member.messages, ['сообщение', 'сообщения', 'сообщений'])
      tem.querySelector('.member-joined').dateTime = member.joined_at
      tem.querySelector('.member-joined').innerText = Utils.getMessageStamp(member.joined_at)
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
    const tem = document.getElementById('temp-message').cloneNode(true).content
    const cont = tem.querySelector('.message')
    const text = tem.querySelector('.message-text')
    cont.setAttribute('data-id', data.id)
    if (data.edited_at) cont.classList.add('edited')
    tem.querySelector('.avatar').src = `/avatars/${data.avatar}`
    tem.querySelector('.author').innerText = data.author
    tem.querySelector('time').dateTime = new Date(data.created_at).toISOString()
    tem.querySelector('time').innerText = Utils.getMessageStamp(data.created_at)
    text.innerHTML = parseMD(data.contents)
    Prism.highlightAllUnder(text)

    tem.querySelector('[data-act="edit"]').addEventListener('click', event => {
      event.currentTarget.setAttribute('disabled', '')
      ws.send(JSON.stringify({
        event: 'RAW_MESSAGE',
        message: event.currentTarget.takeNthParent(4).getAttribute('data-id')
      }))
    })
    tem.querySelector('[data-act="delete"]').addEventListener('click', event => {
      event.currentTarget.setAttribute('disabled', '')
      ws.send(JSON.stringify({
        event: 'DELETE',
        type: 'MESSAGE',
        target: +event.currentTarget.takeNthParent(4).getAttribute('data-id')
      }))
    })

    return cont
  }
  function publishMessage() {
    const input = document.querySelector('#message-input')
    if (!input.value.length) return
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
      const ticket = 'x'.repeat(16).replace(/x/g, () => Math.floor(Math.random() * 36).toString(36))
      ws.send(JSON.stringify({
        event: 'MESSAGE',
        channel_id: document.querySelector('.channel.selected').getAttribute('data-id'),
        text,
        ticket
      }))
      const msg = makeMessage({
        avatar: self.avatar,
        author: self.name,
        created_at: Date.now(),
        contents: text
      })
      msg.classList.add('pending')
      msg.setAttribute('data-ticket', ticket)
      _c.append(msg)
      Utils.scrollToBottom()
      if (_c.querySelector('.badge')) _c.querySelector('.badge').remove()
    }
    input.value = ''
    input.focus()
  }
  function parseMD(text, inline = false) {
    return DOMPurify.sanitize(inline ? marked.parseInline(text) : marked.parse(text))
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
      default: offset = 0
    }
    field.value = field.value.slice(0, sel_start) + str.replace('$1', selection) + field.value.slice(sel_end)
    field.focus()
    field.selectionStart = sel_start + offset
    field.selectionEnd = sel_end + offset
  }
})();
