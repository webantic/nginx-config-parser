const parser = require('./lib/parser')

if (typeof window !== 'undefined') window.NginxParser = parser

module.exports = parser
