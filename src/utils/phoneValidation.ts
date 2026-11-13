export interface PhoneValidationResult {
  valid: boolean;
  normalized: string;
  error?: string;
}

const SA_ERROR_MSG = 'Enter a valid South African number: +27 XX XXX XXXX or 0XX XXX XXXX';

/**
 * Validates and normalizes South African phone numbers (+27 or local 0XX format).
 * Accepts optional spaces, hyphens, parentheses, or dots.
 */
export function validateSouthAfricanPhone(raw: string, required: boolean = true): PhoneValidationResult {
  const trimmed = (raw || '').trim();
  if (!trimmed) {
    if (!required) {
      return { valid: true, normalized: '' };
    }
    return { valid: false, normalized: '', error: SA_ERROR_MSG };
  }

  const compact = trimmed.replace(/[\s\-().]/g, '');

  let localNineDigits = '';
  if (/^\+27[1-9][0-9]{8}$/.test(compact)) {
    localNineDigits = compact.slice(3);
  } else if (/^27[1-9][0-9]{8}$/.test(compact)) {
    localNineDigits = compact.slice(2);
  } else if (/^0[1-9][0-9]{8}$/.test(compact)) {
    localNineDigits = compact.slice(1);
  } else {
    return { valid: false, normalized: trimmed, error: SA_ERROR_MSG };
  }

  const normalized = `+27 ${localNineDigits.slice(0, 2)} ${localNineDigits.slice(2, 5)} ${localNineDigits.slice(5, 9)}`;
  return { valid: true, normalized };
}

/**
 * Converts a stored South African phone string into numeric digits (no leading +) for wa.me links.
 */
export function formatPhoneToWhatsAppDigits(raw?: string): string {
  const digits = (raw || '').replace(/[^\d]/g, '');
  if (!digits) return '';
  if (digits.startsWith('0') && digits.length === 10) {
    return `27${digits.slice(1)}`;
  }
  return digits;
}
