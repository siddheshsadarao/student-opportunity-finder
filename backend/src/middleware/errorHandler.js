/**
 * Central error handling.
 *
 *  notFound      -> runs when no route matched the URL (404)
 *  errorHandler  -> the last middleware; turns any thrown error into JSON
 *
 * Every response from this API has the same shape, which makes the React
 * side very simple:
 *    success:  { success: true,  data: ... }
 *    failure:  { success: false, message: "...", errors: [...] }
 */
import config from '../config/env.js';
import ApiError from '../utils/ApiError.js';

export function notFound(req, res, next) {
  next(ApiError.notFound(`Route ${req.method} ${req.originalUrl} does not exist.`));
}

// eslint-disable-next-line no-unused-vars -- Express needs all four arguments
export function errorHandler(err, req, res, next) {
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Something went wrong on the server.';

  // --- Translate common PostgreSQL errors into friendly messages ----------
  if (err.code === '23505') {
    // unique_violation
    statusCode = 409;
    message = 'That record already exists.';
  } else if (err.code === '23503') {
    // foreign_key_violation
    statusCode = 400;
    message = 'Related record not found. Please check the selected values.';
  } else if (err.code === '23514') {
    // check_violation
    statusCode = 400;
    message = 'One of the values is not allowed. Please check the form.';
  } else if (err.code === 'ECONNREFUSED') {
    statusCode = 503;
    message = 'A required service is not running. Please try again shortly.';
  }

  if (statusCode >= 500) {
    console.error('[error]', err);
  }

  res.status(statusCode).json({
    success: false,
    message,
    errors: err.details || undefined,
    // The stack trace is only exposed while developing.
    stack: config.isProduction ? undefined : err.stack,
  });
}

export default { notFound, errorHandler };
