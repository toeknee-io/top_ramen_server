'use strict';

const fs = require('fs');
const _ = require('lodash');
const mongoOplog = require('mongo-oplog');

const app = require('../server');

const userService = app._ramen.userService;
const identityService = app._ramen.identityService;
const challengeService = app._ramen.challengeService;

const oplog = mongoOplog('mongodb://52.34.61.128:27017/topRamen').tail();

const getVars = (doc) => {
  const obj = _.attempt(() => doc.o);
  const id = _.attempt(() => {
    let res = null;
    if (doc.op === 'u' && doc.o2 && doc.o2._id) {
      res = doc.o2._id.toString();
    } else if (doc.op === 'i' && doc.o && doc.o._id) {
      res = doc.o._id.toString();
    }
    return res;
  });
  const ns = _.attempt(() => doc.ns.split('.')[1]);
  return [obj, id, ns];
};

oplog.on('insert', (doc) => {
  const res = _.attempt(() => {
    const [obj, , ns] = getVars(doc);
    if (ns && !_.isError(ns) && ns === 'challenge' && !_.isError(obj)) {
      if (obj.challenger && obj.challenger.userId) {
        challengeService.clearCacheById(obj.challenger.userId).catch(err => console.error(err));
      }
      if (obj.challenged && obj.challenged.userId) {
        challengeService.clearCacheById(obj.challenged.userId).catch(err => console.error(err));
      }
    }
  });

  if (_.isError(res)) {
    console.error('oplog.onInsert error: %j', res);
  }
});

oplog.on('update', (doc) => {
  const res = _.attempt(() => {
    const [obj, id, ns] = getVars(doc);
    if (_.isError(ns)) return;

    if (ns === 'user' && !_.isEmpty(id) && !_.isError(id)) {
      userService.clearCacheById(id).catch(err => console.error(err));
      identityService.clearCacheById(id).catch(err => console.error(err));
    }

    if (ns === 'userIdentity' && !_.isEmpty(obj) && !_.isError(obj)) {
      if (typeof obj.userId === 'string') {
        identityService.clearCacheById(obj.userId).catch(err => console.error(err));
      }
      if (typeof obj.$set.profile.id === 'string') {
        identityService.clearCacheByKey(`identities:externalId:${obj.$set.profile.id}`).catch(err => console.error(err));
      }
    }

    if (ns === 'challenge' && !_.isEmpty(obj) && !_.isError(obj)) {
      if (obj.challenger && obj.challenger.userId) {
        challengeService.clearCacheById(obj.challenger.userId).catch(err => console.error(err));
      }
      if (obj.challenged && obj.challenged.userId) {
        challengeService.clearCacheById(obj.challenged.userId).catch(err => console.error(err));
      }
    }
  });

  if (_.isError(res)) {
    console.error('oplog.onUpdate error: %j', res);
  }
});

oplog.on('error', err => console.error(err));
oplog.on('end', () => console.log('ended: listener mongodb-oplog'));

fs.writeFileSync(app.get('mongoDbOplogPid'), process.pid);

console.log('started: listener (event: mongodb-oplog)');

