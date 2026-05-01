'use strict';

const serverless = require('serverless-http');
const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/user');

function makeHandler(mountPath, router) {
  const app = express();
  app.use(cors( { origin: "*"}));
  app.use((req, res, next) => {
    if (req.apiGateway?.event?.body && typeof req.apiGateway.event.body === "string") {
      try {
        req.body = JSON.parse(req.apiGateway.event.body);
      } catch {
        req.body = req.apiGateway.event.body;
      }
    }
    next();
  });
  app.use(express.json());
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
