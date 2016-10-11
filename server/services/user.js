'use strict';

const path = require('path');

const TopRamenService = require(path.join(__dirname, 'base-service'));

class UserService extends TopRamenService {

  constructor(opts) {
    super({ model: opts.model, nameSpace: 'users'});
  }

}

module.exports = UserService;