const express = require('express')
const methodOverride = require('method-override')
const _ = require('lodash')
const lodashId = require('lodash-id')
const low = require('lowdb')
const Memory = require('lowdb/adapters/Memory')
const FileSync = require('lowdb/adapters/FileSync')
const path = require('path')
const bodyParser = require('../body-parser')
const validateData = require('./validate-data')
const plural = require('./plural')
const nested = require('./nested')
const singular = require('./singular')
const mixins = require('../mixins')

module.exports = (db, opts) => {
  opts = Object.assign({ foreignKeySuffix: 'Id', _isFake: false }, opts)

  if (typeof db === 'string') {
    db = low(new FileSync(db))
  } else if (!_.has(db, '__chain__') || !_.has(db, '__wrapped__')) {
    db = low(new Memory()).setState(db)
  }

  // Create router
  const router = express.Router()

  // Add middlewares
  router.use(methodOverride())
  router.use(bodyParser)

  validateData(db.getState())

  // Add lodash-id methods to db
  db._.mixin(lodashId)

  // Add specific mixins
  db._.mixin(mixins)

  // Expose database
  router.db = db

  // Expose render
  router.render = (req, res) => {
    // Return a hypermedia object if needed
    if (opts.hypermedia) {
      const trimmedPath = req.path.endsWith('/')
        ? req.path.slice(0, -1)
        : req.path
      const components = trimmedPath.split('/')
      const templateName = components[1]
      let templateMethod = ''

      if (components.length >= 2 && req.method === 'POST') {
        templateMethod = 'POST'
      }
      if (components.length === 2 && req.method === 'GET') {
        templateMethod = 'GET-ALL'
      }
      if (components.length >= 3 && req.method === 'GET') {
        templateMethod = 'GET'
      }
      if (components.length >= 3 && req.method === 'PUT') {
        templateMethod = 'PUT'
      }
      if (components.length >= 3 && req.method === 'DELETE') {
        templateMethod = 'DELETE'
      }

      const templatePath = opts.templates[templateName][templateMethod]
      const templateFullPath = path.join(process.cwd(), templatePath)
      res.render(templateFullPath, { top: res.locals.data })
    } else {
      res.jsonp(res.locals.data)
    }
  }

  // GET /db
  router.get('/db', (req, res) => {
    res.jsonp(db.getState())
  })

  // Handle /:parent/:parentId/:resource
  router.use(nested(opts))

  // Create routes
  db.forEach((value, key) => {
    if (_.isPlainObject(value)) {
      router.use(`/${key}`, singular(db, key, opts))
      return
    }

    if (_.isArray(value)) {
      router.use(`/${key}`, plural(db, key, opts))
      return
    }

    const sourceMessage = ''
    // if (!_.isObject(source)) {
    //   sourceMessage = `in ${source}`
    // }

    const msg =
      `Type of "${key}" (${typeof value}) ${sourceMessage} is not supported. ` +
      `Use objects or arrays of objects.`

    throw new Error(msg)
  }).value()

  router.use((req, res) => {
    if (!res.locals.data) {
      res.status(404)
      res.locals.data = {}
    }

    router.render(req, res)
  })

  router.use((err, req, res, next) => {
    console.error(err.stack)
    res.status(500).send(err.stack)
  })

  return router
}
