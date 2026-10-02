export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateEmail(email: string): ValidationResult {
  const errors: string[] = [];
  if (!email) errors.push('Email is required');
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push('Invalid email format');
  return { valid: errors.length === 0, errors };
}

export function validateRequired(value: string, fieldName: string): ValidationResult {
  const errors: string[] = [];
  if (!value || value.trim().length === 0) errors.push(`${fieldName} is required`);
  return { valid: errors.length === 0, errors };
}

export function validatePassword(password: string): ValidationResult {
  const errors: string[] = [];
  if (!password) errors.push('Password is required');
  else if (password.length < 8) errors.push('Password must be at least 8 characters');
  else if (!/[A-Z]/.test(password)) errors.push('Password must contain at least one uppercase letter');
  else if (!/[0-9]/.test(password)) errors.push('Password must contain at least one number');
  return { valid: errors.length === 0, errors };
}
