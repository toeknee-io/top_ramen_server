'use strict';

const path = require('path');

const app = require(path.join('..', 'server.js'));

const TopRamenService = require(path.join(__dirname, 'base-service'));

class UserService extends TopRamenService {

  constructor(opts) {
    super({ model: opts.model || app.models.user, nameSpace: 'users'});
  }

  getByUserId(userId) {
    return this.getById(userId);
  }

}

module.exports = UserService;