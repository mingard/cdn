const site = require('../../package.json').name
const version = require('../../package.json').version
const nodeVersion = Number(process.version.match(/^v(\d+\.\d+)/)[1])
const colors = require('colors') // eslint-disable-line
const bodyParser = require('body-parser')
const finalhandler = require('finalhandler')
const fs = require('fs')
const help = require('./help')
const http = require('http')
const https = require('https')
const path = require('path')
const Router = require('router')
const router = Router()
const dadiStatus = require('@dadi/status')
const domainManager = require('./models/domain-manager')
const workspace = require('./models/workspace')

// Let's ensure there's at least a dev config file here.
const devConfigPath = path.join(
  __dirname,
  '/../../config/config.development.json'
)

fs.stat(devConfigPath, (err, stats) => {
  if (err && err.code === 'ENOENT') {
    fs.writeFileSync(
      devConfigPath,
      fs.readFileSync(devConfigPath + '.sample')
    )
  }
})

const auth = require(path.join(__dirname, '/auth'))
const Controller = require(path.join(__dirname, '/controller'))
const configPath = path.resolve(path.join(__dirname, '/../../config'))
const config = require(configPath)

const Server = function () {}

/**
 * Creates an HTTP or HTTPS server and calls `listener`
 * once the server is listening for requests.
 *
 * @param  {Function} listener
 * @return {http.Server}
 */
Server.prototype.create = function (listener) {
  let protocol = config.get('server.protocol')

  if (protocol === 'http') {
    return http.createServer(listener)
  } else if (protocol === 'https') {
    let readFileSyncSafe = (path) => {
      try {
        return fs.readFileSync(path)
      } catch (ex) {
        console.log(ex)
      }

      return null
    }

    let passphrase = config.get('server.sslPassphrase')
    let caPath = config.get('server.sslIntermediateCertificatePath')
    let caPaths = config.get('server.sslIntermediateCertificatePaths')
    let serverOptions = {
      key: readFileSyncSafe(config.get('server.sslPrivateKeyPath')),
      cert: readFileSyncSafe(config.get('server.sslCertificatePath'))
    }

    if (passphrase && passphrase.length >= 4) {
      serverOptions.passphrase = passphrase
    }

    if (caPaths && caPaths.length > 0) {
      serverOptions.ca = []
      caPaths.forEach(path => {
        let data = readFileSyncSafe(path)

        if (data) {
          serverOptions.ca.push(data)
        }
      })
    } else if (caPath && caPath.length > 0) {
      serverOptions.ca = readFileSyncSafe(caPath)
    }

    // We need to catch any errors resulting from bad parameters,
    // such as incorrect passphrase or no passphrase provided.
    try {
      return https.createServer(serverOptions, listener)
    } catch (ex) {
      let exPrefix = 'error starting https server: '

      switch (ex.message) {
        case 'error:06065064:digital envelope routines:EVP_DecryptFinal_ex:bad decrypt':
          throw new Error(exPrefix + 'incorrect ssl passphrase')

        case 'error:0906A068:PEM routines:PEM_do_header:bad password read':
          throw new Error(exPrefix + 'required ssl passphrase not provided')

        default:
          throw new Error(exPrefix + ex.message)
      }
    }
  }
}

/**
 * Handler function for when the server is listening for requests.
 */
Server.prototype.onListening = function () {
  let address = this.address()
  let env = config.get('env')

  if (env !== 'test') {
    let startText = '\n  ----------------------------\n'
    startText += '  Started \'DADI CDN\'\n'
    startText += '  ----------------------------\n'
    startText += '  Server:      '.green + address.address + ':' + address.port + '\n'
    startText += '  Version:     '.green + version + '\n'
    startText += '  Node.JS:     '.green + nodeVersion + '\n'
    startText += '  Environment: '.green + env + '\n'
    startText += '  ----------------------------\n'

    startText += '\n\n  Copyright ' + String.fromCharCode(169) + ' 2015-' + new Date().getFullYear() + ' DADI+ Limited (https://dadi.tech)'.white + '\n'

    console.log(startText)
  }
}

/**
 * Handler function for when the HTTP->HTTPS redirect server
 * is listening for requests.
 */
Server.prototype.onRedirectListening = function () {
  let address = this.address()
  let env = config.get('env')

  if (env !== 'test') {
    let startText = '\n  ----------------------------\n'
    startText += '  Started HTTP -> HTTPS Redirect\n'
    startText += '  ----------------------------\n'
    startText += '  Server:      '.green + address.address + ':' + address.port + '\n'
    startText += '  ----------------------------\n'

    console.log(startText)
  }
}

/**
 * Handler function for when the status endpoint server is
 * listening for requests.
 */
Server.prototype.onStatusListening = function () {
  var address = this.address()
  let env = config.get('env')

  if (env !== 'test') {
    let startText = '\n  ----------------------------\n'
    startText += '  Started standalone status endpoint\n'
    startText += '  ----------------------------\n'
    startText += '  Server:      '.green + address.address + ':' + address.port + '\n'
    startText += '  ----------------------------\n'

    console.log(startText)
  }
}

/**
 * Bootstraps the application, initialising the web server and
 * attaching all the necessary middleware and routing logic.
 *
 * @param  {Function} done - callback function
 */
Server.prototype.start = function (done) {
  router.use((req, res, next) => {
    const FAVICON_REGEX = /\/(favicon|(apple-)?touch-icon(-i(phone|pad))?(-\d{2,}x\d{2,})?(-precomposed)?)\.(jpe?g|png|ico|gif)$/i

    if (FAVICON_REGEX.test(req.url)) {
      res.statusCode = 204
      res.end()
    } else {
      next()
    }
  })

  router.use(bodyParser.json({limit: '50mb'}))

  router.get('/', function (req, res, next) {
    res.end('Welcome to DADI CDN')
  })

  // Ensure that middleware runs in the correct order,
  // especially when running an integrated status page.
  if (config.get('status.standalone')) {
    let statusRouter = Router()

    config.get('status.requireAuthentication') && auth(statusRouter)
    statusRouter.use('/api/status', this.status)

    let statusApp = http.createServer(function (req, res) {
      res.setHeader('Server', config.get('server.name'))
      res.setHeader('Access-Control-Allow-Origin', '*')
      res.setHeader('Cache-Control', 'no-cache')

      statusRouter(req, res, finalhandler(req, res))
    })

    let statusServer = statusApp.listen(config.get('status.port'))

    statusServer.on('listening', this.onStatusListening)

    this.statusServer = statusServer

    auth(router)
  } else {
    if (config.get('status.requireAuthentication')) {
      auth(router)
      router.use('/api/status', this.status)
    } else {
      router.use('/api/status', this.status)
      auth(router)
    }
  }

  this.controller = new Controller(router)

  let redirectInstance
  let redirectServer
  let redirectPort = config.get('server.redirectPort')

  if (redirectPort > 0) {
    redirectInstance = http.createServer((req, res) => {
      let port = config.get('server.port')
      let hostname = req.headers.host.split(':')[0]
      let location = `https://${hostname}:${port}${req.url}`

      res.setHeader('Location', location)
      res.statusCode = 301
      res.end()
    })

    redirectServer = redirectInstance.listen(redirectPort)
    redirectServer.on('listening', this.onRedirectListening)
  }

  let app = this.create((req, res) => {
    if (config.get('multiDomain.enabled')) {
      let domain = req.headers.host.split(':')[0]

      if (!domainManager.getDomain(domain)) {
        return help.sendBackJSON(404, {
          result: 'Failed',
          message: `Domain not configured: ${domain}`
        }, res)
      }

      req.__domain = domain
    }

    res.setHeader('Server', config.get('server.name'))
    res.setHeader('Access-Control-Allow-Origin', '*')

    if (req.url === '/api/status') {
      res.setHeader('Cache-Control', 'no-cache')
    }

    router(req, res, finalhandler(req, res))
  })

  let server = app.listen(config.get('server.port'))
  server.on('listening', this.onListening)

  this.readyState = 1
  this.server = server

  workspace.createDirectories()
  workspace.startWatchingFiles()

  if (typeof done === 'function') {
    done()
  }
}

/**
 * Responds to requests to the status endpoint.
 *
 * @param  {http.ClientRequest}   req
 * @param  {http.ServerResponse}  res
 * @param  {Function}             next
 */
Server.prototype.status = function (req, res, next) {
  let method = req.method && req.method.toLowerCase()
  let authorization = req.headers.authorization

  if (method !== 'post' || config.get('status.enabled') === false) {
    return next()
  }

  let params = {
    site: site,
    package: '@dadi/cdn',
    version: version,
    healthCheck: {
      authorization: authorization,
      baseUrl: `http://${config.get('server.host')}:${config.get('server.port')}`,
      routes: config.get('status.routes')
    }
  }

  dadiStatus(params, (err, data) => {
    if (err) return next(err)

    let responseMessages = {
      Green: 'Service is responding within specified parameters',
      Amber: 'Service is responding, but outside of specified parameters'
    }

    data.status = {
      status: data.routes[0].status,
      healthStatus: data.routes[0].healthStatus,
      message: responseMessages[data.routes[0].healthStatus] ||
        'Service is not responding correctly'
    }

    let resBody = JSON.stringify(data, null, 2)

    res.statusCode = 200
    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Content-Length', Buffer.byteLength(resBody))

    return res.end(resBody)
  })
}

/**
 * Stops all the server instances and terminates the file watcher.
 * Used mostly for unit tests.
 *
 * @param  {Function} done
 */
Server.prototype.stop = function (done) {
  this.readyState = 3

  workspace.stopWatchingFiles()

  this.server.close(err => {
    // If statusServer is running in standalone, close that too.
    if (this.statusServer) {
      this.statusServer.close(err => {
        this.readyState = 0

        if (typeof done === 'function') {
          done(err)
        }
      })
    } else {
      this.readyState = 0

      if (typeof done === 'function') {
        done(err)
      }
    }
  })
}

module.exports = new Server()
module.exports.Server = Server
