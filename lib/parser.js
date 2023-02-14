'use strict'

const fs = require('fs')
const { resolve, dirname } = require('path')
const glob = require('glob')

/**
 * Converts ! in back to .
 * @param key
 * @return {*|void|string|never}
 */
function unsafeKey (key) {
  return key.replace(/(!)/g, '.')
}

/**
 * Converts all . in key to !. We need the dot for array access.
 * @param key
 * @return {*|void|string|never}
 */
function safeKey (key) {
  return key.replace(/(\.)/g, '!')
}

class IncludeResolutionError extends ReferenceError {}

module.exports = class Parser {
  constructor () {
    // Last used file name
    this.fileName = null
    this.serverRoot = null
  }

  /**
   * To support including sub-configs, we need to get server root
   * @param fileName
   */
  setFileName (fileName) {
    this.fileName = fileName
    // Get the server root only if not set
    if (this.serverRoot === null) {
      this.serverRoot = dirname(fileName)
    }
  }

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
      return (typeof prev === 'object' && prev) ? prev[unsafeKey(curr)] : undefined
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
    const components = path.split('.')
    while (components.length > 0) {
      if (typeof (obj) !== 'object') break

      if (components.length === 1) {
        obj[unsafeKey(components[0])] = val
        return true
      } else {
        obj = obj[unsafeKey(components.shift())]
      }
    }
    return false
  }

  /**
   * Read and parse a file from the filesystem
   *
   * @param {string} fileName the path to the file
   * @param {function} [cb] a callback function. invoked with an error or a parsed config
   * @param {Object} [options] optional parse options
   * @param {boolean} [options.parseIncludes] If `true`, will resolve and include
   * referenced files' contents in the output
   * @returns {object} a parsed config if no callback is provided
   */
  readConfigFile (fileName, cb, options) {
    this.setFileName(fileName)

    if (!options && cb != null && typeof cb === 'object') {
      options = cb
      cb = undefined
    }

    if (!options) {
      options = {
        parseIncludes: true
      }
    }

    if (cb) {
      fs.stat(fileName, (statsErr, stats) => {
        if (statsErr) return cb(statsErr, null)
        else if (!stats.isFile()) return cb(new ReferenceError('File does not exist'), null)

        fs.readFile(fileName, (readErr, configString) => {
          if (readErr) return cb(readErr, null)

          cb(null, this.parse(configString, options))
        })
      })
    } else {
      if (!fs.statSync(fileName).isFile()) throw new ReferenceError('File does not exist')

      const configString = fs.readFileSync(fileName)
      return this.parse(configString, options)
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
    this.setFileName(fileName)

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
   * @param {Object | string} mixed The input source to be converted
   * @param {Object} [options] optional parse options
   * @param {boolean} [options.parseIncludes] If `true`, will resolve and include
   * referenced files' contents in the output
   * @param {string} [options.includesRoot] An optional root path to resolve includes from
   * @param {boolean} [options.ignoreIncludeErrors] If `true`, will not throw for include errors
   * @returns {Object | string} The converted input
   * @throws {TypeError} If type of `mixed` isn't either Object or String
   * @example
   *
   *     const myObject = require('./sampleJSON')
   *     parse(myObject) // returns config string
   *
   */
  parse (mixed, options) {
    // Contents can return Buffer - convert it to string
    if (Buffer.isBuffer(mixed)) {
      mixed = mixed.toString('utf8')
    }
    if (typeof mixed === 'object') return this.toConf(mixed)
    else if (typeof mixed === 'string') return this.toJSON(mixed, options)
    else throw new TypeError(`Expected an Object or String, but got "${typeof mixed}"`)
  }

  /**
   * @method toJSON
   * @summary Converts a config string into a JS object
   * @param conf {String} The nginx config string
   * @param {Object} [options] optional parse options
   * @param {boolean} [options.parseIncludes] If `true`, will resolve and include
   * referenced files' contents in the output
   * @param {string} [options.includesRoot] An optional root path to resolve includes from
   * @param {boolean} [options.ignoreIncludeErrors] If `true`, will not throw for include errors
   * @returns {Object} The converted input
   * @example
   *
   *     const myConfString = require('./sampleconf')
   *     toJSON(myConfString) // returns JS object
   *
   */
  toJSON (conf, options = {}) {
    // split multi-line string to array of lines. Remove TAB characters
    const lines = conf.replace('\t', '').split('\n')
    const json = {} // holds constructed json
    let parent = '' // parent keys as we descend into object
    let chunkedLine = null // aggregator for multi-lines directives
    let innerLines = [] // array for blocks extracted from multi-blocks line
    let countOfParentsThatAreArrays = 0 // how many of the parent keys are arrays
    let isInLuaBlock = false
    let luaBlockValue = []

    lines.forEach(lineRaw => {
      lineRaw = lineRaw.trim() // prep for `startsWith` and `endsWith`

      // If line is blank line or is comment, do not process it
      if (!lineRaw || lineRaw.startsWith('#')) return

      // Line can contain comments, we need to remove them
      lineRaw = lineRaw.split('#')[0].trim()

      /*
        Line can contain multiple blocks
        e.g. "upstream x {server A;} upstream y {server B; server C; server D;}"
        Wrap curly brackets in ' {' and '; }' with new line symbols.
        Add new line after all ';',
      */
      innerLines = lineRaw
        .replace(/(\s+{)/g, '\n$1\n')
        .replace(/(;\s*)}/g, '$1\n}\n')
        .replace(/;\s*?$/g, ';\n')
        .split(/\n/)

      innerLines.forEach(line => {
        line = line.trim()
        if (!line) return

        // If we're in a lua block, append the line to the luaBlockValue and continue
        if (isInLuaBlock && !line.endsWith('}')) {
          luaBlockValue.push(line)
          return
        }

        chunkedLine && (line = chunkedLine + ' ' + line)

        /*
          1. Object opening line
          Append key name to `parent` and create the sub-object in `json`
          e.g. for the line "location /api {", `json` is extended with
          the following key/value:
          { "location /api": {} }
        */
        if (line.endsWith('{')) {
          chunkedLine = null
          const key = safeKey(line.slice(0, line.length - 1).trim())
          if (key.endsWith('by_lua_block')) {
            // flip isInLuaBlock to true to disable parsing of tokens within this block
            isInLuaBlock = true
          }

          // If we are already a level deep (or more), add a dot before the key
          if (parent) parent += '.' + key
          // otherwise just track the key
          else parent = key

          // store in constructed `json` (support array resolving)
          if (this.appendValue(json, parent, {})) {
            // Array was used and we need to update the parent key with an index
            parent += '.' + (this.resolve(json, parent).length - 1)
            countOfParentsThatAreArrays += 1
          }
        }
        /*
          2. Standard inlcude line
          Load external file config and merge it into current json structure
        */
        else if (line.startsWith('include') && options.parseIncludes) {
          chunkedLine = null
          // Resolve find path in the include (can use wildcard and relative paths)
          const findFiles = resolve(
            this.serverRoot || options.includesRoot || '',
            line.replace('include ', '').replace(';', '').trim()
          )
          const files = glob.sync(findFiles)

          files.forEach((file) => {
            // Get separate parser that will parse included file
            const parser = new Parser()
            // Pass the current server root - includes in the file
            // must be originating from the conf root
            parser.serverRoot = this.serverRoot

            // Include contains path to file, it can be relative/absolute - resolve the path
            const config = parser.readConfigFile(file)

            // Get all found key values and resolve in current tree structure
            for (const key in config) {
              const val = config[key]
              this.appendValue(json, key, val, parent)
            }
          })

          if (!files.length && !options.ignoreIncludeErrors) {
            throw new IncludeResolutionError(`Unable to resolve include statement: "${line}".\nSearched in ${this.serverRoot || options.includesRoot || process.cwd()}`)
          }
        }
        /*
          3. Standard property line
          Create a key/value pair in the constructed `json`, which
          reflects the key/value in the conf file.
        */
        else if (line.endsWith(';')) {
          chunkedLine = null
          line = line.split(' ')

          // Put the property name into `key`
          let key = safeKey(line.shift())
          // Put the property value into `val`
          let val = line.join(' ').trim()

          // If key ends with a semi-colon, remove that semi-colon
          if (key.endsWith(';')) key = key.slice(0, key.length - 1)
          // Remove trailing semi-colon from `val` (we established its
          // presence already)
          val = val.slice(0, val.length - 1)
          this.appendValue(json, key, val, parent)
        }
        /*
          4. Object closing line
          Removes current deepest `key` from `parent`
          e.g. "server.location /api" becomes "server"
        */
        else if (line.endsWith('}')) {
          chunkedLine = null
          // If we're in a lua block, make sure the final value gets stored before moving up a level
          if (isInLuaBlock) {
            this.appendValue(json, '_lua', luaBlockValue, parent)
            luaBlockValue = []
            isInLuaBlock = false
          }

          // Pop the parent to go lower
          parent = parent.split('.')

          // check if the current level is an array
          if (countOfParentsThatAreArrays > 0 && !isNaN(parseInt(parent[parent.length - 1], 10))) {
            parent.pop() // remove the numeric index from parent
            countOfParentsThatAreArrays -= 1
          }
          parent.pop()
          parent = parent.join('.')
        }
        /*
          5. Line may not contain '{' ';' '}' symbols at the end
          e.g. "location /api
                { ... }"
          Block begins from the new line here.
        */
        else {
          chunkedLine = line
        }
      })
    })

    return json
  }

  /**
   * Resolve setting value with merging existing value and converting it
   * to array. When true is returned, an array was used
   * @return bool
   */
  resolveAppendSet (json, key, val) {
    let isInArray = false
    const existingVal = this.resolve(json, key)
    if (existingVal) {
      // If we already have a property in the constructed `json` by
      // the same name as `key`, convert the stored value from a
      // String, to an Array of Strings & push the new value in.
      // Also support merging arrays
      let mergedValues = []

      // Should we merge new array with existing values?
      if (Array.isArray(existingVal)) {
        mergedValues = existingVal
      } else if (typeof existingVal !== 'undefined') {
        mergedValues.push(existingVal)
      }

      // If given value is already array and current existing value is also array,
      // merge the arrays together
      if (Array.isArray(val)) {
        val.forEach(function (value) {
          mergedValues.push(value)
        })
      } else {
        mergedValues.push(val)
      }

      val = mergedValues
      isInArray = true
    }

    this.resolveSet(json, key, val)

    return isInArray
  }

  /**
   * Appends given value into json with parent detection -> resolveSet or resolve
   *
   * @param {Object} json
   * @param {string} key
   * @param val
   * @param {string} parent
   */
  appendValue (json, key, val, parent = undefined) {
    // Key within the parent
    if (parent) {
      return this.resolveAppendSet(json, parent + '.' + key, val)
    } else {
      // Top level key/val, just create property in constructed
      // `json` and store val
      return this.resolveAppendSet(json, key, val)
    }
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

      for (const key in obj) {
        longestKeyLen = Math.max(longestKeyLen, key.length)
      }

      for (const key in obj) {
        const val = obj[key]
        const keyValSpacing = (longestKeyLen - key.length) + 4
        const keyValIndent = (' ').repeat(keyValSpacing)

        if (Array.isArray(val)) {
          if (key === '_lua') {
            retVal += val.length > 0 ? indent : ''
            retVal += val.join('\n' + indent)
            retVal += '\n'
          } else {
            val.forEach(subVal => {
              let block = false
              if (typeof subVal === 'object') {
                block = true
                subVal = ' {\n' + recurse(subVal, depth + 1) + indent + '}\n\n'
              }
              const spacing = block ? ' ' : keyValIndent
              retVal += indent + (key + spacing + subVal).trim()
              block ? retVal += '\n' : retVal += ';\n'
            })
          }
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
