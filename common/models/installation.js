'use strict';

module.exports = function(Installation) {

  Installation.observe('after delete', function(ctx, next) {

    console.log(`deleted installation where ${ctx.where}`);
    next();

  });

};
