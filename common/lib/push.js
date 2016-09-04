var PushNotifications, push, settings;

settings = {
  gcm: {
    id: 'AIzaSyAFvWVT56jaiJ9hyOW7TPN5W0g-mi8pnhI',
    msgcnt: 1,
    dataDefaults: {
      delayWhileIdle: false,
      timeToLive: 4 * 7 * 24 * 3600,
      retries: 4
    },
    options: {}
  }
};

PushNotifications = new require('node-pushnotifications');
push = new PushNotifications(settings);
