import { prisma } from '../config/prisma.js'
import { logger } from './logger.js'

export async function auditLog({ userId, action, entityType, entityId, meta, req }) {
  try {
    await prisma.auditLog.create({
      data: {
        userId,
        action,
        entityType,
        entityId,
        meta,
        ipAddress: req?.ip,
        userAgent: req?.get('user-agent'),
      }
    })
  } catch (err) {
    logger.error('Audit log failed:', { error: err.message })
  }
}
