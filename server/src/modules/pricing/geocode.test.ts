import { parseNominatim } from './geocode';

describe('parseNominatim', () => {
  it('keeps named coordinates', () => {
    expect(
      parseNominatim([
        { display_name: 'Indore, Madhya Pradesh, India', lat: '22.7196', lon: '75.8577' },
        { display_name: '', lat: '0', lon: '0' },
      ]),
    ).toEqual([{ label: 'Indore, Madhya Pradesh, India', lat: 22.7196, lng: 75.8577 }]);
  });
});
