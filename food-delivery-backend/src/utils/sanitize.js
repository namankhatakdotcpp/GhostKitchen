import xss from 'xss'

export function sanitizeString(input) {
  if (typeof input !== 'string') return input
  return xss(input.trim(), {
    whiteList: {},
    stripIgnoreTag: true,
    stripIgnoreTagBody: ['script', 'style'],
  })
}

export function sanitizeObject(obj) {
  if (Array.isArray(obj)) {
    return obj.map((item) =>
      typeof item === 'string' ? sanitizeString(item) : sanitizeObject(item)
    )
  }
  if (typeof obj !== 'object' || obj === null) return obj
  const clean = {}
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      clean[key] = sanitizeString(value)
    } else if (Array.isArray(value)) {
      clean[key] = sanitizeObject(value)
    } else if (typeof value === 'object') {
      clean[key] = sanitizeObject(value)
    } else {
      clean[key] = value
    }
  }
  return clean
}
