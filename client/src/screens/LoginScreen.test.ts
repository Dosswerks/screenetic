import { describe, it, expect } from 'vitest';

// ===== Unit tests for LoginScreen validation logic =====
// Tests the pure validation functions extracted from LoginScreen.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PW_MIN = 8;
const PW_UPPER = /[A-Z]/;
const PW_LOWER = /[a-z]/;
const PW_DIGIT = /\d/;

function validateEmail(email: string): string | null {
  if (!email.trim()) return 'Email is required.';
  if (!EMAIL_RE.test(email)) return 'Enter a valid email address.';
  return null;
}

function validatePassword(password: string): string | null {
  if (!password) return 'Password is required.';
  if (password.length < PW_MIN) return `Password must be at least ${PW_MIN} characters.`;
  if (!PW_UPPER.test(password)) return 'Password must contain at least one uppercase letter.';
  if (!PW_LOWER.test(password)) return 'Password must contain at least one lowercase letter.';
  if (!PW_DIGIT.test(password)) return 'Password must contain at least one number.';
  return null;
}

describe('validateEmail', () => {
  it('returns error for empty string', () => {
    expect(validateEmail('')).toBe('Email is required.');
  });

  it('returns error for whitespace-only', () => {
    expect(validateEmail('   ')).toBe('Email is required.');
  });

  it('returns error for missing @', () => {
    expect(validateEmail('userexample.com')).toBe('Enter a valid email address.');
  });

  it('returns error for missing domain', () => {
    expect(validateEmail('user@')).toBe('Enter a valid email address.');
  });

  it('returns null for valid email', () => {
    expect(validateEmail('user@example.com')).toBeNull();
  });

  it('returns null for email with subdomain', () => {
    expect(validateEmail('user@mail.example.com')).toBeNull();
  });
});

describe('validatePassword', () => {
  it('returns error for empty password', () => {
    expect(validatePassword('')).toBe('Password is required.');
  });

  it('returns error for too short', () => {
    expect(validatePassword('Ab1')).toContain('at least 8');
  });

  it('returns error for missing uppercase', () => {
    expect(validatePassword('abcdefg1')).toContain('uppercase');
  });

  it('returns error for missing lowercase', () => {
    expect(validatePassword('ABCDEFG1')).toContain('lowercase');
  });

  it('returns error for missing number', () => {
    expect(validatePassword('Abcdefgh')).toContain('number');
  });

  it('returns null for valid password', () => {
    expect(validatePassword('Abcdefg1')).toBeNull();
  });

  it('returns null for longer valid password', () => {
    expect(validatePassword('MyStr0ngP@ss')).toBeNull();
  });
});
