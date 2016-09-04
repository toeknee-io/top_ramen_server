var settings;

settings = {
  gcm: {
    msgcnt: 1,
    dataDefaults: {
      delayWhileIdle: false,
      timeToLive: 4 * 7 * 24 * 3600,
      retries: 4
    },
    options: {}
  }
};

module.exports = function(app) {
  var PushNotifications;
  logger.info('booting push.js with server key', app.get('pushServerKey'));
  settings.gcm.id = app.get('pushServerKey');
  PushNotifications = new require('node-pushnotifications');
  app._ramen.push = new PushNotifications(settings);
  return console.dir(app._ramen);
};
