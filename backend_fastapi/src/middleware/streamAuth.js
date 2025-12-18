'use strict';
/**
 * Allows providing token via query param for media element requests where setting headers is harder.
 * It sets Authorization header format in request for downstream authRequired middleware.
 */
function tokenFromQueryToHeader(req, _res, next) {
  const token = req.query.token;
  if (token && !req.headers.authorization) {
    req.headers.authorization = `Bearer ${token}`;
  }
  next();
}

module.exports = { tokenFromQueryToHeader };
