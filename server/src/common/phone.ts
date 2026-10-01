export function normalizeIndianPhone(raw: string): string {
  const compact = raw.trim().replace(/[\s()-]/g, '');
  if (/^\+[1-9]\d{9,14}$/.test(compact)) {
    return compact;
  }
  const digits = compact.replace(/\D/g, '');
  if (/^[6-9]\d{9}$/.test(digits)) {
    return `+91${digits}`;
  }
  if (/^0[6-9]\d{9}$/.test(digits)) {
    return `+91${digits.slice(1)}`;
  }
  if (/^91[6-9]\d{9}$/.test(digits)) {
    return `+${digits}`;
  }
  return compact;
}

export const PHONE_HINT = 'Enter a 10-digit Indian mobile number, like 9876543210';
