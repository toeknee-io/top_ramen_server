winston = require('winston')
path = require('path')
conf = 'derp'

module.exports = (app) ->

  unless app._ramen then app._ramen = {}

  logDir = (app.get("logDir") or process.env.npm_package_config_logDir or path.join("..", ".."))

  console.log("creating logger that outputs to dir", logDir)

  global.logger = new (winston.Logger)(
    transports: [
      new (winston.transports.Console)(),
      new (winston.transports.File)( filename: "#{logDir}/winston.log" )
    ]
  )

  logger.info("booting init")