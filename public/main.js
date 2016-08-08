/* global hterm lib */
// vim: ts=2
//
// https://chromium.googlesource.com/apps/libapps/+/master/hterm/doc/embed.md
// https://developer.mozilla.org/en-US/docs/Web/API/WebSocket
//
var main = main || (function () {
  'use strict'

  var WSURL = window.location.origin.replace(/^http/, 'ws')
  var terminal

  function Command (ws, args) {
    // args: {argString,io,environment,onExit}
    this.args = args
    this.ws = ws
  }

  Command.prototype.run = function () {
    var self = this
    this.args.io.onVTKeystroke = function (str) {
      self.ws.sendJSON({str: str})
    }
    this.args.io.sendString = function (str) {
      self.ws.sendJSON({str: str})
    }
    this.args.io.onTerminalResize = function (col, row) {
      self.ws.sendJSON({resize: {col: col, row: row}})
    }
  }

  function createWebsocket () {
    console.log('create new websocket %s', WSURL)
    var ws = new window.WebSocket(WSURL)

    ws.sendJSON = function (obj) {
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify(obj))
      }
    }

    ws.onopen = function () {
      console.log('ws.onopen evt')
      terminal.reset()
      terminal.runCommandClass(Command.bind({}, ws))
      ws.sendJSON({resize: {
        col: terminal.screenSize.width,
        row: terminal.screenSize.height
      }})
    }

    ws.onmessage = function (event) {
      var msg = JSON.parse(event.data).str
      terminal.io.writeUTF16(msg)
    }

    // Close events can be sent multiple times. Avoid creating multiple ws.
    ws.onclose = (function () {
      var timer
      return function (event) {
        console.log('ws.onclose evt, code:%s reason:%s ', event.code, event.reason)
        // terminal.showOverlay('ws.onclose evt')
        clearTimeout(timer)
        timer = setTimeout(function () {
          createWebsocket()
        }, 2500)
      }
    })()

    ws.onerror = function (err) {
      console.error(err.message)
    }
  }

  lib.init(function () {
    hterm.defaultStorage = new lib.Storage.Memory()
    terminal = new hterm.Terminal()
    terminal.decorate(document.getElementById('terminal'))

    terminal.onTerminalReady = function () {
      console.info('terminal ready')
      terminal.prefs_.set('ctrl-c-copy', true)
      terminal.prefs_.set('ctrl-v-paste', true)
      terminal.prefs_.set('use-default-window-copy', true)
      terminal.prefs_.set('cursor-blink', true)
      terminal.prefs_.set('cursor-blink-cycle', [500, 500])
      terminal.setCursorPosition(0, 0)
      terminal.setCursorVisible(true)
      createWebsocket()
    }
  })

  return {
    clearClipboard: function () {
      document.getElementById('clipboard').value = ''
    },
    submitClipboard: function () {
      var cmd = document.getElementById('clipboard').value
      terminal.io.sendString(cmd + '\r')
      this.clearClipboard()
    }
  }
})()
