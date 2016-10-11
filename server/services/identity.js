'use strict';

const path = require('path');

const app = require(path.join(__dirname, '..', 'server'));

const TopRamenService = require(path.join(__dirname, 'base-service'));

class IdentityService extends TopRamenService {

  constructor(opts) {
    super({ model: opts.model, nameSpace: 'identities'});
  }

  getByUserId(userId) {
    return new this.Promise((resolve, reject) => {

      if (!userId) reject(new Error(`Invalid userId provided to IdentityService.getByUserId ${userId}`));

      let CACHE_KEY = `${this.nameSpace}:${userId}`;
      let memcached = this.getMemcachedClient();

      memcached.get(CACHE_KEY, (err, data) => {
        if (err) reject(err);
        if (data) {
          resolve(data);
        } else {
          console.log(`getting ${CACHE_KEY} from database`);
          app.models.user.findById(userId, { include: [this.nameSpace] }, (err, user) => {
            if (err) return reject(err);
            if (!user) return resolve();
            this.setCacheById(userId, user.__data[this.nameSpace]).catch(err => console.error(err));
            resolve(user.__data[this.nameSpace]);
          });
        }

      });

    });
  }

}

module.exports = IdentityService;