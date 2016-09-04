#  Sender ID

settings =
  gcm:
    msgcnt: 1
    dataDefaults:
      delayWhileIdle: false
      timeToLive: 4 * 7 * 24 * 3600, # 4 weeks
      retries: 4
    options: {} # Custom GCM request options https://github.com/ToothlessGear/node-gcm#custom-gcm-request-options

module.exports = (app) ->

  logger.info 'booting push.js with server key', app.get('pushServerKey')

  settings.gcm.id = app.get('pushServerKey')

  PushNotifications = new require('node-pushnotifications')
  app._ramen.push = new PushNotifications(settings)

  console.dir app._ramen