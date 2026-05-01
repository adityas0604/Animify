'use strict';

const jwt = require('jsonwebtoken');

// HTTP API v2 simple-response format.
// API Gateway calls this before any protected Lambda; isAuthorized: false
// rejects the request without ever invoking the downstream handler.
// The context object is forwarded to downstream handlers via
// event.requestContext.authorizer.lambda.*
exports.handler = async (event) => {
  const token = event.headers?.authorization?.split(' ')[1];
  if (!token) return { isAuthorized: false };
  try {
    const { userId } = jwt.verify(token, process.env.JWT_SECRET);
    return { isAuthorized: true, context: { userId } };
  } catch {
    return { isAuthorized: false };
  }
};
