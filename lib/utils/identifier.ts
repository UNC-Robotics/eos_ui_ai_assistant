// Mirrors the backend identifier rule in eos/configuration/utils.py.
export const IDENTIFIER_PATTERN = /^[a-zA-Z0-9_-]+(?: [a-zA-Z0-9_-]+)*$/;

export const IDENTIFIER_ERROR_MESSAGE = 'Allowed: letters, digits, underscores, dashes, single spaces.';

export function isValidIdentifier(value: string): boolean {
  return IDENTIFIER_PATTERN.test(value);
}
