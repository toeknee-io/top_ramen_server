'use strict';

const _ = require('lodash');
const app = require('../server');

const TopRamenService = require('./base-service');

class IdentityService extends TopRamenService {

  constructor(opts) {
    super({ model: opts.model, nameSpace: 'identities' });
  }

  getByUserId(userId) {
    return new this.Promise((resolve, reject) => {
      if (!userId) reject(new Error(`Invalid userId provided to IdentityService.getByUserId ${userId}`));

      const CACHE_KEY = `${this.nameSpace}:${userId}`;
      const memcached = this.getMemcachedClient();

      memcached.get(CACHE_KEY, (err, data) => {
        if (err) reject(err);
        else if (data) {
          console.log(`got ${CACHE_KEY} from cache`);
          resolve(data);
        } else {
          console.log(`getting ${CACHE_KEY} from database`);
          app.models.user.findById(userId, { include: [this.nameSpace] },
            (findUserErr, user) => {
              if (findUserErr) {
                reject(findUserErr);
              } else if (!user) {
                resolve();
              } else {
                let identities = user.__data[this.nameSpace] || user[this.nameSpace];
                if (_.isArray(identities) && !_.isEmpty(identities) && !_.isNil(identities[0])) {
                  identities = _.castArray(identities);
                  this.setCacheById(userId, identities);
                }
                resolve(identities);
              }
            }
          );
        }
      });
    });
  }

  getByExternalId(externalId) {
    return new this.Promise((resolve, reject) => {
      if (!externalId) reject(new Error(`Invalid externalId provided to IdentityService.getByExternalId ${externalId}`));

      const CACHE_KEY = `${this.nameSpace}:externalId:${externalId}`;
      const memcached = this.getMemcachedClient();

      memcached.get(CACHE_KEY, (err, data) => {
        if (err) {
          reject(err);
        } else if (data) {
          console.log(`got ${CACHE_KEY} from cache`);
          resolve(data);
        } else {
          console.log(`getting ${CACHE_KEY} from database`);
          app.models.userIdentity.find({ where: { externalId } },
            (findErr, identities) => {
              if (findErr) {
                reject(findErr);
              } else if (identities) {
                const result = _.castArray(identities);
                resolve(result);
                this.setCacheByKey(CACHE_KEY, _.castArray(result));
              }
            }
          );
        }
      });
    });
  }
}

module.exports = IdentityService;
