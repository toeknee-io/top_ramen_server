'use strict';

const _ = require('lodash');
const Promise = require('bluebird');
const Constants = require('../constants');
const app = require('../../server/server');
const emojis = require('../../config/emojis.json');
const pn = require('../../config/push-notifications.json');
const remoteMethodConfig = require('../../config/remote-methods.js');
const ChallengeService = require('../../server/services/challenge');
const ChallengeUtils = require('../lib/challenge-utils');

const allowMultipleChallenges = app.get('allowMultipleChallenges');

const STATUS_FINISHED = Constants.CHALLENGE.STATUS.FINISHED;
const FINISHED_WINNER_TIED = Constants.CHALLENGE.FINISHED.WINNER.TIED;
// const pendingStatus = Constants.CHALLENGE.INVITE.STATUS.PENDING;
const acceptedStatus = Constants.CHALLENGE.INVITE.STATUS.ACCEPTED;
const declinedStatus = Constants.CHALLENGE.INVITE.STATUS.DECLINED;

const startedStatus = Constants.CHALLENGE.STATUS.STARTED;

const PUSH_TEXT_TIED = Constants.CHALLENGE.FINISHED.PUSH.TEXT.STATUS.TIED;
const PUSH_TEXT_BEAT = Constants.CHALLENGE.FINISHED.PUSH.TEXT.STATUS.BEAT;
const PUSH_TEXT_LOST = Constants.CHALLENGE.FINISHED.PUSH.TEXT.STATUS.LOST;

const unfinishedChallengeErr = new Error('These users have an unfinished challenge');
unfinishedChallengeErr.status = 403;


let userService;
let identityService = app._ramen.identityService;

app.on('service:added', ({ ns, service }) => {
  app._ramen[`${ns}Service`] = service;

  if (ns === 'userIdentity' && service) {
    identityService = service;
  }
  if (ns === 'user' && service) {
    userService = service;
  }
});

/* eslint-disable no-param-reassign */
function getFilteredIdentities(identities) {
  identities.forEach((identity) => {
    // delete identity.id;
    // delete identity._id;
    delete identity.authScheme;
    // delete identity.created;
    // delete identity.credentials;
    // delete identity.modified;
    // delete identity.userId;

    if (identity.profile) {
      // delete identity.profile.id;
      // delete identity.profile.provider;
      delete identity.profile._raw;
      delete identity.profile._json;
    }
  });

  return identities;
}
/* eslint-enable no-param-reassign */

function setIdentity(rOrD) {
  return new Promise((resolve, reject) => {
    if (rOrD.identities) {
      Object.assign(rOrD, { identities: getFilteredIdentities(rOrD.identities) });
      resolve();
    } else {
      identityService.getByUserId(rOrD.userId)
      .then((data) => {
        Object.assign(rOrD, { identities: getFilteredIdentities(data) });
        resolve();
      })
      .catch(err => reject(err));
    }
  });
}

function sortChallenges(challenges) {
  const results = {};

  challenges.forEach((challenge) => {
    if (!results[challenge.status]) {
      results[challenge.status] = [];
    }

    _.attempt(() => results[challenge.status].push(challenge));
  });

  return results;
}

function getChallengeWinner(challenge) {
  let winner = Constants.CHALLENGE.FINISHED.WINNER.TIED;

  const rScore = challenge.challenger.score;
  const dScore = challenge.challenged.score;

  if (rScore > dScore) {
    winner = challenge.challenger.userId;
  } else if (dScore > rScore) {
    winner = challenge.challenged.userId;
  }

  return winner;
}

module.exports = function challengeModelExtensions(Challenge) {
  const challengeService = app._ramen.challengeService = new ChallengeService({ model: Challenge });

  app.on('io:listening', (io) => {
    if (!app.io) {
      app.io = io;
    }
  });

  app.on('socket:set', ({ userId, socket }) => {
    app.clientSockets[userId] = socket;
  });

  app.on('booted', () => {
    userService = app._ramen.userService;
  });

  Challenge.observe('before save', (ctx, next) => {
    const challenge = ctx.currentInstance || ctx.instance || ctx.data;

    let resErr = null;

    challenge.score = null;
    challenge.modified = new Date();

    setIdentity(challenge.challenger)
      .then(() => setIdentity(challenge.challenged))
      .catch((err) => { resErr = err; })
      .finally(() => next(resErr));
  });

  Challenge.observe('after save', (ctx, next) => {
    const challenge = ctx.instance;

    console.log('after save chl: %j', challenge);

    const rUserId = challenge.challenger.userId;
    const dUserId = challenge.challenged.userId;

    const rSocket = app.clientSockets[rUserId];
    const dSocket = app.clientSockets[dUserId];

    challengeService.clearCacheById(rUserId)
      .catch(err => console.error(err));
    challengeService.clearCacheById(dUserId)
      .catch(err => console.error(err));

    if (rSocket) {
      rSocket.emit('user:clearCache', { ns: 'challenges', userId: rUserId });
    }
    if (dSocket) {
      dSocket.emit('user:clearCache', { ns: 'challenges', userId: dUserId });
    }

    next();
  });

  function buildWhereFilter(rUserId, dUserId) {
    return {
      where: {
        and: [
          { status: { $ne: 'finished' } },
          { inviteStatus: { $ne: 'declined' } },
          {
            or: [
              { 'challenger.userId': rUserId,
                'challenged.userId': dUserId,
              },
              { 'challenged.userId': rUserId,
                'challenger.userId': dUserId,
              },
            ],
          },
        ],
      },
    };
  }

  Challenge.beforeRemote('create', (ctx, challenge, next) => {
    let reqErr = null;

    const challenger = {};
    const challenged = {};

    challenger.userId = ctx.req.accessToken.userId.toString();
    challenged.userId = ctx.req.body.userId;

    Object.assign(ctx.req.body, { challenger });
    Object.assign(ctx.req.body, { challenged });

    setIdentity(challenger)
      .then(() => setIdentity(challenged))
      .catch((err) => { reqErr = err; })
      .finally(() => {
        if (allowMultipleChallenges === false) {
          const rUserId = ctx.req.body.challenger.userId;
          const dUserId = ctx.req.body.challenged.userId;
          Challenge.find(buildWhereFilter(rUserId, dUserId), (err, result) => {
            reqErr = err;
            next(result ? unfinishedChallengeErr : reqErr);
          });
        } else {
          console.log(`allowMultipleChallenges is ${allowMultipleChallenges}`);
          next(reqErr);
        }
      });
  });

  Challenge.afterRemote('create', (ctx, challenge, next) => {
    const userId = ctx.req.accessToken.userId.toString();

    if (!userId) {
      next(new Error('Could not find accessToken.userId in request'));
    } else {
      app.models.user.findById(userId, (err, model) => {
        if (err) {
          console.error(err);
        } else {
          app.models.notification.notify(challenge.challenged.userId,
            {
              challenge,
              alert: { title: `${model.firstName} Challenges You! ${emojis.bowl}`, body: 'To A Nooduel!' },
              actions: [
                pn.actions.acceptChallenge,
                pn.actions.declineChallenge,
                pn.actions.viewChallenges,
              ],
            }
          );
        }
      });
    }

    next();
  });


  Challenge.beforeRemote('prototype.updateAttributes', (ctx, unused, next) => {
    const challengeId = ctx.req.params.id;
    const userId = ctx.req.accessToken.userId.toString();

    Challenge.findById(challengeId, (err, rawChallenge = {}) => {
      try {
        const reqErr = new Error();
        const challenge = rawChallenge.toObject();
        const challenged = challenge.challenged;

        if (err) {
          reqErr.status = 500;
          reqErr.message = `Exception occurred while finding challenge: ${err}`;
        }

        const userKey = challenge.challenger.userId === userId ? 'challenger' : 'challenged';

        if (_.isEmpty(challenge)) {
          reqErr.status = 404;
          reqErr.message = `Failed to find challenge with id ${challengeId}`;
        }

        if (challenge.status === STATUS_FINISHED) {
          reqErr.status = 403;
          reqErr.message = 'A finished challenge cannot be updated.';
        }

        const user = challenge[userKey];

        if (!user) {
          reqErr.status = 404;
          reqErr.message = 'Could not find the player that submitted this update.';
        }

        const prevScore = challenge.challenger.userId === user.userId ?
          challenge.challenger.score : challenge.challenged.score;

        if (!_.isNil(prevScore)) {
          reqErr.status = 403;
          reqErr.message = 'This player has already played in this challenge.';
        }

        if (!_.isEmpty(reqErr.message)) {
          return next(reqErr);
        }

        user.score = ctx.req.body.score;
        challenge[userKey] = user;

        if (challenged.inviteStatus !== acceptedStatus && !_.isNil(challenged.score)) {
          challenged.inviteStatus = acceptedStatus;
        }

        if (challenged.inviteStatus === acceptedStatus) {
          if (!_.isNil(challenge.challenger.score) || !_.isNil(challenged.score)) {
            challenge.status = startedStatus;
          }
        }

        if (challenged.inviteStatus === declinedStatus) {
          challenge.status = STATUS_FINISHED;
          challenged.hidden = true;
        }

        if (!_.isNil(challenge.challenger.score) && !_.isNil(challenged.score) &&
          (challenge.status !== STATUS_FINISHED || _.isNil(challenge.winner))) {
          challenge.status = STATUS_FINISHED;
          challenge.winner = getChallengeWinner(challenge);
        }

        Object.assign(ctx.req.body, challenge);
      } catch (tryErr) {
        console.error(tryErr);
      }
      return next();
    });
  });

  Challenge.afterRemote('prototype.updateAttributes', (ctx, challenge, next) => {
    if (challenge.status === STATUS_FINISHED && challenge.winner) {
      try {
        const userId = ctx.req.accessToken.userId.toString();
        const challengerUserId = challenge.challenger.userId;

        const user = challengerUserId === userId ? challenge.challenger : challenge.challenged;
        const opponent = challengerUserId === userId ? challenge.challenged : challenge.challenger;

        userService.getByUserId(user.userId).then((userModel) => {
          const userName = userModel.firstName;

          userService.getByUserId(opponent.userId).then((opponentModel) => {
            const opponentName = opponentModel.firstName;
            const finishedNotif = { challenge, actions: [pn.actions.viewChallenges] };

            finishedNotif.alert = { title: `Nooduel Completed ${emojis.trophy}` };
            finishedNotif.actions.unshift(pn.actions.challengeRematch);

            const userNotif = JSON.parse(JSON.stringify(finishedNotif));
            const opponentNotif = JSON.parse(JSON.stringify(finishedNotif));

            let userAction = PUSH_TEXT_TIED;
            let opponentAction = PUSH_TEXT_TIED;

            if (challenge.winner !== FINISHED_WINNER_TIED) {
              [userAction, opponentAction] = challenge.winner === user.userId ?
                [PUSH_TEXT_BEAT, PUSH_TEXT_LOST] : [PUSH_TEXT_LOST, PUSH_TEXT_BEAT];
            }

            userNotif.alert.body = `You ${userAction} ${opponentName} ${user.score} to ${opponent.score}`;
            opponentNotif.alert.body = `You ${opponentAction} ${userName} ${opponent.score} to ${user.score}`;

            app.models.notification.notify(user.userId, userNotif);
            app.models.notification.notify(opponent.userId, opponentNotif);
          }).catch((err) => { throw err; });
        }).catch(err => console.error(err));
      } catch (err) {
        console.error(err);
      }
    }
    return next();
  });

  const sort = (userId, cb = () => null) => {
    challengeService.getByUserId(userId)
      .then(challenges => cb(null, sortChallenges(challenges)))
      .catch((err) => {
        console.error(err);
        cb(err, null);
      });
  };

  Object.assign(Challenge, { sort });
  Challenge.remoteMethod('sort', remoteMethodConfig.getChallengeSort());

  const accept = (id, cb = () => null) => {
    Challenge.findById(id, (err, challenge) => {
      if (err || !challenge || challenge.status === STATUS_FINISHED) {
        cb(err);
        const status = challenge ? challenge.status : null;
        const ivStatus = challenge && challenge.challenged ?
          challenge.challenged.inviteStatus : null;
        console.log(`skipping accept challenge api call, err [${err ? err.message : null}] invite status [${ivStatus}] challenge status [${status}]`);
      } else {
        const challenger = challenge.challenger;
        const challenged = challenge.challenged;
        challenged.inviteStatus = 'accepted';
        Object.assign(challenge, { challenged });
        Challenge.upsert(challenge, (upsertErr) => {
          cb(upsertErr, challenge);
          const challengedName = ChallengeUtils.getUsersFirstNames(challenge).challengedName;
          const notif = {
            challenge,
            alert: { title: `Challenge Accepted ${emojis.thumbs.up}`, body: `${challengedName} Has Accepted Your Challenge!` },
            actions: [pn.actions.viewChallenges],
          };
          if (!_.isNil(challenger.score)) {
            notif.actions.unshift(pn.actions.playChallenge);
          }
          app.models.notification.notify(challenger.userId, notif);
        });
      }
    });
  };

  Object.assign(Challenge, { accept });
  Challenge.remoteMethod('accept', remoteMethodConfig.getChallengeAccept());

  const decline = (req, id, cb = () => null) => {
    Challenge.findById(id, (err, challenge) => {
      if (err) {
        cb(err);
        const status = challenge ? challenge.status : null;
        const ivStatus = challenge && challenge.challenged ?
          challenge.challenged.inviteStatus : null;
        console.log(`skipping decline challenge api call, err [${err ? err.message : null}] invite status [${ivStatus}] challenge status [${status}]`);
      } else {
        const challenged = challenge.challenged;
        ChallengeUtils.hideChallengeForUser(req.accessToken.userId.toString(), challenge);
        if (challenge.status !== STATUS_FINISHED && challenge.status !== startedStatus) {
          challenged.inviteStatus = 'declined';
          Object.assign(challenge, { challenged, status: STATUS_FINISHED });
          const challengedName = ChallengeUtils.getUsersFirstNames(challenge).challengedName;
          const notif = {
            challenge,
            alert: { title: `Challenge Declined ${emojis.thumbs.down}`, body: `${challengedName} Has Declined Your Challenge` },
            actions: [pn.actions.viewChallenge, pn.actions.viewChallenges],
          };
          app.models.notification.notify(challenge.challenger.userId, notif);
        }
        Challenge.upsert(challenge, (upsertErr) => {
          cb(upsertErr, challenge);
        });
      }
    });
  };

  Object.assign(Challenge, { decline });
  Challenge.remoteMethod('decline', remoteMethodConfig.getChallengeDecline());

  const hide = (req, id, cb = () => null) => {
    Challenge.findById(id, (err, challenge) => {
      if (err) {
        cb(err);
      } else {
        ChallengeUtils.hideChallengeForUser(req.accessToken.userId.toString(), challenge);
        Challenge.upsert(challenge, upsertErr => cb(upsertErr, challenge));
      }
    });
  };

  Object.assign(Challenge, { hide });
  Challenge.remoteMethod('hide', remoteMethodConfig.getChallengeHide());
};
