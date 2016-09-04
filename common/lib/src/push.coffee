settings =
  gcm:
    id: null, # PUT YOUR GCM SERVER API KEY,
    msgcnt: 1
    dataDefaults:
      delayWhileIdle: false
      timeToLive: 4 * 7 * 24 * 3600, # 4 weeks
      retries: 4
    # Custom GCM request options https://github.com/ToothlessGear/node-gcm#custom-gcm-request-options
    options: {}

PushNotifications = new require('node-pushnotifications')
push = new PushNotifications(settings)

