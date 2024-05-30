export default class EmojiPanel {
  static CATEGORIES = {
    activity: ['Активности', '⚽️'],
    flags: ['Флаги', '🚩'],
    foods: ['Еда и напитки', '🍎'],
    nature: ['Животные и природа', '🐱'],
    objects: ['Предметы', '💡'],
    people: ['Эмоции и люди', '😀'],
    places: ['Путешествия и места', '🚗'],
    symbols: ['Символы', '🔣'],
  }

  source
  scroll_spy
  wrp
  onclick = null
  #emoji_data
  constructor (source) {
    this.source = source
    const _wrp = document.createElement('div')
    _wrp.className = 'emoji-panel'
    _wrp.innerHTML = `<div class="ep__header">
      <div class="ep__header-cats has-emoji"></div>
      <div class="ep__header-search"></div>
    </div>
    <div class="ep__list"></div>
    <div class="ep__selection">
      <span class="ep__selection-preview has-emoji">❔</span>
      <span class="ep__selection-name">Ничего не выбрано</span>
    </div>`
    this.wrp = _wrp
    this.#init()
  }

  #init() {
    fetch(this.source).then(r => r.json().then(json => {
      this.#emoji_data = json
      this.#initList()
    }))
    this.scroll_spy = new bootstrap.ScrollSpy(this.wrp.querySelector('.ep__list'), {
      target: '.ep__header-cats',
      smoothScroll: true
    })
  }

  #initList() {
    for (const cat of this.#emoji_data.cats) {
      const sect = document.createElement('section')
      const h = document.createElement('h4')
      sect.id = `ecat-${cat.id}`
      h.innerText = EmojiPanel.CATEGORIES[cat.id][0]
      sect.append(h)
      for (const emoji of cat.emojis) {
        const span = document.createElement('span')
        const d = this.#emoji_data.list[emoji]
        span.className = 'has-emoji'
        span.id = `e-${d.id}`
        span.innerText = d.emoji
        span.title = d.name
        span.onmouseenter = () => {
          this.wrp.querySelector('.ep__selection-preview').innerText = d.emoji
          this.wrp.querySelector('.ep__selection-name').innerText = d.name
        }
        span.onmouseleave = () => {
          this.wrp.querySelector('.ep__selection-preview').innerText = '❔'
          this.wrp.querySelector('.ep__selection-name').innerText = 'Ничего не выбрано'
        }
        span.onclick = () => {
          if (this.onclick === null) return
          this.onclick(d.emoji)
        }
        sect.append(span)
      }
      this.wrp.querySelector('.ep__list').append(sect)

      const cat_el = document.createElement('a')
      cat_el.className = 'ep__header-cat'
      cat_el.href = `#ecat-${cat.id}`
      cat_el.innerText = EmojiPanel.CATEGORIES[cat.id][1]
      cat_el.title = EmojiPanel.CATEGORIES[cat.id][0]
      this.wrp.querySelector('.ep__header-cats').append(cat_el)
    }
    this.scroll_spy.refresh()
  }
}
