/**
 * Express 4 does not catch errors thrown inside async functions.
 * Without this wrapper every controller would need its own try/catch.
 *
 * Usage:
 *   router.get('/', asyncHandler(async (req, res) => { ... }));
 *
 * Any rejected promise is forwarded to next(), which sends it to the
 * central error handler in middleware/errorHandler.js.
 */
export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

export default asyncHandler;
