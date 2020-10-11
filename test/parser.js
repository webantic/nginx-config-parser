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

  it('should support dots in keys (like if)', () => {
    const configString = ['server {',
      'if ($host = example.example.com) {',
      'return 301 https://$host$request_uri;',
      '}',
      'server_name example.example.com;',
      '}'].join('\n')
    parser.toJSON(configString).should.deep.equal({server: {
      'if ($host = example.example.com)': {
        'return': '301 https://$host$request_uri'
      },
      'server_name': 'example.example.com'
    }})
  })

  it('should support nested directives', () => {
    const configString = ['server {',
      '  listen 443;',
      '}'].join('\n')
    parser.toJSON(configString).should.deep.equal({server: {listen: '443'}})
  })

  it('should support comment on same line as property line', () => {
    const configString = ['server {',
      '  listen 443; # Managed by cert',
      '} # Managed by cert'].join('\n')
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
  it('should support multiple same-parent nesting', () => {
    const configString = ['server {',
      '  location / {',
      '    proxy_pass http://127.0.0.1:3000;',
      '  }',
      '}',
      'server {',
      '  server_name _;',
      '}'].join('\n')

    parser.toJSON(configString).should.deep.equal({server: [
      {'location /': { proxy_pass: 'http://127.0.0.1:3000' }},
      {server_name: '_'}
    ]})
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
});

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
  it('should not contain [object Object]', () => {
    let json = parser.toJSON(`http { 
      server {
          include mime.types;
          listen 80 default_server;
          server_name localhost;
          location / {
              root /app/www/;
              index index.html;
          }
      }
      server { 
          listen 8080;  
          location / { 
              root /dir/name/
              index index.html;
          } 
      }
    }`);
    let result = parser.toConf(json);
    result.should.not.contain('[object Object]');
  });
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

const isOdd = (val) => val % 2
