/** Число миллисекунд в минуте */
const MINUTE = 60000
/** Число миллисекунд в часе */
const HOUR = 3600 * 1000
/** Число миллисекунд в сутках */
const DAY = 86400 * 1000
/** Число миллисекунд в неделе */
const WEEK = 7 * DAY
/** Число миллисекунд в месяце */
const MONTH = 30 * DAY
/** Число миллисекунд в годе */
const YEAR = 365 * DAY

/**
 * Данные групп прав пользователей для отображения на клиенте
 */
export const USER_GROUPS = {
  student: { icon: ['book-open-cover', '0 -32 660 512'], name: 'Студент' },
  teacher: { icon: ['pen-nib', '0 0 512 512'], name: 'Преподаватель' },
  curator: { icon: ['graduation-cap', '0 0 640 512'], name: 'Куратор' },
  admin: { icon: ['crown', '0 0 576 512'], name: 'Администратор' }
}

/**
 * Форматирует время в относительном формате
 * @param {number} ms время, прошедшее с момента в прошлом (в миллисекундах)
 * @returns строку с отформатированным временем
 */
export function timeago(ms) {
  // да, это можно было сделать циклом
  if (ms >= YEAR) return `${Math.floor(ms / YEAR)}г`
  else if (ms >= MONTH) return `${Math.floor(ms / MONTH)}мес`
  else if (ms >= WEEK) return `${Math.floor(ms / WEEK)}н`
  else if (ms >= DAY) return `${Math.floor(ms / DAY)}д`
  else if (ms >= HOUR) return `${Math.floor(ms / HOUR)}ч`
  else if (ms >= MINUTE) return `${Math.floor(ms / MINUTE)}м`
  else return 'сейчас'
}

/**
 * Создает понятную дату отправки сообщения
 * @param {string} raw временная отметка отправки сообщения
 * @returns строка с отформатированной датой
 */
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

/**
 * Выбирает множественную форму слова при заданном числе
 * @param {number} x количество
 * @param {string[]} forms формы названия предмета (`[один, несколько, много]`)
 * @returns форма множественного числа слова
 */
export function plural(x, forms) {
  const z = x % 10
  const y = x % 100
  if (11 <= y && y <= 19) return forms[2]
  else if (z === 1) return forms[0]
  else if (2 <= z && z <= 4) return forms[1]
  else return forms[2]
}

/**
 * Выбирает множественную форму слова при заданном числе и печатает ее вместе с числом (см. {@link plural})
 * @param {*} x количество
 * @param {*} forms формы названия предмета (`[один, несколько, много]`)
 * @returns форма множественного числа слова со счетчиком количества
 */
export function xplural(x, forms) {
  return `${x}\u00a0${plural(x, forms)}`
}

/**
 * Сокращает данное число до тысяч
 * @param {number} x число
 * @returns сокращенная запись числа
 */
export function getShortNum(x) {
  const formatter = new Intl.NumberFormat('en', { maximumFractionDigits: 1 })
  const suffixes = [[1e6, 'M'], [1e3, 'K']]
  for (const suffix of suffixes) {
    if (suffix[0] <= x) return formatter.format(x / suffix[0]) + suffix[1]
  }
  return formatter.format(x)
}

/**
 * Прокручивает контейнер до упора вниз
 * @param {string} selector селектор контейнера
 */
export function scrollToBottom(selector) {
  const _c = document.querySelector(selector)
  _c.scrollTo(0, _c.scrollHeight)
}

/**
 * Предотвращает стандартное поведение события DOM
 * @param {Event} event обрабатываемое событие DOM
 */
export function preventDefaults(event) {
  event.preventDefault()
  event.stopPropagation()
}

/**
 * Привязывает указанную функцию к обработке нескольких данных
 * событий (см. {@link Element.prototype.addEventListener addEventListener})
 * @param {string} events список событий, разделенных пробелом (см. {@link ElementEventMap})
 * @param {EventListenerOrEventListenerObject} listener функция-обработчик событий
 * @param {boolean | AddEventListenerOptions | undefined} options параметры обработки событий (см. {@link AddEventListenerOptions})
 */
Element.prototype.addEventListeners = function(events, listener, options) {
  events.split(/\s+/).forEach(event => this.addEventListener(event, listener, options))
}

/**
 * Получает n-го родителя данного элемента
 * @param {number} n индекс родителя в структуре DOM
 * @returns n-ый родитель данного элемента
 */
Element.prototype.takeNthParent = function(n) {
  let ref = this
  for (let i = 0; i < n; i++) ref = ref.parentElement
  return ref
}
