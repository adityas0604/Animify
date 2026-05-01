'use strict';

const serverless = require('serverless-http');
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/user');

function makeHandler(mountPath, router) {
  const app = express();
  app.use(cors());
  app.use(bodyParser.json());
  app.use(mountPath, router);
  return serverless(app);
}

const authHandler = makeHandler('/auth', authRoutes);
const userHandler = makeHandler('/user', userRoutes);

module.exports.signup         = authHandler;
module.exports.login          = authHandler;
module.exports.getVideos      = userHandler;
module.exports.generate       = userHandler;
module.exports.compile        = userHandler;
module.exports.getVideoStatus = userHandler;
module.exports.getPrompts     = userHandler;
module.exports.getCode        = userHandler;
module.exports.clearHistory   = userHandler;
