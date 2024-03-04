import { Picker } from 'https://cdn.jsdelivr.net/npm/emoji-mart@5.5.2/+esm'
import 'https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js'
import { Marked } from 'https://cdn.jsdelivr.net/npm/marked/lib/marked.esm.js'
import 'https://cdn.jsdelivr.net/npm/dompurify@3.0.9/dist/purify.min.js'
import * as Utils from './utils.js'

(async function() {
  'use strict'
  const theme = (function setTheme() {
    const _ = document.documentElement
    const theme = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
    if (_.getAttribute('data-bs-theme') === theme) return
    _.setAttribute('data-bs-theme', theme)
    return theme
  })();

  const marked = new Marked()
  const MARKUP_BINDS = {
    KeyB: 'bold', KeyI: 'italic',
    KeyS: 'strike', KeyM: 'mono',
    KeyL: 'link'
  }

  let self = JSON.parse(localStorage.getItem('self-data'))
  {
    const request = await fetch('/api/@me')
    const response = await request.json()
    self = response
    localStorage.setItem('self-data', JSON.stringify(self))
  }
  document.querySelector('#self-avatar').src = `/avatars/${self.avatar}`

  {
    const el = document.createElement('link')
    el.href = `../helpers/prism.${theme === 'dark' ? 'dark.' : ''}css`
    el.type = 'text/css'
    el.rel = 'stylesheet'
    document.head.append(el)
  }

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
  // document.body.append(emoji_panel)
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

  document.querySelector('#attach').addEventListener('click', () => {
    document.querySelector('#attachments-input').click()
  })

  document.body.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      const channel = document.querySelector('.channel.selected')
      if (!channel) return
      channel.classList.remove('selected')
      document.querySelectorAll('.contents-piece').forEach(e => e.classList.toggle('hidden'))
    }
  })
  document.querySelector('#message-input').addEventListener('keydown', event => {
    if ((event.metaKey || event.ctrlKey) && MARKUP_BINDS[event.code]) {
      event.preventDefault()
      addMarkup(MARKUP_BINDS[event.code])
    }
  })

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

  setInterval(function updateTimeago() {
    document.querySelectorAll('.timeago[datetime]').forEach(element => {
      const now = Date.now()
      const ms = new Date(element.dateTime).getTime()
      element.innerText = isNaN(ms) ? '—' : Utils.timeago(now - ms)
    })
  }, 60000)

  const ws = new WebSocket(`wss://${location.host}/ws`)
  ws.onopen = () => {
    console.log('Socket is online')
    ws.send(JSON.stringify({
      event: 'HANDSHAKE',
      id: self.id,
      ticket: self.ticket
    }))

    ws.onmessage = event => {
      const data = JSON.parse(event.data)
      switch (data.event) {
        case 'FEED': {
          buildChannelList(data.feed)
          break
        }
        case 'CHANNEL': {
          if (!data.messages.length) {
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
        case 'MESSAGE': {
          const msg = document.querySelector(`.message[data-ticket="${data.ticket}"]`)
          msg.classList.remove('pending')
          msg.setAttribute('data-id', data.id)
          msg.removeAttribute('data-ticket')
          break
        }
        case 'RAW_MESSAGE': {
          const input = document.querySelector('#message-input')
          input.value = data.contents
          input.setAttribute('data-edit-id', data.id)
          document.querySelector(`.message[data-id="${data.id}"]`).classList.add('editing')
          break
        }
        case 'NEW_MESSAGE': {
          if (data.channel !== document.querySelector('.channel.selected')?.getAttribute('data-id')) return
          document.querySelector('.messages-wrapper').append(makeMessage(data))
          Utils.scrollToBottom()
          break
        }
        case 'DELETE': {
          if (data.type !== 'MESSAGE') return
          const msg = document.querySelector(`.message[data-id="${data.target}"]`)
          if (msg === null) return
          msg.remove()
          if (!document.querySelectorAll('.message').length) {
            const wrp = document.querySelector('.messages-wrapper')
            const badge = document.createElement('div')
            badge.className = 'empty-channel-badge badge bg-secondary'
            badge.innerText = 'В этом канале нет сообщений...'
            wrp.append(badge)
          }
          break
        }
        case 'EDIT': {
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
      }
    }
    ws.onclose = event => {
      console.log('Socket closed:', event.code)
    }
  }

  function buildChannelList(list) {
    list.forEach(e => {
      const tem = document.getElementById('temp-channel').cloneNode(true).content
      const cont = tem.querySelector('.channel')
      cont.setAttribute('data-id', e.channel_id)
      tem.querySelector('.avatar').src = `/avatars/${e.avatar}`
      tem.querySelector('.title').innerText = e.title
      if (e.created_at) tem.querySelector('time').dateTime = new Date(e.created_at).toISOString()
      tem.querySelector('time').innerText = e.created_at
        ? Utils.timeago(Date.now() - new Date(e.created_at).getTime())
        : ''
      tem.querySelector('.last-author').innerText = e.username
      tem.querySelector('.last-msg').innerHTML = parseMD(e.contents || 'Сообщений нет', true)

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
          if (event.code === 'Enter' && !event.shiftKey) { event.preventDefault(); publishMessage() }
        }
        _c.querySelector('#message-send').onclick = publishMessage

        const spinner = document.createElement('div')
        spinner.className = 'spinner spinner-border'
        _c.querySelector('.messages-wrapper').append(spinner)

        ws.send(JSON.stringify({
          event: 'CHANNEL',
          channel_id: _t.getAttribute('data-id')
        }))
      }

      document.querySelector('.channels').append(tem)
    })
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
