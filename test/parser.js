'use strict'

const chai = require('chai')
const should = chai.should()

const Parser = require('../lib/parser')
const parser = new Parser()


describe('toJSON', () => {
  it('stores directives as key/value pairs', () => {
    const configString = 'listen 80;'
    parser.toJSON(configString).should.deep.equal({listen: '80'})
  })

  it('can handle directives with no value', () => {
    const configString = 'ip_hash;'
    parser.toJSON(configString).should.deep.equal({ip_hash: ''})
  })

  it('should convert blocks to sub-objects', () => {
    const configString = ['server {',
                          '}'].join('\n')
    parser.toJSON(configString).should.deep.equal({server: {}})
  })

  it('should support nested directives', () => {
    const configString = ['server {',
                          '  listen 443;',
                          '}'].join('\n')
    parser.toJSON(configString).should.deep.equal({server: {listen: '443'}})
  })

  it('should support deep nesting', () => {
    const configString = ['server {',
                          '  location / {',
                          '    proxy_pass http://127.0.0.1:3000;',
                          '  }',
                          '}'].join('\n')
    parser.toJSON(configString).should.deep.equal({server: {'location /': { proxy_pass: 'http://127.0.0.1:3000' }}})
  })

  it('should store all values for same-named directives', () => {
    const configString = ['upstream my_upstream {',
                          '  server 127.0.0.1:3000;',
                          '  server 127.0.0.1:3001;',
                          '  server 127.0.0.1:3002;',
                          '}'].join('\n')
    const result = parser.toJSON(configString)
    result['upstream my_upstream'].server.should.be.an.instanceof(Array)
    result['upstream my_upstream'].server.should.include('127.0.0.1:3000')
    result['upstream my_upstream'].server.should.include('127.0.0.1:3001')
    result['upstream my_upstream'].server.should.include('127.0.0.1:3002')
  })
})


describe('toConf', () => {
  it('outputs key/value pairs on one line', () => {
    const json = {listen: '80'}
    parser.toConf(json).should.equal('listen    80;\n')
  })

  it('converts objects to config blocks', () => {
    const json = {server: {}}
    const result = parser.toConf(json)
    result.should.contain('server {')
    result.should.contain('}')
  })
})

describe('parse', () => {
  it('should be reversable', () => {
    const json = {listen: '80'}
    const configString = parser.parse(json)
    parser.parse(configString).should.deep.equal(json)
  })

  it('should be repeatable', () => {
    const originalJson = {listen: '80'}
    let json = originalJson
    const originalConfigString = parser.parse(json)
    let configString = originalConfigString
    let flipper = originalJson

    for (let i = 0; i < 10; i++) {

      configString = parser.parse(originalJson)
      configString.should.equal(originalConfigString)

      json = parser.parse(originalConfigString)
      json.should.deep.equal(originalJson)

      flipper = parser.parse(flipper)
      if (isOdd(i)) flipper.should.deep.equal(originalJson)
      else flipper.should.equal(originalConfigString)
    }
  })
})


const isOdd = (val) => val%2
