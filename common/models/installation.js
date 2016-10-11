'use strict';

const inspect = require('util').inspect;

module.exports = function(Installation) {

  Installation.observe('after delete', function(ctx, next) {

    console.log(`deleted installation where ${inspect(ctx.where)}`);
    next();

  });

};
