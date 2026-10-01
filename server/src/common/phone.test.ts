import { normalizeIndianPhone } from './phone';

describe('normalizeIndianPhone', () => {
  it('accepts a 10-digit Indian mobile and prefixes +91', () => {
    expect(normalizeIndianPhone('7973311270')).toBe('+917973311270');
    expect(normalizeIndianPhone('98765 43210')).toBe('+919876543210');
    expect(normalizeIndianPhone('09876543210')).toBe('+919876543210');
    expect(normalizeIndianPhone('+919876543210')).toBe('+919876543210');
  });
});
