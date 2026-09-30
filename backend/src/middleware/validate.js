/**
 * Input validation using express-validator.
 *
 * Each route declares a list of rules (see the *Rules exports below) and then
 * calls `validate`, which collects the errors and returns 400 with a list the
 * React forms can display field by field.
 *
 * Validating on the server matters because the browser form can be bypassed
 * -- anyone can call the API directly with curl or Postman.
 */
import { body, param, query as q, validationResult } from 'express-validator';
import ApiError from '../utils/ApiError.js';

/** Stops the request if any rule failed. */
export function validate(req, res, next) {
  const result = validationResult(req);
  if (result.isEmpty()) return next();

  const errors = result.array().map((e) => ({
    field: e.path,
    message: e.msg,
  }));
  return next(ApiError.badRequest('Please fix the highlighted fields.', errors));
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------
export const registerRules = [
  body('name').trim().isLength({ min: 2, max: 120 }).withMessage('Name must be at least 2 characters.'),
  body('email').trim().isEmail().withMessage('Enter a valid email address.').normalizeEmail(),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters.')
    .matches(/[A-Za-z]/)
    .withMessage('Password must contain a letter.')
    .matches(/\d/)
    .withMessage('Password must contain a number.'),
  body('confirmPassword').custom((value, { req }) => {
    if (value !== req.body.password) throw new Error('Passwords do not match.');
    return true;
  }),
  body('college').optional({ values: 'falsy' }).trim().isLength({ max: 160 }),
  body('degree').optional({ values: 'falsy' }).trim().isLength({ max: 40 }),
  body('branch').optional({ values: 'falsy' }).trim().isLength({ max: 80 }),
  body('year').optional({ values: 'falsy' }).isInt({ min: 1, max: 6 }).withMessage('Year must be between 1 and 6.'),
  body('city').optional({ values: 'falsy' }).trim().isLength({ max: 80 }),
];

export const loginRules = [
  body('email').trim().isEmail().withMessage('Enter a valid email address.').normalizeEmail(),
  body('password').notEmpty().withMessage('Password is required.'),
];

export const changePasswordRules = [
  body('currentPassword').notEmpty().withMessage('Current password is required.'),
  body('newPassword')
    .isLength({ min: 8 })
    .withMessage('New password must be at least 8 characters.')
    .matches(/[A-Za-z]/)
    .withMessage('Password must contain a letter.')
    .matches(/\d/)
    .withMessage('Password must contain a number.'),
];

export const resetPasswordRules = [
  body('email').trim().isEmail().withMessage('Enter a valid email address.').normalizeEmail(),
  body('newPassword')
    .isLength({ min: 8 })
    .withMessage('New password must be at least 8 characters.')
    .matches(/[A-Za-z]/)
    .withMessage('Password must contain a letter.')
    .matches(/\d/)
    .withMessage('Password must contain a number.'),
];

// ---------------------------------------------------------------------------
// Student profile / onboarding
// ---------------------------------------------------------------------------
export const profileRules = [
  body('college').optional({ values: 'null' }).trim().isLength({ max: 160 }),
  body('degree').optional({ values: 'null' }).trim().isLength({ max: 40 }),
  body('branch').optional({ values: 'null' }).trim().isLength({ max: 80 }),
  body('year').optional({ values: 'null' }).isInt({ min: 1, max: 6 }).withMessage('Year must be between 1 and 6.'),
  body('city').optional({ values: 'null' }).trim().isLength({ max: 80 }),
  body('careerGoal').optional({ values: 'null' }).trim().isLength({ max: 80 }),
  body('preferredMode')
    .optional({ values: 'null' })
    .isIn(['Remote', 'Hybrid', 'On-site', 'Any'])
    .withMessage('Work mode must be Remote, Hybrid, On-site or Any.'),
  body('preferredLocation').optional({ values: 'null' }).trim().isLength({ max: 120 }),
  body('skills').optional().isArray().withMessage('Skills must be a list.'),
  body('interests').optional().isArray().withMessage('Interests must be a list.'),
  body('preferredCategories').optional().isArray().withMessage('Preferred categories must be a list.'),
];

// ---------------------------------------------------------------------------
// Opportunities (admin)
// ---------------------------------------------------------------------------
export const opportunityRules = [
  body('title').trim().isLength({ min: 3, max: 200 }).withMessage('Title must be 3-200 characters.'),
  body('organization').trim().isLength({ min: 2, max: 160 }).withMessage('Organization is required.'),
  body('categoryId').isInt({ min: 1 }).withMessage('Please choose a category.'),
  body('description').trim().isLength({ min: 20 }).withMessage('Description must be at least 20 characters.'),
  body('location').optional({ values: 'falsy' }).trim().isLength({ max: 120 }),
  body('mode').isIn(['Remote', 'Hybrid', 'On-site']).withMessage('Mode must be Remote, Hybrid or On-site.'),
  body('deadline').isISO8601().withMessage('Enter a valid deadline date.'),
  body('applicationUrl').trim().isURL().withMessage('Enter a valid application link (https://...).'),
  body('stipend').optional({ values: 'falsy' }).trim().isLength({ max: 120 }),
  body('duration').optional({ values: 'falsy' }).trim().isLength({ max: 80 }),
  body('source').optional({ values: 'falsy' }).trim().isLength({ max: 160 }),
  body('skills').optional().isArray().withMessage('Skills must be a list.'),
];

export const categoryRules = [
  body('name').trim().isLength({ min: 2, max: 60 }).withMessage('Category name is required.'),
  body('icon').optional({ values: 'falsy' }).trim().isLength({ max: 40 }),
  body('color').optional({ values: 'falsy' }).trim().isLength({ max: 20 }),
  body('description').optional({ values: 'falsy' }).trim(),
];

// ---------------------------------------------------------------------------
// Applications / shared
// ---------------------------------------------------------------------------
export const applicationStatusRules = [
  body('status')
    .isIn(['Planning to Apply', 'Applied', 'Shortlisted', 'Selected', 'Rejected'])
    .withMessage('Invalid application status.'),
  body('notes').optional({ values: 'null' }).trim().isLength({ max: 2000 }),
];

export const idParamRule = [param('id').isInt({ min: 1 }).withMessage('Invalid id.')];

export const listQueryRules = [
  q('page').optional().isInt({ min: 1 }).withMessage('Page must be 1 or more.'),
  q('limit').optional().isInt({ min: 1, max: 60 }).withMessage('Limit must be between 1 and 60.'),
];

export default { validate };
