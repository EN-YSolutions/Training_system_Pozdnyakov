const MINUTE = 60000
const HOUR = 3600 * 1000
const DAY = 86400 * 1000
const WEEK = 7 * DAY
const MONTH = 30 * DAY
const YEAR = 365 * DAY

export function timeago(ms) {
  if (ms >= YEAR) return `${Math.floor(ms / YEAR)}г`
  else if (ms >= MONTH) return `${Math.floor(ms / MONTH)}мес`
  else if (ms >= WEEK) return `${Math.floor(ms / WEEK)}н`
  else if (ms >= DAY) return `${Math.floor(ms / DAY)}д`
  else if (ms >= HOUR) return `${Math.floor(ms / HOUR)}ч`
  else if (ms >= MINUTE) return `${Math.floor(ms / MINUTE)}м`
  else return 'сейчас'
}

export function getMessageStamp(raw) {
  const n = new Date()
  const d = new Date(raw)
  const df = n.getDate() - d.getDate()
  let date
  if (df === 0) date = 'Сегодня'
  else if (df === 1) date = 'Вчера'
  else if (df === 2) date = 'Позавчера'
  else if (n.getFullYear() !== d.getFullYear()) date = d.toLocaleString('ru', { year: 'numeric', month: 'long', day: 'numeric' })
  else date = d.toLocaleString('ru', { month: 'long', day: 'numeric' })
  return `${date} в ${d.toLocaleTimeString('ru')}`
}

export function scrollToBottom() {
  const _c = document.querySelector('.contents-main')
  _c.scrollTo(0, _c.scrollHeight)
}

export function preventDefaults(event) {
  event.preventDefault()
  event.stopPropagation()
}
Element.prototype.addEventListeners = function(events, listener, options) {
  events.split(/\s+/).forEach(event => this.addEventListener(event, listener, options))
}
