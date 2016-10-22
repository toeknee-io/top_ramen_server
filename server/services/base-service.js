'use strict';

const path = require('path');
const Promise = require("bluebird");

const app = require(path.join(__dirname, '..', 'server'));

const Memcached = require('memcached');

Memcached.config.poolSize = 25;
Memcached.config.timeout = 1000;
Memcached.config.maxExpiration = 2592000;

const memcached = new Memcached('localhost');

class TopRamenService {

  constructor(opts) {

    if (!opts.model || !opts.nameSpace) throw new Error(`Service class instantiation missing model [${opts.model}] or nameSpace [${opts.nameSpace}]`);

    this.model = opts.model;
    this.nameSpace = opts.nameSpace;
    this.cacheExpiration = opts.maxExpiration || memcached.maxExpiration;
    this.Promise = Promise;

  }

  getById(id) {
    return new Promise((resolve, reject) => {
      let CACHE_KEY = `${this.nameSpace}:${id}`;
      memcached.get(CACHE_KEY, (err, data) => {
        if (err) console.error(err);
        if (data) {
          resolve(data);
          console.log(`got cache for ${CACHE_KEY}`);
        } else {
          console.log(`getting ${CACHE_KEY} from database`);
          this.model.findById(id, (err, result) => {
            if (err) return reject(err);
            if (result.__data) result = result.__data;
            resolve(result);
          });
        }
      });
    });
  }

  setCacheById(id, data) {
    return new Promise((resolve, reject) => {
      memcached.set(`${this.nameSpace}:${id}`, data, this.cacheExpiration, err => {
        if (err) reject(err);
        else {
          resolve();
          console.log(`set cache for ${this.nameSpace}:${id}`);
        }
      });
    });
  }

  replaceCacheById(id, data) {
    return new Promise((resolve, reject) => {
      memcached.replace(`${this.nameSpace}:${id}`, data, this.cacheExpiration, err => {
        if (err) reject(err);
        else {
          resolve();
          console.log(`replaced cache for ${this.nameSpace}:${id}`);
        }
      });
    });
  }

  clearCacheById(id) {
    return new Promise((resolve, reject) => {
      memcached.del(`${this.nameSpace}:${id}`, err => {
        if (err) reject(err);
        else {
          console.log(`cleared cache for ${this.nameSpace}:${id}`);
          resolve();
        }
      });
    });
  }

  getMemcachedClient() {
    return memcached;
  }

}

module.exports = TopRamenService;