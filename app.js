// vim: ts=2
// https://github.com/websockets/ws/blob/master/doc/ws.md
'use strict'
const fs = require('fs')
const https = require('https')
const os = require('os')
const path = require('path')
const util = require('util')
//
const WSserver = require('ws').Server
const auth = require('http-auth')
const compression = require('compression')
const express = require('express')
const helmet = require('helmet')
const morgan = require('morgan')
const pty = require('ptyw.js')

const key = fs.readFileSync('./key.pem')
const cert = fs.readFileSync('./cert.pem')
const port = parseInt(process.argv[2]) || parseInt(process.env.PORT) || 443

function log () {
  console.log('%s - %s', new Date().toISOString(),
    util.format.apply(null, arguments))
}

if ((os.platform() === 'linux' || port < 1024) && process.geteuid() !== 0) {
  log('Error: must run as root')
  process.exit(1)
}

const login = ['/bin/login', '/usr/bin/login'].find(function (name) {
  try {
    fs.accessSync(name, fs.X_OK)
    return true
  } catch (e) {}
})

process.title = 'weblogin'
process.on('SIGTERM', process.exit)
process.on('SIGINT', process.exit)

//
// app
//
const app = express()
app.use(helmet())
app.use(compression())
app.use(morgan('dev'))
app.use(auth.connect(auth.basic({
  realm: 'WebLogin',
  file: './.htpasswd'
})))
app.use(express.static(path.join(__dirname, 'public')))
app.get('/', function (req, res) {
  res.sendfile(path.join(__dirname, 'public/index.html'))
})

//
// server
//
const server = https.createServer({
  key: key,
  cert: cert
}, app)
.on('error', function (err) {
  log('server error:', err)
})
.listen(port, function () {
  log('listening on port:', port)
})

//
// wss
//
const wss = new WSserver({server: server})

wss.on('connection', function (ws, req) {
  const term = pty.spawn(login, [], {
    name: 'xterm-color',
    cols: 80,
    rows: 30
  })

  log('%s : wss connection evt PTY=%s IP=%s', term.pid, term.pty, req.connection.remoteAddress)

  term.on('data', function (data) {
    // send data to client
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify({str: data}))
    } else {
      log('%s : Warning: ws not open', term.pid)
    }
  })

  term.on('exit', function (code) {
    // client closed shell session
    log('%s : term exit evt (%s)', term.pid, code)
    ws.terminate()
  })

  term.on('close', function () {
    log('%s : term close evt', term.pid)
    ws.terminate()
  })

  term.on('error', function (err) {
    if (err.code === 'EIO' && err.errno === 'EIO' && err.syscall === 'read') {
      // ignore error on close evt
    } else {
      log('%s : error:%s pid:%s', err, term.pid)
    }
    ws.terminate()
  })

  ws.on('message', function (data, flags) {
    // input received from client
    var obj = {}
    try {
      obj = JSON.parse(data)
    } catch (err) {
      log('%s : parse error:', term.pid, err)
    }
    if (obj.str) {
      term.write(obj.str)
    }
    if (obj.resize) {
      term.resize(obj.resize.col, obj.resize.row)
    }
  })

  ws.on('close', function () {
    // client closed socket connection
    log('%s : ws close evt', term.pid)
    term.destroy()
    ws.terminate()
  })

  ws.on('error', function (err) {
    log('%s : error:', term.pid, err.stack)
  })
})

wss.on('error', function (err) {
  log('wss error:', err.stack)
})
