const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const STRONG_PASSWORD_PATTERN =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{8,}$/

export function normalizeEmail(value: string) {
  return value.trim().toLowerCase()
}

export function validateEmail(email: string) {
  const normalized = normalizeEmail(email)

  if (!normalized) {
    return 'Email is required.'
  }

  if (!EMAIL_PATTERN.test(normalized)) {
    return 'Enter a valid email address.'
  }

  return null
}

export function validateStrongPassword(password: string) {
  if (!password) {
    return 'Password is required.'
  }

  if (!STRONG_PASSWORD_PATTERN.test(password)) {
    return 'Use at least 8 characters with uppercase, lowercase, number, and symbol.'
  }

  return null
}

export function validatePasswordConfirmation(
  password: string,
  confirmPassword: string
) {
  if (!confirmPassword) {
    return 'Please confirm your password.'
  }

  if (password !== confirmPassword) {
    return 'Passwords do not match.'
  }

  return null
}
