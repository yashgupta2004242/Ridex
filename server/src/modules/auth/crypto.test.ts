import { safeEqualHex, sha256 } from './crypto';

describe('safeEqualHex', () => {
  it('accepts equal hashes and rejects different ones without throwing', () => {
    const left = sha256('phone:123456');
    expect(safeEqualHex(left, sha256('phone:123456'))).toBe(true);
    expect(safeEqualHex(left, sha256('phone:000000'))).toBe(false);
    expect(safeEqualHex('aa', 'bbcc')).toBe(false);
  });
});
