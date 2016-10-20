'use strict';

module.exports = function(app) {

  console.log('push-challenge-unfinished job started');

  function sendNotification(userId, challenge) {

    app.models.user.findById(userId, { include: ['installations'] }, function(err, user) {

      if (err)
        return console.error(err);

      let actions = [
        { "title": "View Challenges", "callback": "pushActions.viewChallenges" }
      ];

      user.__data.installations.forEach(function(installation) {

        if (installation.status === 'active') {

          let note = new app.models.notification({
            expirationInterval: 86400, // Expire time in seconds (1 day)
            deviceType: installation.deviceType,
            deviceToken: installation.deviceToken,
            title: 'You have unfinished challenges!',
            actions: actions,
            challenge: challenge
          });

          console.log(`pushing notification ${note.title} to [${userId}]`);

          app.models.push.notifyById(installation.id, note, function(err) {
            if (err) return console.error(err);
          });

        }

      });

    });

  }

  app.models.challenge.find({ where: { or: [ { status: 'started' }, { status: 'accepted' } ] } }, (err, challenges) => {

    challenges.forEach(challenge => {

      if (!challenge.challenged.score)
        sendNotification(challenge.challenged.userId, challenge);

      if (!challenge.challenger.score)
        sendNotification(challenge.challenger.userId, challenge);

    });

  });

}