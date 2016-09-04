winston = require('winston')

module.exports = (app) ->

  unless app._ramen then app._ramen = {}

  console.log(app.get("logPath"))

  global.logger = new (winston.Logger)(
    transports: [
      new (winston.transports.Console)(),
      new (winston.transports.File)( filename: app.get("logPath") )
    ]
  )

  logger.info 'booting init'
  console.dir app._ramen