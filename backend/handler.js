'use strict';

const { handler: authorizer } = require('./handlers/authorizer');
const auth = require('./handlers/auth');
const user = require('./handlers/user');

module.exports.authorizer     = authorizer;
module.exports.signup         = auth.signup;
module.exports.login          = auth.login;
module.exports.getVideos      = user.getVideos;
module.exports.generate       = user.generate;
module.exports.compile        = user.compile;
module.exports.getVideoStatus = user.getVideoStatus;
module.exports.getPrompts     = user.getPrompts;
module.exports.getCode        = user.getCode;
module.exports.clearHistory   = user.clearHistory;
