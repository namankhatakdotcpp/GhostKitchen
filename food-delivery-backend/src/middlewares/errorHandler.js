import { logger } from '../utils/logger.js'
import { captureException } from '../config/sentry.js'

export const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next)
}

export const globalErrorHandler = (err, req, res, next) => {
  logger.error({
    message: err.message,
    stack: err.stack,
    requestId: req.id,
    path: req.path,
    userId: req.user?.userId,
  })

  // Only send non-operational errors to Sentry (operational = expected, user-facing)
  if (!err.isOperational) {
    captureException(err, { path: req.path, userId: req.user?.userId })
  }

  if (err.isOperational) {
    return res.status(err.statusCode).json({
      error: err.message,
      code: err.code,
    })
  }

  if (err.code === 'P2002') {
    return res.status(409).json({ error: 'Already exists', code: 'DUPLICATE' })
  }
  if (err.code === 'P2025') {
    return res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' })
  }
  if (err.code === 'P2003') {
    return res.status(409).json({
      error: 'Cannot delete: other records still reference this item',
      code: 'CONSTRAINT',
    })
  }

  return res.status(500).json({
    error: process.env.NODE_ENV === 'production'
      ? 'Something went wrong'
      : err.message,
  })
}
