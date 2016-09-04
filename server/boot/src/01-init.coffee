winston = require('winston')
path = require('path')

module.exports = (app) ->

  unless app._ramen then app._ramen = {}

  logDir = (app.get("logDir") or process.env.NODE_LOG_PATH or path.join("..", ".."))

  console.log("creating logger that outputs to dir", logDir)

  global.logger = new (winston.Logger)(
    transports: [
      new (winston.transports.Console)(),
      new (winston.transports.File)( filename: "/var/log/nodejs/top-ramen/winston.log" )
    ]
  )

  logger.info 'booting init'