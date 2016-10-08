'use strict';

let app = require('../../server/server');

module.exports = function(notification) {

    notification.notify = function(userId, data, cb) {

      if (!cb) cb = () => null

      if (app.models.push.listenerCount('error') === 0)
        app.models.push.on('error', err => console.error(err));

      app.models.user.findById(userId, { include: ['installations'] }, function(err, user) {

        if (err) {
          console.error(err);
          return cb(err, null);
        }

        user.__data.installations.forEach( function(installation) {

          if (installation.status === 'Active') {

            let note = new app.models.notification({
              expirationInterval: 86400, // Expire time in seconds (1 day)
              deviceType: installation.deviceType,
              deviceToken: installation.deviceToken,
              title: data.alert.title,
              body: data.alert.body,
              click_action: "MAIN"
            });

            console.log(`pushing notification { ${data.alert.title}: ${data.alert.body} } to [${userId}]`);

            app.models.push.notifyById(installation.id, note, function(err) {
              if (err) {
                console.error(err);
                return cb(err, null);
              }
              return cb(null, data);
            });

          }

        });

      });

    }

    notification.remoteMethod(
      'notify',
      {
        description: "Send a notification to a device",
        http: {
          verb: "post",
          status: 201,
          path: "/:userId/notify"
        },
        accepts: [
          {
            arg: 'userId',
            type: 'string',
            http: {
              source: 'path'
            },
            required: true
          },
          {
            arg: 'data',
            type: 'notification',
            http: {
              source: 'body'
            },
            required: true
          }
        ],
        returns: {
          type: 'notification',
          root: true
        }
      }
    );

};
