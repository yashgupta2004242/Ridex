import { surgeMultiplier } from './surge';

describe('surgeMultiplier', () => {
  it('is 1x when demand is empty or balanced', () => {
    expect(surgeMultiplier(0, 10)).toBe(1);
    expect(surgeMultiplier(4, 4)).toBe(1);
    expect(surgeMultiplier(3, 10)).toBe(1);
  });

  it('tracks demand/supply and caps at 2.5x', () => {
    expect(surgeMultiplier(8, 4)).toBe(2);
    expect(surgeMultiplier(20, 4)).toBe(2.5);
    expect(surgeMultiplier(5, 0)).toBe(2.5);
  });
});
