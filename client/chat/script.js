import 'https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js'
import { Marked } from 'https://cdn.jsdelivr.net/npm/marked/lib/marked.esm.js'
import 'https://cdn.jsdelivr.net/npm/dompurify@3.0.9/dist/purify.min.js'
import * as Utils from './utils.js'

(async function() {
  const theme = (function setTheme() {
    const _ = document.documentElement
    const theme = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
    if (_.getAttribute('data-bs-theme') === theme) return
    _.setAttribute('data-bs-theme', theme)
    return theme
  })();

  const marked = new Marked()

  let self = JSON.parse(localStorage.getItem('self-data'))
  {
    const request = await fetch('/api/@me')
    const response = await request.json()
    self = response
    localStorage.setItem('self-data', JSON.stringify(self))
  }
  document.querySelector('#self-avatar').src = `/avatars/${self.avatar}`

  document.querySelector('#attach').addEventListener('click', () => {
    document.querySelector('#attachments-input').click()
  })

  document.body.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      const channel = document.querySelector('.channel.selected')
      if (!channel) return
      channel.classList.remove('selected')
      document.querySelectorAll('.contents > div').forEach(e => e.classList.toggle('hidden'))
    }
  })

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
        case 'NEW_MESSAGE': {
          if (data.channel !== document.querySelector('.channel.selected')?.getAttribute('data-id')) return
          document.querySelector('.messages-wrapper').append(makeMessage(data))
          Utils.scrollToBottom()
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
      tem.querySelector('.time').innerText = e.created_at
        ? Utils.timeago(Date.now() - new Date(e.created_at).getTime())
        : ''
      tem.querySelector('.last-author').innerText = e.username
      tem.querySelector('.last-msg').innerHTML = parseMD(e.contents || 'Сообщений нет')

      cont.onclick = event => {
        const _t = event.currentTarget
        const _c = document.querySelector('.contents')
        document.querySelectorAll('.channel').forEach(e => e.classList.remove('selected'))
        _t.classList.add('selected')

        document.querySelectorAll('.contents > div').forEach(e => e.classList.remove('hidden'))
        _c.querySelector('.badge').classList.add('hidden')
        _c.querySelectorAll('.messages-wrapper > *').forEach(e => e.remove())
        _c.querySelector('.current-title').innerText = _t.querySelector('.title').innerText
        _c.querySelector('.avatar').src = _t.querySelector('.avatar').src
        _c.querySelector('#message-input').onkeydown = event => {
          if (event.code === 'Enter' && !event.shiftKey) { event.preventDefault(); sendMessage() }
        }
        _c.querySelector('#message-send').onclick = sendMessage

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
    cont.setAttribute('data-id', data.id)
    tem.querySelector('.avatar').src = `/avatars/${data.avatar}`
    tem.querySelector('.author').innerText = data.author
    tem.querySelector('.time').innerText = Utils.getMessageStamp(data.created_at)
    tem.querySelector('.message-text').innerHTML = parseMD(data.contents)
    return cont
  }
  function sendMessage() {
    const input = document.querySelector('#message-input')
    if (!input.value.length) return
    const _c = document.querySelector('.messages-wrapper')
    const ticket = 'x'.repeat(16).replace(/x/g, () => Math.floor(Math.random() * 36).toString(36))
    ws.send(JSON.stringify({
      event: 'MESSAGE',
      channel_id: document.querySelector('.channel.selected').getAttribute('data-id'),
      text: input.value.slice(0, 1024),
      ticket
    }))
    const msg = makeMessage({
      avatar: self.avatar,
      author: self.name,
      created_at: Date.now(),
      contents: input.value.slice(0, 1024)
    })
    msg.classList.add('pending')
    msg.setAttribute('data-ticket', ticket)
    _c.append(msg)
    Utils.scrollToBottom()
    if (_c.querySelector('.badge')) _c.querySelector('.badge').remove()

    input.value = ''
    input.focus()
  }
  function parseMD(text) {
    return DOMPurify.sanitize(marked.parseInline(text))
  }
})();
