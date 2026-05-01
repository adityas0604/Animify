'use strict';

const jwt = require('jsonwebtoken');

// HTTP API v2 simple-response format.
// API Gateway calls this before any protected Lambda; isAuthorized: false
// rejects the request without ever invoking the downstream handler.
// The context object is forwarded to downstream handlers via
// event.requestContext.authorizer.lambda.*
exports.handler = async (event) => {
  console.log("Authorizer event:", event);
  const token = event.headers?.Authorization?.split(' ')[1] || event.headers?.authorization?.split(' ')[1];
  console.log("Authorizer token:", token);
  if (!token) {
    console.log("Authorizer token NOT FOUND");
    return { isAuthorized: false };
  }
  try {
    const { userId } = jwt.verify(token, process.env.JWT_SECRET);
    console.log("Authorizer token VERIFIED");
    return { isAuthorized: true, context: { userId: String(userId) } };
  } catch (error) {
    console.log("Authorizer token VERIFICATION ERROR:", error);
    return { isAuthorized: false };
  }
};
