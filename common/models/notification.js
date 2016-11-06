'use strict';

const app = require('../../server/server');

const includeInstallations = { include: ['installations'] };
const pushEnabled = (app.get('pushEnabled'));

module.exports = (Notification) => {
  const notify = (userId, data, cb = () => null) => {
    if (pushEnabled) {
      if (app.models.push.listenerCount('error') === 0) {
        app.models.push.on('error', err => console.error(err));
      }
      app.models.user.findById(userId, includeInstallations, (err, user) => {
        if (err) {
          console.error(err);
          cb(err, null);
        } else {
          user.__data.installations.forEach((installation) => {
            if (installation.status === 'active') {
              /* eslint-disable new-cap */
              const note = new app.models.notification({
                expirationInterval: 86400, // Expire time in seconds (1 day)
                deviceType: installation.deviceType,
                deviceToken: installation.deviceToken,
                title: data.alert.title,
                body: data.alert.body,
                click_action: 'MAIN',
                actions: data.actions,
                challenge: data.challenge,
              });
              /* eslint-enable new-cap */
              console.log(`pushing notification [${data.alert.title}: ${data.alert.body}] to userId [${userId}]`);
              app.models.push.notifyById(installation.id, note, (notifyErr) => {
                if (notifyErr) {
                  console.error(notifyErr);
                  return cb(notifyErr, null);
                }
                return cb(null, data);
              });
            }
          });
        }
      });
    } else {
      console.log(`push.enabled is ${pushEnabled}`);
    }
  };

  Object.assign(Notification, { notify });

  Notification.remoteMethod(
    'notify',
    {
      description: 'Send a notification to a device',
      http: {
        verb: 'post',
        status: 201,
        path: '/:userId/notify',
      },
      accepts: [
        {
          arg: 'userId',
          type: 'string',
          http: {
            source: 'path',
          },
          required: true,
        },
        {
          arg: 'data',
          type: 'notification',
          http: {
            source: 'body',
          },
          required: true,
        },
      ],
      returns: {
        type: 'notification',
        root: true,
      },
    }
  );
};
