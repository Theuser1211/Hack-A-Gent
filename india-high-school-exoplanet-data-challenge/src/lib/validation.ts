export function validateEmail(email: string): boolean {
  return /^[^s@]+@[^s@]+.[^s@]+$/.test(email);
}

export function validateRequired(value: string): boolean {
  return value.trim().length > 0;
}
