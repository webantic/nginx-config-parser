'use strict'

const fs = require('fs')

module.exports = class Parser {
  /**
   * @method resolve
   * @summary Retrieves a value from within an object using a dot-notation path
   * @param obj {Object} The object to search
   * @param path {String} The path to the value
   * @returns The found value, or `undefined`
   * @example
   * 
   *    const myObject = {
   *      foo: {
   *        bar: 'baz'
   *      }
   *    };
   *    resolve(myObject, 'foo.bar') // returns 'baz'
   * 
   */
  resolve (obj, path) {
    return path.split('.').reduce((prev, curr) => {
      return (typeof prev === 'object' && prev) ? prev[ curr ] : undefined
    }, obj)
  }

  /**
   * @method resolveSet
   * @summary Sets a value within an object using a dot-notation path
   * @param obj {Object} The object to store/update the value in
   * @param path {String} The path to the value
   * @param val {Mixed} The value to store
   * @returns {Boolean} Whether the operation was successful
   * @example
   *
   *     const myObject = {
   *       foo: {
   *         bar: 'baz'
   *       }
   *     };
   *     resolveSet(myObject, 'foo.bar', 999) // myObject.foo.bar === 999
   *
   */
  resolveSet (obj, path, val) {
    let components = path.split('.')
    while (components.length > 0) {
      if (typeof (obj) !== 'object') break

      if (components.length === 1) {
        obj[ components[ 0 ] ] = val
        return true
      } else {
        obj = obj[ components.shift() ]
      }
    }
    return false
  }

  /**
   * Read and parse a file from the filesystem
   *
   * @param {string} fileName the path to the file
   * @param {function} [cb] a callback function. invoked with an error or a parsed config
   * @returns {object} a parsed config if no callback is provided
   */
  readConfigFile (fileName, cb) {
    if (cb) {
      fs.stat(fileName, (statsErr, stats) => {
        if (statsErr) return cb(statsErr, null)
        else if (!stats.isFile()) return cb(new ReferenceError('File does not exist'), null)

        fs.readFile(fileName, (readErr, configString) => {
          if (readErr) return cb(readErr, null)

          cb(null, this.parse(configString))
        })
      })
    } else {
      if (!fs.statSync(fileName).isFile()) throw new ReferenceError('File does not exist')

      const configString = fs.readFileSync(fileName)
      return this.parse(configString)
    }
  }

  /**
   * Write a config object to a file on the filesystem
   *
   * @param {string} fileName a file on the filesystem
   * @param {any} data the config object
   * @param {boolean} [overwrite=false] whether to overwrite an existing file
   * @param {any} [cb] a callback to be called after writing
   * @returns
   */
  writeConfigFile (fileName, data, overwrite = false, cb = null) {
    if (cb) {
      fs.stat(fileName, (statsErr, stats) => {
        if (statsErr) return cb(statsErr, null)
        else if (!stats.isFile() && !overwrite) return cb(new Error('File already exists, to overwrite, set `overwrite = true`'), null)

        if (typeof data === 'object') data = this.toConf(data)
        fs.writeFile(fileName, data, (writeErr) => {
          if (writeErr) return cb(writeErr, null)

          cb(null, true)
        })
      })
    } else {
      if (fs.statSync(fileName).isFile() && !overwrite) throw new Error('File already exists, to overwrite, set `overwrite = true`')

      if (typeof data === 'object') data = this.toConf(data)
      return fs.writeFileSync(fileName, data) === undefined
    }
  }

  /**
   * @method parse
   * @summary Wrapper function which determines the input type and calls
   * the relevant parsing function
   * @param mixed {Object | String} The input source to be converted
   * @returns {Object | String} The converted input
   * @throws {TypeError} If type of `mixed` isn't either Object or String
   * @example
   *
   *     const myObject = require('./sampleJSON')
   *     parse(myObject) // returns config string
   *
   */
  parse (mixed) {
    if (typeof mixed === 'object') return this.toConf(mixed)
    else if (typeof mixed === 'string') return this.toJSON(mixed)
    else throw new TypeError(`Expected an Object or String, but got "${typeof mixed}"`)
  }

  /**
   * @method toJSON
   * @summary Converts a config string into a JS object
   * @param conf {String} The nginx config string
   * @returns {Object} The converted input
   * @example
   *
   *     const myConfString = require('./sampleconf')
   *     toJSON(myConfString) // returns JS object
   *
   */
  toJSON (conf) {
    // split multi-line string to array of lines. Remove TAB characters
    const lines = conf.replace('\t', '').split('\n')
    let json = {} // holds constructed json
    let parent = '' // parent keys as we descend into object

    lines.forEach(line => {
      line = line.trim() // prep for `startsWith` and `endsWith`

      // If line is blank line or is comment, do not process it
      if (!line || line.startsWith('#')) return

      /*
        1. Object opening line
        Append key name to `parent` and create the sub-object in `json`
        e.g. for the line "location /api {", `json` is extended with
        the following key/value:
        { "location /api": {} }
      */
      if (line.endsWith('{')) {
        const key = line.slice(0, line.length - 1).trim()

        // If we are already a level deep (or more), add a dot before the key
        if (parent) parent += '.' + key
        // otherwise just track the key
        else parent = key

        // store in constructed `json`
        this.resolveSet(json, parent, {})

        /*
          2. Standard property line
          Create a key/value pair in the constructed `json`, which
          reflects the key/value in the conf file.
        */
      } else if (line.endsWith(';')) {
        line = line.split(' ')

        // Put the property name into `key`
        let key = line.shift()
        // Put the property value into `val`
        let val = line.join(' ').trim()

        // If key ends with a semi-colon, remove that semi-colon
        if (key.endsWith(';')) key = key.slice(0, key.length - 1)
        // Remove trailing semi-colon from `val` (we established its
        // presence already)
        val = val.slice(0, val.length - 1)

        if (parent) {
          const existingVal = this.resolve(json, parent + '.' + key)
          if (existingVal) {
            // If we already have a property in the constructed `json` by
            // the same name as `key`, convert the stored value from a
            // String, to an Array of Strings & push the new value in
            if (Array.isArray(existingVal)) {
              val = existingVal.concat(val)
            } else {
              val = [ val, existingVal ]
            }
          }
          this.resolveSet(json, parent + '.' + key, val)
        } else {
          // Top level key/val, just create property in constructed
          // `json` and store val
          this.resolveSet(json, key, val)
        }

        /*
          3. Object closing line
          Removes current deepest `key` from `parent`
          e.g. "server.location /api" becomes "server"
        */
      } else if (line.endsWith('}')) {
        parent = parent.split('.')
        parent.pop()
        parent = parent.join('.')
      }
    })

    return json
  }

  /**
   * @method toConf
   * @summary Converts a JS object into a config string
   * @param json {Object} The nginx config represented as a JS object
   * @returns {String} The converted input
   * @example
   *
   *     const myJSObject = require('./samplejson')
   *     toConf(myJSObject) // returns a config string
   *
   */
  toConf (json) {
    const recurse = (obj, depth) => {
      let retVal = ''
      let longestKeyLen = 1
      const indent = ('    ').repeat(depth)

      for (let key in obj) {
        longestKeyLen = Math.max(longestKeyLen, key.length)
      }

      for (let key in obj) {
        const val = obj[ key ]
        const keyValSpacing = (longestKeyLen - key.length) + 4
        const keyValIndent = (' ').repeat(keyValSpacing)

        if (Array.isArray(val)) {
          val.forEach(subVal => {
            retVal += indent + (key + keyValIndent + subVal).trim() + ';\n'
          })
        } else if (typeof val === 'object') {
          retVal += indent + key + ' {\n'
          retVal += recurse(val, depth + 1)
          retVal += indent + '}\n\n'
        } else {
          retVal += indent + (key + keyValIndent + val).trim() + ';\n'
        }
      }

      return retVal
    }

    return recurse(json, 0)
  }
}
