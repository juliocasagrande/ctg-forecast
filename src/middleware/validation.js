/**
 * Strong password policy:
 * - Min 8 characters
 * - At least 1 uppercase
 * - At least 1 lowercase
 * - At least 1 number
 */

export function validatePassword(password) {
  if (!password || typeof password !== 'string') {
    return { valid: false, error: 'Senha é obrigatória' };
  }
  if (password.length < 8) {
    return { valid: false, error: 'Senha deve ter ao menos 8 caracteres' };
  }
  if (!/[A-Z]/.test(password)) {
    return { valid: false, error: 'Senha deve conter ao menos uma letra maiúscula' };
  }
  if (!/[a-z]/.test(password)) {
    return { valid: false, error: 'Senha deve conter ao menos uma letra minúscula' };
  }
  if (!/[0-9]/.test(password)) {
    return { valid: false, error: 'Senha deve conter ao menos um número' };
  }
  return { valid: true };
}

/**
 * Sanitize string inputs to prevent XSS in stored content
 */
export function sanitizeString(str) {
  if (typeof str !== 'string') return str;
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}
