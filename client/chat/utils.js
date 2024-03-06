const MINUTE = 60000
const HOUR = 3600 * 1000
const DAY = 86400 * 1000
const WEEK = 7 * DAY
const MONTH = 30 * DAY
const YEAR = 365 * DAY

export const USER_GROUPS = {
  student: { icon: null, name: 'Студент' },
  teacher: { icon: ['pen-nib', 512], name: 'Преподаватель' },
  curator: { icon: ['graduation-cap', 640], name: 'Куратор' },
  admin: { icon: ['crown', 576], name: 'Администратор' }
}

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

export function plural(x, forms) {
  const z = x % 10
  const y = x % 100
  if (11 <= y && y <= 19) return forms[2]
  else if (z === 1) return forms[0]
  else if (2 <= z && z <= 4) return forms[1]
  else return forms[2]
}

export function xplural(x, forms) {
  return `${x}\u00a0${plural(x, forms)}`
}

export function getShortNum(x) {
  const formatter = new Intl.NumberFormat('en', { maximumFractionDigits: 1 })
  const suffixes = [[1e6, 'M'], [1e3, 'K']]
  for (const suffix of suffixes) {
    if (suffix[0] <= x) return formatter.format(x / suffix[0]) + suffix[1]
  }
  return formatter.format(x)
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
Element.prototype.takeNthParent = function(n) {
  let ref = this
  for (let i = 0; i < n; i++) ref = ref.parentElement
  return ref
}
