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
dotenv.config()

const HOST = process.env.HOST
const PORT = process.env.PORT

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

const uploader = multer({ dest: './attachments' })
const db = new Sequelize(process.env.DB_NAME, process.env.DB_USER, process.env.DB_PASS, {
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  dialect: 'postgres',
  logging: (msg) => console.log(new Date(), msg)
})

app.all('/api/*', (_, res, next) => {
  res.header('cache-control', 'no-cache')
  next()
})

app.post('/api/register', async (req, res) => {
  if (typeof req.cookies['auth-token'] !== 'undefined') return res.sendStatus(403)

  const { username, password, real_name, remember } = req.body
  if ([username, password, real_name].some(s => typeof s === 'undefined'))
    return res.status(400).send({ message: 'Некоторые данные не введены!' })

  const do_remember = typeof remember !== 'undefined'
  const hash = bcrypt.hashSync(password, +process.env.SALT_ROUNDS)
  const [[{ id }], inserted] = await db.query(`insert into users (login, "password", "name") values (?) on conflict (login) do nothing returning id;`, {
    replacements: [[username, hash, real_name]],
    type: QueryTypes.INSERT
  })

  if (inserted === 0) return res.status(400).send({ message: 'Этот логин уже занят!' })

  const token = jwt.sign(
    { sub: id, iat: Math.floor(Date.now() / 1000) },
    process.env.JWT_SECRET,
    { algorithm: 'HS256', expiresIn: do_remember ? '30d' : '1d' }
  )
  res.cookie('auth-token', token, {
    secure: true,
    httpOnly: true,
    maxAge: do_remember ? Misc.MONTH : undefined,
    domain: process.env.COOKIE_DOMAIN
  }).status(200).send({})
})
app.post('/api/login', async (req, res) => {
  if (typeof req.cookies['auth-token'] !== 'undefined') return res.sendStatus(403)

  const { username, password, remember } = req.body
  if ([username, password].some(s => typeof s === 'undefined'))
    return res.status(400).send({ message: 'Некоторые данные не введены!' })

  const do_remember = typeof remember !== 'undefined'
  const data = (await db.query(`select id, "password" from users where login = ?;`, {
    replacements: [username],
    type: QueryTypes.SELECT
  }))[0]
  if (typeof data === 'undefined') return res.status(404).send({ message: 'Ошибка в логине или пароле!' })
  const test = bcrypt.compareSync(password, data.password)
  if (test === false) return res.status(401).send({ message: 'Ошибка в логине или пароле!' })

  const token = jwt.sign(
    { sub: data.id, iat: Math.floor(Date.now() / 1000) },
    process.env.JWT_SECRET,
    { algorithm: 'HS256', expiresIn: do_remember ? '30d' : '1d' }
  )
  res.cookie('auth-token', token, {
    secure: true,
    httpOnly: true,
    maxAge: do_remember ? Misc.MONTH : undefined,
    domain: process.env.COOKIE_DOMAIN
  }).status(200).send({})
})
app.get('/api/@me', async (req, res) => {
  if (typeof req.cookies['auth-token'] === 'undefined') return res.sendStatus(401)

  const token_data = await Misc.resolveJWT(req.cookies['auth-token'])
  if (token_data === null) return res.status(401).send({ message: 'Токен имеет недействительную подпись!' })
  if (Date.now() > token_data.exp * 1000) return res.status(401).send({ message: 'Срок действия токена истек!' })

  const data = (await db.query(`select id, login, "name" from users where id = ?;`, {
    replacements: [token_data.sub],
    type: QueryTypes.SELECT
  }))[0]
  if (typeof data === 'undefined') return res.status(404).send({ message: 'Пользователь не существует!' })

  res.status(200).send({
    ...data,
    avatar: createHash('sha256').update(data.id).digest('hex'),
    ticket: jwt.sign(
      { sub: data.id, iat: Math.floor(Date.now() / 1000) },
      process.env.JWT_SECRET,
      { algorithm: 'HS256', expiresIn: '10s' }
    )
  })
})
app.put('/api/attach', uploader.array('files'), async (req, res) => {
  if (typeof req.cookies['auth-token'] === 'undefined') return res.sendStatus(401)

  const token_data = await Misc.resolveJWT(req.cookies['auth-token'])
  if (token_data === null) return res.status(401).send({ message: 'Токен имеет недействительную подпись!' })
  if (Date.now() > token_data.exp * 1000) return res.status(401).send({ message: 'Срок действия токена истек!' })

  res.sendStatus(503)
})

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

app.get('/', (req, res, next) => {
  if (typeof req.cookies['auth-token'] !== 'undefined') return res.redirect(303, '/chat')
  next()
})
app.get('/chat/', (req, res, next) => {
  if (typeof req.cookies['auth-token'] === 'undefined') return res.redirect(303, '/')
  next()
})
app.get('/*.scss', (req, res) => {
  const path = resolvePath(`../client${req.path}`)
  if (!existsSync(path)) return res.sendStatus(404)
  const compiled = sass.compile(path, { style: 'compressed' })
  res.status(200).setHeader('content-type', 'text/css')
  res.send(compiled.css)
})
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

const ws = new WebSocketServer({ server, path: '/ws' })
ws.on('connection', con => {
  con.on('message', async raw => {
    const data = JSON.parse(raw.toString())
    console.log(data)

    switch (data.event) {
      case 'HANDSHAKE': {
        const token_data = await Misc.resolveJWT(data.ticket)
        if (token_data === null) return con.close(0x1000)
        if (Date.now() > token_data.exp * 1000) return con.close(0x1001)
        if (token_data.sub !== data.id) return con.close(0x1002)
        con._USERID = token_data.sub

        const channels = await db.query(`select chan.id channel_id, chan.title, encode(sha256(convert_to(chan.id::text, 'UTF-8')), 'hex') avatar, msg.id message_id, msg.contents, coalesce(msg.created_at, '-Infinity') created_at, usr.id author, usr."name" username from channels chan left join lateral (select * from messages where channel = chan.id order by id desc limit 1) msg on msg.channel = chan.id left join lateral (select * from users where id = msg.author) usr on usr.id = msg.author where is_static order by created_at desc, title asc;`, {
          type: QueryTypes.SELECT
        })
        con.send(JSON.stringify({
          event: 'FEED',
          feed: channels
        }))
        break
      }
      case 'CHANNEL': {
        const messages = await db.query(`select *, (select "name" from users where id = author) author, encode(sha256(convert_to(author::text, 'UTF-8')), 'hex') avatar from messages where channel = ? order by created_at desc, id desc limit 50;`, {
          replacements: [data.channel_id],
          type: QueryTypes.SELECT
        })
        messages.reverse()
        con.send(JSON.stringify({
          event: 'CHANNEL',
          messages
        }))
        break
      }
      case 'MESSAGE': {
        const message = (await db.query(`insert into messages (channel, author, contents) values (?) returning *, (select "name" from users where id = author);`, {
          replacements: [[data.channel_id, con._USERID, data.text]],
          type: QueryTypes.INSERT
        }))[0][0]
        con.send(JSON.stringify({
          event: 'MESSAGE',
          id: message.id,
          created_at: message.created_at,
          ticket: data.ticket
        }))
        ;[...ws.clients].forEach(f => {
          if (f._USERID === con._USERID) return
          f.send(JSON.stringify({
            event: 'NEW_MESSAGE',
            ...message,
            avatar: createHash('sha256').update(message.author).digest('hex'),
            author: message.name
          }))
        })
        break
      }
      case 'RAW_MESSAGE': {
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
      case 'DELETE': {
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
      case 'EDIT': {
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
      case 'MEMBERS': {
        const members = await db.query(`select us.id, us."name", encode(sha256(convert_to(us.id::text, 'UTF-8')), 'hex') avatar, us."role", cm.joined_at, (select count(1)::int from messages ms where ms.author = us.id and ms.channel = :id) messages from channel_members cm inner join users us on us.id = cm."user" where cm.channel = :id;`, {
          replacements: { id: data.channel },
          type: QueryTypes.SELECT
        })
        con.send(JSON.stringify({
          event: 'MEMBERS',
          members
        }))
      }
    }
  })
})
