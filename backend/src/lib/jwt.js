export function getJwtSecret() {
  const secret = process.env.JWT_SECRET;

  if (typeof secret !== 'string' || secret.trim() === '') {
    const error = new Error('Server configuration error: JWT_SECRET is required.');
    error.code = 'JWT_SECRET_MISSING';
    throw error;
  }

  return secret;
}