import jwt from 'jsonwebtoken'
import { readFileSync } from 'fs'
import dotenv from 'dotenv'

/** Число миллисекунд в минуте */
export const MINUTE = 60000
/** Число миллисекунд в часе */
export const HOUR = 3600 * 1000
/** Число миллисекунд в сутках */
export const DAY = 86400 * 1000
/** Число миллисекунд в неделе */
export const WEEK = 7 * DAY
/** Число миллисекунд в месяце */
export const MONTH = 30 * DAY
/** Число миллисекунд в годе */
export const YEAR = 365 * DAY

/**
 * Хандлер для запросов несуществующих файлов
 * @param {Error} error ошибка запроса файла
 * @param {import('express').Response} response объект ответа сервера
 */
export function handleSendFileErrors(error, response) {
  if (typeof error === 'undefined') return
  if (error.message.match(/^ENOENT/)) response.status(404).end()
  else response.status(500).end()
}

/**
 * Обрабатывает JWT-токен и возвращает его содержимое
 * @param {string} token JWT-токен
 * @returns {Promise<{[key: string]: any}>} промис с содержимым JWT-токена
 */
export function resolveJWT(token) {
  return new Promise((res, rej) => {
    const secret = dotenv.parse(readFileSync('.env', 'utf8')).JWT_SECRET
    try {
      res(jwt.verify(token, secret, { algorithms: ['HS256'] }))
    } catch (error) {
      if (error instanceof jwt.JsonWebTokenError)
        return res(null)
      rej(error)
    }
  })
}

/**
 * Форматирует время в относительном формате
 * @param {number} ms время, прошедшее с момента в прошлом (в миллисекундах)
 * @returns строку с отформатированным временем
 */
export function timeago(ms) {
  if (ms >= YEAR) return `${Math.floor(ms / YEAR)}г`
  else if (ms >= MONTH) return `${Math.floor(ms / MONTH)}мес`
  else if (ms >= WEEK) return `${Math.floor(ms / WEEK)}н`
  else if (ms >= DAY) return `${Math.floor(ms / DAY)}д`
  else if (ms >= HOUR) return `${Math.floor(ms / HOUR)}ч`
  else if (ms >= MINUTE) return `${Math.floor(ms / MINUTE)}м`
  else return 'сейчас'
}
