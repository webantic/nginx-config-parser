# nginx-config-parser

```js

var ConfigParser = require('@webantic/nginx-config-parser')
var parser = new ConfigParser()

// parse straight from file. by default, will try to resolve includes
var config = parser.readConfigFile('/path/to/file.conf')

// to keep deterministic behaviour, set parseIncludes = false in the options
var configWithoutIncludes = parser.readConfigFile('/path/to/file.conf', { parseIncludes: false })

// write direct to file (overwriting existing one)
parser.writeConfigFile('/path/to/newfile.conf', config, true)


var sampleConfig = {
  "server": {
    "server_name": "_",
    "location /": {
      "try_files": "*.html"
    }
  }
}

// to multi-line config string
var configString = parser.toConf(sampleConfig)
// and back again
var configJson = parser.toJSON(configString)

// shorthand (will change object --> string and string --> object)
parser.parse(configString)
```

## Notes

### Includes

`.readConfigFile()` will attempt to resolve includes and bundle them in the generated JavaScript object by default. If you call `.toConf()` (or `.parse()`) on the generated object, the generated conf string will differ from the original one as there is no way to replace the included content with the original `include ...` line. To control this behaviour, supply an `options` argument setting `parseIncludes` to `false`.

```js

parser.readConfigFile(filePath, callback, options)
// or
parser.readConfigFile(filePath, options)

```

By default, the `.toJSON()` method will not attempt to resolve includes (because the module has no idea where to look for the included files when it is only supplied a conf string instead of a file path). To force the module to attempt to resolve includes, you must set `options.parseIncludes` to `true` when calling the method. If you supply a value for `options.includesRoot`, the module will use that as the base path to search in. If you do not provide a value for `options.includesRoot`, the module will attempt to resolve the files in the CWD.

If a referenced include cannot be resolved, this method will throw an IncludeResolutionError. To ignore this error (which is the default behaviour in nginx), set `options.ignoreIncludeErrors` to `true`.

### Lua blocks / openresty

If the config contains a block which ends with the string "by_lua_block", the parser will not tokenise the contents of the block. Instead, the raw contents of the block will be stored under a special key `_lua` as an array of strings. Each string in the array represents a single line from the block. For example:

```javascript

var config = [
  'access_by_lua_block {',
  '  ngx.var.url = ngx.unescape_uri(ngx.req.get_uri_args().url);',
  '}'
].join('\n')

const parsed = parser.parse(config)
console.log(JSON.stringify(parsed, null, 2))

// {
//   access_by_lua_block: {
//     _lua: [
//       'ngx.var.url = ngx.unescape_uri(ngx.req.get_uri_args().url);'
//     ]
//   }
// }
```

### Multiline

When parsing multiline blocks, the behaviour is non-deterministic. Effectively, this means that your values will be collapsed onto a single line when flipping to JSON and back to conf.

```js
const configString = `
http {
  proxy_cache_path /var/cache/nginx/users
    keys_zone=users:1m
    levels=2
    use_temp_path=off
    inactive=1d
    max_size=16m;
}
`;

const json = parser.toJSON(configString);

const expectedOutput = `
http {
  proxy_cache_path /var/cache/nginx/users keys_zone=users:1m levels=2 use_temp_path=off inactive=1d max_size=16m;
}
`;

parser.toConf(json) === expectedOutput; // true
```

