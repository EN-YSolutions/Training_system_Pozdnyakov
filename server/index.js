import dotenv from 'dotenv'
import { readFileSync, existsSync, mkdirSync, rmSync } from 'fs'
import { exec } from 'child_process'
import { resolve as resolvePath } from 'path'
import { createServer } from 'http'
import { WebSocketServer } from 'ws'
import express from 'express'
import { QueryTypes, Sequelize } from 'sequelize'
import * as sass from 'sass'
import bodyParser from 'body-parser'
import cookieParser from 'cookie-parser'
import compression from 'compression'
import { createHash, createHmac } from 'crypto'
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
const server = createServer(app)
app.use(bodyParser.json())
app.use(bodyParser.urlencoded({ extended: true }))
app.use(cookieParser())
app.use(compression())
server.listen(PORT, HOST, () => console.log(`Listening on local port ${PORT}`))

const UPLOAD_BASEPATH = './attachments'
// готовим обработчик загружаемых файлов
const uploader = multer({
  storage: new multer.diskStorage({
    destination(req, file, cb) {
      const hash = createHmac('sha256', Date.now().toString()).update(file.originalname).digest('hex')
      const path = resolvePath(`${UPLOAD_BASEPATH}/${hash[0]}/${hash.slice(0, 2)}`)
      file.hash = hash
      if (!existsSync(path)) mkdirSync(path, { recursive: true })
      cb(null, path)
    }, 
    filename(req, file, cb) {
      const ext = file.originalname.match(/\.\w+$/)?.[0] ?? ''
      cb(null, file.hash + ext)
    }
  }),
  limits: {
    files: 10
  }
})

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

  res.cookie('auth-token', 'deleted', { maxAge: -1, secure: true, httpOnly: true, domain: process.env.COOKIE_DOMAIN })
    .redirect(303, '/')
})

// данные пользователя
app.get('/api/@me', async (req, res) => {
  if (typeof req.cookies['auth-token'] === 'undefined') return res.sendStatus(401)
  const t = new Misc.Timer(res)

  // проверяем токен
  const token_data = await Misc.resolveJWT(req.cookies['auth-token'])
  t.lap('jwt', 'Token check')
  if (token_data === null) return res.status(401).send({ message: 'Токен имеет недействительную подпись!' })
  if (Date.now() > token_data.exp * 1000) return res.status(401).send({ message: 'Срок действия токена истек!' })

  // получаем данные 
  const data = (await db.query(`select id, login, "name", "role" from users where id = ?;`, {
    replacements: [token_data.sub],
    type: QueryTypes.SELECT
  }))[0]
  t.lap('db', 'Database query')
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

app.post('/api/attach', uploader.single('file'), async (req, res) => {
  if (typeof req.cookies['auth-token'] === 'undefined') return res.sendStatus(401)

  const token_data = await Misc.resolveJWT(req.cookies['auth-token'])
  if (token_data === null) return res.status(401).send({ message: 'Токен имеет недействительную подпись!' })
  if (Date.now() > token_data.exp * 1000) return res.status(401).send({ message: 'Срок действия токена истек!' })

  const { filename } = req.file
  const data = (await db.query('insert into attachments (type, file_name) values (?) returning id, file_name;', {
    replacements: [['file', filename]],
    type: QueryTypes.SELECT
  }))[0]

  res.status(200).send({ ...data })
})
app.delete('/api/attach', async (req, res) => {
  if (typeof req.cookies['auth-token'] === 'undefined') return res.sendStatus(401)

  const token_data = await Misc.resolveJWT(req.cookies['auth-token'])
  if (token_data === null) return res.status(401).send({ message: 'Токен имеет недействительную подпись!' })
  if (Date.now() > token_data.exp * 1000) return res.status(401).send({ message: 'Срок действия токена истек!' })

  const data = (await db.query('delete from attachments where id = ? returning file_name;', {
    replacements: [req.body.id],
    type: QueryTypes.DELETE
  }))[0]
  const f = data?.file_name
  if (typeof f !== 'undefined') {
    rmSync(`${UPLOAD_BASEPATH}/${f[0]}/${f.slice(0, 2)}/${f}`)
    exec(`find ${resolvePath(UPLOAD_BASEPATH)} -type d -empty -delete`)
  }
  res.sendStatus(200)
})

app.get('/api/notifs', async (req, res) => {
  if (typeof req.cookies['auth-token'] === 'undefined') return res.sendStatus(401)

  const token_data = await Misc.resolveJWT(req.cookies['auth-token'])
  if (token_data === null) return res.status(401).send({ message: 'Токен имеет недействительную подпись!' })
  if (Date.now() > token_data.exp * 1000) return res.status(401).send({ message: 'Срок действия токена истек!' })

  const data = await db.query('select * from notifications where user_id = ? order by created_at desc limit 5;', {
    replacements: [token_data.sub],
    type: QueryTypes.SELECT
  })
  res.status(200).send(data)
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

// поднимаем сервер для вебсокетов на базе существующего
const ws = new WebSocketServer({ server, path: '/ws' })
ws.on('connection', con => {
  // попытка в защиту от некоторых хитровыдуманных
  const hs_timer = setTimeout(() => con.close(0x100f), 1000)

  // обрабатываем входящие сообщения
  con.on('message', async raw => {
    // парсим данные
    const data = JSON.parse(raw.toString())
    console.log(data)

    switch (data.event) { // обрабатываем события по их названиям
      case 'HANDSHAKE': { // запрос на подключение
        clearTimeout(hs_timer)
        // проверяем тикет
        const token_data = await Misc.resolveJWT(data.ticket)
        if (token_data === null) return con.close(0x1000)
        if (Date.now() > token_data.exp * 1000) return con.close(0x1001)
        if (token_data.sub !== data.id) return con.close(0x1002)
        con._USERID = token_data.sub // запоминаем айди пользователя в объекте подключения

        // получаем фид
        const channels = await db.query(`select * from get_feed(?::uuid);`, {
          replacements: [con._USERID],
          type: QueryTypes.SELECT
        })
        con.send(JSON.stringify({
          event: 'FEED',
          feed: channels
        }))
        for (const client of ws.clients) {
          if (client._USERID === con._USERID) continue
          client.send(JSON.stringify({
            event: 'PRESENCE',
            online: true,
            user: con._USERID
          }))
        }
        break
      }
      case 'CHANNEL': { // пользователь открыл канал
        // собираем сообщения
        const messages = await db.query([
          `select msg.*,`,
            `(select "name" from users where id = author),`,
            `id2hash(author) avatar,`,
            `array_agg(array[atc.id::varchar, atc.file_name]) attachments`,
          `from messages msg`,
          `left join attachments atc on atc.message = msg.id`,
          `where channel = ?`,
          `group by msg.id`,
          `order by msg.created_at desc, msg.id desc limit 50;`
        ].join(' '), {
          replacements: [data.channel_id],
          type: QueryTypes.SELECT
        })
        messages.forEach(e => {
          const a = e.attachments
          if (a.length === 1 && a[0].every(e => e === null)) e.attachments = []
          else e.attachments = a.map(m => ({ id: m[0], filename: m[1] }))
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
        const mentions = Array.from(data.text.matchAll(/(?:^|[ -\/:-@\[-`\{-~])@(\w+)\b/g)).map(m => m[1])
        console.log('mentions', mentions)
        if (mentions.length) {
          const notif = (await db.query('select * from send_notifs(?, ?, array[?]);', {
            replacements: [con._USERID, data.channel_id, mentions],
            type: QueryTypes.SELECT
          }))[0]
          const targets = notif.targets
          delete notif.targets
          for (const client of ws.clients) {
            if (!targets.includes(client._USERID)) continue
            client.send(JSON.stringify({
              event: 'NOTIFICATION',
              ...notif
            }))
          }
        }

        if (data.attachments.length) db.query('update attachments set message = ? where id in (?);', {
          replacements: [message.id, data.attachments.map(m => m.id)],
          type: QueryTypes.INSERT
        })

        // тем же ивентом подтверждаем пользователю отправку
        // (оно у него висит в пендинге, не забываем)
        con.send(JSON.stringify({
          event: 'MESSAGE',
          ...data,
          ...message
        }))
        // всем остальным рассылаем другой ивент, чтобы сообщение появилось в принципе
        for (const client of ws.clients) {
          if (client._USERID === con._USERID) continue // кроме автора, разумеется
          client.send(JSON.stringify({
            event: 'NEW_MESSAGE',
            ...message,
            avatar: createHash('sha256').update(message.author).digest('hex'),
            author: con._USERID,
            attachments: data.attachments
          }))
        }
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
      case 'PREVIEW_MESSAGE': {
        const message = (await db.query([
          `select msg.*,`,
            `(select "name" from users where id = author),`,
            `id2hash(author) avatar,`,
            `array_agg(array[atc.id::varchar, atc.file_name]) attachments`,
          `from messages msg`,
          `left join attachments atc on atc.message = msg.id`,
          `where msg.id = ?`,
          `group by msg.id;`
        ].join(' '), {
          replacements: [data.target],
          type: QueryTypes.SELECT
        }))[0]
        if (message.attachments.length === 1 && message.attachments[0].every(e => e === null))
          message.attachments = []
        else message.attachments = message.attachments.map(m => ({ id: m[0], filename: m[1] }))
        con.send(JSON.stringify({
          event: 'PREVIEW_MESSAGE',
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
        const { is_static } = (await db.query('select is_static from channels where id = ?;', {
          replacements: [data.channel],
          type: QueryTypes.SELECT
        }))[0]
        const query = String.prototype.concat(
          `select us.id, us."name", encode(sha256(convert_to(us.id::text, 'UTF-8')), 'hex') avatar, us."role", (select count(1)::int from messages ms where ms.author = us.id and ms.channel = :id) messages`,
          is_static
            ? ` from users us`
            : `, cm.joined_at from channel_members cm inner join users us on us.id = cm."user" where cm.channel = :id`,
          ` order by us."role" desc;`
        )
        const members = await db.query(query, {
          replacements: { id: data.channel },
          type: QueryTypes.SELECT
        })
        con.send(JSON.stringify({
          event: 'MEMBERS',
          members
        }))
        break
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
        break
      }
      case 'SUGGEST_USERS': { // пользователи, которых можно добавить в новый канал
        const users = await db.query(`select id, "name", encode(sha256(convert_to(id::text, 'UTF-8')), 'hex') avatar, "role" from users where id <> ? order by random() limit 10;`, {
          replacements: [con._USERID],
          type: QueryTypes.SELECT
        })
        con.send(JSON.stringify({
          event: 'SUGGESTED_USERS',
          target: data.target,
          users
        }))
        break
      }
      case 'SEARCH_USERS': {
        const users = await db.query(`select id, "name", encode(sha256(convert_to(id::text, 'UTF-8')), 'hex') avatar, "role" from users where id <> ? and "name" ~* ? order by "name" asc;`, {
          replacements: [con._USERID, data.query],
          type: QueryTypes.SELECT
        })
        con.send(JSON.stringify({
          event: 'SEARCHED_USERS',
          users
        }))
        break
      }
      case 'CREATE_CHANNEL': {
        const channel = (await db.query('select * from create_channel(?, array[?]::uuid[]);', {
          replacements: [data.title, data.users],
          type: QueryTypes.SELECT
        }))[0]
        for (const client of ws.clients) {
          if (!data.users.includes(client._USERID)) continue
          client.send(JSON.stringify({
            event: 'NEW_CHANNEL',
            channel
          }))
        }
        break
      }
      case 'CREATE_DM': {
        const users = [con._USERID, data.peer]
        const dm = (await db.query('select * from create_dm(?::uuid, ?::uuid);', {
          replacements: users,
          type: QueryTypes.SELECT
        }))[0]
        console.log(dm)

        const genData = peer_ind => {
          const key = `u${peer_ind}_`
          return {
            event: 'NEW_CHANNEL',
            channel: {
              id: dm.id,
              title: dm[`${key}name`],
              avatar: dm[`${key}avatar`],
              private_id: dm[`${key}id`],
              private_role: dm[`${key}role`]
            }
          }
        }

        const peer = Array.from(ws.clients).find(f => f._USERID === data.peer)
        con.send(JSON.stringify(genData(2)))
        peer.send(JSON.stringify(genData(1)))
        break
      }
      case 'PRESENCE': {
        for (const client of ws.clients) {
          if (client._USERID === con._USERID) continue
          client.send(JSON.stringify({
            ...data,
            user: con._USERID
          }))
        }
        break
      }
      case 'PIN': {
        break
      }
    }
  })
  con.on('close', (code, reason) => {
    console.log(`${con._USERID} disconnected with code ${code}`)
    for (const client of ws.clients) {
      client.send(JSON.stringify({
        event: 'PRESENCE',
        online: false,
        user: con._USERID
      }))
    }
  })
})
