// vim: ts=2
// https://github.com/websockets/ws/blob/master/doc/ws.md
'use strict'
const fs = require('fs')
const https = require('https')
const path = require('path')
const util = require('util')
const os = require('os')
//
const WSserver = require('ws').Server
const auth = require('http-auth')
const compression = require('compression')
const express = require('express')
const helmet = require('helmet')
const morgan = require('morgan')
const pty = require('pty.js')

const cfg = require('./config.json')
const port = process.argv[2] ? parseInt(process.argv[2], 10) : cfg.port

function log () {
  console.log('%s - %s', new Date().toISOString(),
    util.format.apply(util.format, arguments))
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

process.title = cfg.procName

process.on('uncaughtException', function (err) {
  log('uncaughtException: ' + err.stack)
})

//
// app
//
const app = express()
app.use(helmet())
app.use(compression())
app.use(morgan('dev'))
app.use(auth.connect(auth.basic({
  realm: cfg.realm,
  file: cfg.htpasswd
})))
app.use(express.static(path.join(__dirname, 'public')))
app.get('/', function (req, res) {
  res.sendfile(__dirname + 'public/index.html')
})

//
// server
//
const server = https.createServer({
  key: fs.readFileSync(cfg.sslKey),
  cert: fs.readFileSync(cfg.sslCert)
}, app)
.on('error', function (err) {
  console.log('server error:', err)
})
.listen(port, function (err) {
  log('listening on port:', port)
})

//
// wss
//
const wss = new WSserver({server: server})

wss.on('connection', function (ws) {
  const term = pty.spawn(login, [], {
    name: 'xterm-color',
    cols: 80,
    rows: 30
  })

  log('%s : wss connection evt PTY=%s IP=%s', term.pid, term.pty,
      ws.upgradeReq.connection.remoteAddress)

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
    // todo
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
