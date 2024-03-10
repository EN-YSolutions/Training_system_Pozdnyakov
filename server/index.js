import dotenv from 'dotenv'
import { readFileSync, statSync, existsSync } from 'fs'
import { resolve as resolvePath } from 'path'
import { createServer } from 'https'
import { WebSocketServer } from 'ws'
import express from 'express'
import { QueryTypes, Sequelize } from 'sequelize'
import * as sass from 'sass'
import bodyParser from 'body-parser'
import cookieParser from 'cookie-parser'
import compression from 'compression'
import { createHash } from 'crypto'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import Identicon from 'identicon.js'
import multer from 'multer'
import * as Misc from './Misc.js'

console.log(`Creating process with PID ${process.pid}`)
dotenv.config() // загружаем переменные окружения

const HOST = process.env.HOST
const PORT = process.env.PORT

// поднимаем сервер
const app = express()
const server = createServer({
  cert: readFileSync(process.env.SSL_CRT),
  key: readFileSync(process.env.SSL_KEY)
}, app)
app.use(bodyParser.json())
app.use(bodyParser.urlencoded({ extended: true }))
app.use(cookieParser())
app.use(compression())
server.listen(PORT, HOST, () => console.log(`Listening on https://${HOST}:${PORT}/`))

// готовим обработчик загружаемых файлов
const uploader = multer({ dest: './attachments' })

// подключаемся к базе
const db = new Sequelize(process.env.DB_NAME, process.env.DB_USER, process.env.DB_PASS, {
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  dialect: 'postgres',
  logging: (msg) => console.log(new Date(), msg)
})

// запрещаем страницам api кешироваться
app.all('/api/*', (_, res, next) => {
  res.header('cache-control', 'no-cache')
  next()
})

// регистрация пользователя
app.post('/api/register', async (req, res) => {
  if (typeof req.cookies['auth-token'] !== 'undefined') return res.sendStatus(403)

  const { username, password, real_name, remember } = req.body
  if ([username, password, real_name].some(s => typeof s === 'undefined'))
    return res.status(400).send({ message: 'Некоторые данные не введены!' })

  const do_remember = typeof remember !== 'undefined'
  const hash = bcrypt.hashSync(password, +process.env.SALT_ROUNDS)
  // после проверок записываем в базу
  const [[{ id }], inserted] = await db.query(`insert into users (login, "password", "name") values (?) on conflict (login) do nothing returning id;`, {
    replacements: [[username, hash, real_name]],
    type: QueryTypes.INSERT
  })

  if (inserted === 0) return res.status(400).send({ message: 'Этот логин уже занят!' })

  // создаем токен
  const token = jwt.sign(
    { sub: id, iat: Math.floor(Date.now() / 1000) },
    process.env.JWT_SECRET,
    { algorithm: 'HS256', expiresIn: do_remember ? '30d' : '1d' }
  )
  // отдаем результат в куки
  res.cookie('auth-token', token, {
    secure: true,
    httpOnly: true,
    maxAge: do_remember ? Misc.MONTH : undefined,
    domain: process.env.COOKIE_DOMAIN
  }).status(200).send({})
})

// вход в аккаунт
app.post('/api/login', async (req, res) => {
  if (typeof req.cookies['auth-token'] !== 'undefined') return res.sendStatus(403)

  const { username, password, remember } = req.body
  if ([username, password].some(s => typeof s === 'undefined'))
    return res.status(400).send({ message: 'Некоторые данные не введены!' })

  // пытаемся получить данные и заодно проводим проверки
  const do_remember = typeof remember !== 'undefined'
  const data = (await db.query(`select id, "password" from users where login = ?;`, {
    replacements: [username],
    type: QueryTypes.SELECT
  }))[0]
  if (typeof data === 'undefined') return res.status(404).send({ message: 'Ошибка в логине или пароле!' })
  const test = bcrypt.compareSync(password, data.password)
  if (test === false) return res.status(401).send({ message: 'Ошибка в логине или пароле!' })

  // создаем токен
  const token = jwt.sign(
    { sub: data.id, iat: Math.floor(Date.now() / 1000) },
    process.env.JWT_SECRET,
    { algorithm: 'HS256', expiresIn: do_remember ? '30d' : '1d' }
  )
  // отдаем в куки
  res.cookie('auth-token', token, {
    secure: true,
    httpOnly: true,
    maxAge: do_remember ? Misc.MONTH : undefined,
    domain: process.env.COOKIE_DOMAIN
  }).status(200).send({})
})

// выход из аккаунта
app.get('/logout', async (req, res) => {
  res.header('cache-control', 'no-cache')
  if (typeof req.cookies['auth-token'] === 'undefined') return res.redirect(303, '/')

  // проверяем токен
  const token_data = await Misc.resolveJWT(req.cookies['auth-token'])
  if (token_data === null) return res.redirect(303, '/')
  if (Date.now() > token_data.exp * 1000) return res.redirect(303, '/')

  res.cookie('auth-token', 'deleted', { maxAge: -1 }).redirect(303, '/')
})

// данные пользователя
app.get('/api/@me', async (req, res) => {
  if (typeof req.cookies['auth-token'] === 'undefined') return res.sendStatus(401)

  // проверяем токен
  const token_data = await Misc.resolveJWT(req.cookies['auth-token'])
  if (token_data === null) return res.status(401).send({ message: 'Токен имеет недействительную подпись!' })
  if (Date.now() > token_data.exp * 1000) return res.status(401).send({ message: 'Срок действия токена истек!' })

  // получаем данные 
  const data = (await db.query(`select id, login, "name" from users where id = ?;`, {
    replacements: [token_data.sub],
    type: QueryTypes.SELECT
  }))[0]
  if (typeof data === 'undefined') return res.status(404).send({ message: 'Пользователь не существует!' })

  // отдаем результат
  res.status(200).send({
    ...data,
    avatar: createHash('sha256').update(data.id).digest('hex'),
    // тикет нужен для подключения по вебсокету,
    // потому что он авторизует (sic!) запрос
    ticket: jwt.sign(
      { sub: data.id, iat: Math.floor(Date.now() / 1000) },
      process.env.JWT_SECRET,
      { algorithm: 'HS256', expiresIn: '10s' }
    )
  })
})

// todo: загрузка файлов
app.put('/api/attach', uploader.array('files'), async (req, res) => {
  if (typeof req.cookies['auth-token'] === 'undefined') return res.sendStatus(401)

  const token_data = await Misc.resolveJWT(req.cookies['auth-token'])
  if (token_data === null) return res.status(401).send({ message: 'Токен имеет недействительную подпись!' })
  if (Date.now() > token_data.exp * 1000) return res.status(401).send({ message: 'Срок действия токена истек!' })

  res.sendStatus(503)
})

// генерим иконки на сервере, чтобы этим не занимался клиент
app.get('/avatars/:hash', (req, res) => {
  const { hash } = req.params
  try {
    const icon = new Identicon(hash, { format: 'svg' })
    res.status(200)
    .header('content-type', 'image/svg+xml')
    .send(icon.render().getDump())
  } catch (err) {
    res.sendStatus(404)
  }
})

// вешаем мидлварь с проверкой аутентификации
app.get('/', (req, res, next) => {
  if (typeof req.cookies['auth-token'] !== 'undefined') return res.redirect(303, '/chat')
  next()
})
app.get('/chat/', (req, res, next) => {
  if (typeof req.cookies['auth-token'] === 'undefined') return res.redirect(303, '/')
  next()
})

// компилим scss на лету
app.get('/*.scss', (req, res) => {
  const path = resolvePath(`../client${req.path}`)
  if (!existsSync(path)) return res.sendStatus(404)
  const compiled = sass.compile(path, { style: 'compressed' })
  res.status(200).setHeader('content-type', 'text/css')
  res.send(compiled.css)
})

// раздаем остальные файлы (но вообще это должен делать нжинкс или апач)
app.get('/*', (req, res) => {
  try {
    if (req.path.match(/\/[a-z\d_]+$/i) && statSync(`../client${req.path}`).isDirectory)
      return res.redirect(301, req.path + '/')
  } catch (err) {
    res.sendStatus(404)
  }

  if (req.path.match(/\/$/))
    res.status(200).sendFile(resolvePath(`../client${req.path}/index.html`), err => Misc.handleSendFileErrors(err, res))
  else
    res.status(200).sendFile(resolvePath(`../client${req.path}`), err => Misc.handleSendFileErrors(err, res))
})

// поднимаем сервер для вебсокетов на базе существующего
const ws = new WebSocketServer({ server, path: '/ws' })
ws.on('connection', con => {
  // обрабатываем входящие сообщения
  con.on('message', async raw => {
    // парсим данные
    const data = JSON.parse(raw.toString())
    console.log(data)

    switch (data.event) { // обрабатываем события по их названиям
      case 'HANDSHAKE': { // запрос на подключение
        // проверяем тикет
        const token_data = await Misc.resolveJWT(data.ticket)
        if (token_data === null) return con.close(0x1000)
        if (Date.now() > token_data.exp * 1000) return con.close(0x1001)
        if (token_data.sub !== data.id) return con.close(0x1002)
        con._USERID = token_data.sub // запоминаем айди пользователя в объекте подключения

        // получаем фид
        // запрос тут огромный, поэтому отформатируем конкатом
        const channels = await db.query(String.prototype.concat(
          `select `,
            `chan.id id,`,
            `chan.title,`,
            `encode(sha256(convert_to(chan.id::text, 'UTF-8')), 'hex') avatar,`,
            `msg.id message_id,`,
            `msg.contents,`,
            `coalesce(msg.created_at, '-Infinity') created_at,`,
            `usr.id author,`,
            `usr."name" username,`,
            `(select count(1) from messages where created_at > coalesce((select last_view from acknowledgements where "user" = ? and channel = chan.id), 'epoch') and channel = chan.id)::int unread `,
          `from channels chan `,
          `left join lateral (select * from messages where channel = chan.id order by id desc limit 1) msg on msg.channel = chan.id `,
          `left join lateral (select * from users where id = msg.author) usr on usr.id = msg.author `,
          `where is_static order by created_at desc, title asc;`
        ), {
          replacements: [con._USERID],
          type: QueryTypes.SELECT
        })
        con.send(JSON.stringify({
          event: 'FEED',
          feed: channels
        }))
        break
      }
      case 'CHANNEL': { // пользователь открыл канал
        // собираем сообщения
        const messages = await db.query(`select *, (select "name" from users where id = author) author, encode(sha256(convert_to(author::text, 'UTF-8')), 'hex') avatar from messages where channel = ? order by created_at desc, id desc limit 50;`, {
          replacements: [data.channel_id],
          type: QueryTypes.SELECT
        })
        // разворачиваем сообщения, чтобы новые были внизу
        // почему бы не поменять desc на asc в запросе? -
        // потому что потом замучаешься офсеты считать
        messages.reverse()
        con.send(JSON.stringify({
          event: 'CHANNEL',
          messages
        }))
        break
      }
      case 'MESSAGE': { // было отправлено сообщение
        const message = (await db.query(`insert into messages (channel, author, contents) values (?) returning *, (select "name" from users where id = author);`, {
          replacements: [[data.channel_id, con._USERID, data.text]],
          type: QueryTypes.INSERT
        }))[0][0]
        // одним ивентом возвращаем айди и таймштамп сообщения пользователю
        // (оно у него висит в пендинге, не забываем)
        con.send(JSON.stringify({
          event: 'MESSAGE',
          id: message.id,
          created_at: message.created_at,
          ticket: data.ticket
        }))
        // всем остальным рассылаем другой ивент, чтобы сообщение появилось в принципе
        ;[...ws.clients].forEach(f => {
          if (f._USERID === con._USERID) return // кроме автора, разумеется
          f.send(JSON.stringify({
            event: 'NEW_MESSAGE',
            ...message,
            avatar: createHash('sha256').update(message.author).digest('hex'),
            author: message.name
          }))
        })
        break
      }
      case 'RAW_MESSAGE': { // пользователь хочет изменить сообщение, и ему нужен исходный код
        const message = (await db.query('select id, channel, contents from messages where id = ?;', {
          replacements: [data.message],
          type: QueryTypes.SELECT
        }))[0]
        con.send(JSON.stringify({
          event: 'RAW_MESSAGE',
          ...message
        }))
        break
      }
      case 'DELETE': { // пользователь удалил сообщение
        if (data.type !== 'MESSAGE') return
        await db.query(`delete from messages where id = ?;`, {
          replacements: [data.target],
          type: QueryTypes.DELETE
        })
        ;[...ws.clients].forEach(f => {
          f.send(JSON.stringify(data))
        })
        break
      }
      case 'EDIT': { // пользователь изменил сообщение
        if (data.type !== 'MESSAGE') return
        await db.query(`update messages set contents = ?, edited_at = current_timestamp where id = ?;`, {
          replacements: [data.text, data.target],
          type: QueryTypes.UPDATE
        })
        ;[...ws.clients].forEach(f => {
          f.send(JSON.stringify(data))
        })
        break
      }
      case 'MEMBERS': { // пользователь хочет посмотреть список участников канала
        const members = await db.query(`select us.id, us."name", encode(sha256(convert_to(us.id::text, 'UTF-8')), 'hex') avatar, us."role", cm.joined_at, (select count(1)::int from messages ms where ms.author = us.id and ms.channel = :id) messages from channel_members cm inner join users us on us.id = cm."user" where cm.channel = :id;`, {
          replacements: { id: data.channel },
          type: QueryTypes.SELECT
        })
        con.send(JSON.stringify({
          event: 'MEMBERS',
          members
        }))
      }
      case 'ACKNOWLEDGEMENT': { // пользователь прочитал канал
        await db.query(`insert into acknowledgements ("user", channel) values (?) on conflict ("user", channel) do update set last_view = current_timestamp;`, {
          replacements: [[con._USERID, data.channel]],
          type: QueryTypes.UPDATE
        })
        con.send(JSON.stringify({
          event: 'ACKNOWLEDGEMENT',
          ok: '' // сомнительно, но окэй
        }))
      }
    }
  })
})
