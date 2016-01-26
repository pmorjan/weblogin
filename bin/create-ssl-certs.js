#!/usr/bin/env node
// node.js alternative to
//   openssl req -x509 -newkey rsa:2048 -keyout key.pem -out cert.pem -days 30000 -nodes
//
'use strict'
console.time('gen ssl keys')
const fs = require('fs')
const forge = require('node-forge')

let keyFile = './key.pem'
let certFile = './cert.pem'

let keypair
try {
  // try OpenSSL bindings if available
  let pair = require('ursa').generatePrivateKey()
  keypair = {
    public: pair.toPublicPem('utf8'),
    private: pair.toPrivatePem('utf8')
  }
} catch (err) {
  // fallback to native JS (Raspberry Pi: 15 min)
  console.log('fallback to native JS...')
  let pair = forge.rsa.generateKeyPair(2048)
  keypair = {
    public: forge.pki.publicKeyToPem(pair.publicKey),
    private: forge.pki.privateKeyToPem(pair.privateKey)
  }
}

// create certificate
// https://github.com/digitalbazaar/forge#x509
let cert = forge.pki.createCertificate()
cert.serialNumber = String(Math.floor(Math.random() * 10e8) + 1)
cert.validity.notBefore = new Date()
cert.validity.notAfter = new Date()
cert.validity.notAfter.setFullYear(cert.validity.notAfter.getFullYear() + 1)

let attrs = [{
  name: 'commonName',
  value: 'example.org'
}, {
  name: 'countryName',
  value: 'US'
}, {
  shortName: 'ST',
  value: 'Virginia'
}, {
  name: 'localityName',
  value: 'Blacksburg'
}, {
  name: 'organizationName',
  value: 'Test'
}, {
  shortName: 'OU',
  value: 'Test'
}]

cert.setSubject(attrs)
cert.setIssuer(attrs)

cert.publicKey = forge.pki.publicKeyFromPem(keypair.public)
cert.sign(forge.pki.privateKeyFromPem(keypair.private), forge.md.sha256.create())
let certPem = forge.pki.certificateToPem(cert)

try {
  fs.unlinkSync(keyFile)
  fs.unlinkSync(certFile)
} catch (err) {
  if (err.code !== 'ENOENT') {
    throw err
  }
}

fs.writeFileSync(keyFile, keypair.private, {mode: 0o400})
fs.writeFileSync(certFile, certPem, {mode: 0o400})

console.log('cert written to %s %s', keyFile, certFile)
console.timeEnd('gen ssl keys')

