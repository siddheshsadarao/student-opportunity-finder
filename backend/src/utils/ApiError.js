/**
 * A custom Error subclass that carries an HTTP status code.
 *
 * Controllers throw `new ApiError(404, 'Opportunity not found')` and the
 * central error handler turns that into a proper JSON response. This keeps
 * every controller free of repetitive res.status(...).json(...) blocks.
 */
export class ApiError extends Error {
  constructor(statusCode, message, details = null) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
    this.isOperational = true; // an expected error, not a programming bug
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(message = 'Bad request', details = null) {
    return new ApiError(400, message, details);
  }

  static unauthorized(message = 'You must be logged in') {
    return new ApiError(401, message);
  }

  static forbidden(message = 'You do not have permission to do that') {
    return new ApiError(403, message);
  }

  static notFound(message = 'Resource not found') {
    return new ApiError(404, message);
  }

  static conflict(message = 'Resource already exists') {
    return new ApiError(409, message);
  }
}

export default ApiError;
