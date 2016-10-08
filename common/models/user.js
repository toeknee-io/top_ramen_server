'use strict';

const path = require('path');
var config = require('../../server/config.json');
const rp = require('request-promise').defaults({ json: true, timeout: 5000 });

module.exports = function(User) {

  User.observe('before save', function (ctx, next) {
    let user = ctx.instance || ctx.data;
    user.modified = new Date();
    next();
  });

  //send password reset link when requested
  User.on('resetPasswordRequest', function(info) {
    var url = 'http://' + config.host + ':' + config.port + '/reset-password';
    var html = 'Click <a href="' + url + '?access_token=' +
        info.accessToken.id + '">here</a> to reset your password';

    User.app.models.Email.send({
      to: info.email,
      from: info.email,
      subject: 'Password reset',
      html: html
    }, function(err) {
      if (err) return console.log('> error sending password reset email');
      console.log('> sending password reset email to:', info.email);
    });
  });

  User.social = function(userId, cb) {

    if (!cb) cb = () => null

    let results = {};

    User.findById(userId, { include: ['identities'] }, function(err, user) {

      let identities = user.__data.identities;

      identities.forEach(function(identity) {

        if (identity.__data.provider === 'facebook') {

          let token = identity.__data.credentials.accessToken;

          rp.get(`https://graph.facebook.com/me/friends?access_token=${token}`)
            .then((res) => {
              results.facebook = {};
              results.facebook.displayName = identity.__data.profile.displayName;
              results.facebook.picture = `https://graph.facebook.com/me/picture?access_token=${token}&type=large`;
              results.facebook.friends = res.data;
              cb(null, results); })
            .catch(err => cb(err));
        }

      });

    });

  };

  User.remoteMethod(
    'social',
    {
      description: "Find all of the user's Top Ramen friends.",
      http: {
        verb: "get",
        status: 200,
        path: "/social/:userId/"
      },
      accepts: [
        {
          arg: 'userId',
          type: 'string',
          http: {
            source: 'path'
          },
          required: true
        }
      ],
      returns: {
        type: Object,
        root: true
      }
    }
  );

};