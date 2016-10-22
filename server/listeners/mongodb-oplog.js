'use strict';

const fs = require('fs');
const path = require('path');
const MongoOplog = require('mongo-oplog');

const app = require(path.join(__dirname, '..', 'server'));

const challengeService = app._ramen.challengeService;
const userService = app._ramen.userService;
const identityService = app._ramen.identityService;

const oplog = MongoOplog('mongodb://52.34.61.128:27017/topRamen').tail();

oplog.on('op', data => {

  try {

    let obj = data.o;

    if (!data.ns) return;

    let cacheNs = data.ns.split('.')[1];

    if (cacheNs === 'user') {
      userService.clearCacheById(obj._id.toString()).catch(err => console.error(err));
    }

    if (cacheNs === 'challenge') {
      if (obj.challenger && obj.challenger.userId)
        challengeService.clearCacheById(obj.challenger.userId).catch(err => console.error(err));
      if (obj.challenged && obj.challenged.userId)
        challengeService.clearCacheById(obj.challenged.userId).catch(err => console.error(err));
    }

    if (cacheNs === 'userIdentity') {
      identityService.clearCacheById(obj._id.toString()).catch(err => console.error(err));
    }

  } catch (err) {
    console.error(err);
  }

});

oplog.on('error', err => console.error(err));

oplog.on('end', () => console.log('ended: listener mongodb-oplog'));

fs.writeFileSync(app.get('mongoDbOplogPid'), process.pid);

console.log('started: listener [mongodb-oplog]');