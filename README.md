# nginx-config-parser

```js

var ConfigParser = require('@webantic/nginx-config-parser')
var parser = new ConfigParser()

// parse straight from file
var config = parser.readConfigFile('/path/to/file.conf')

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

