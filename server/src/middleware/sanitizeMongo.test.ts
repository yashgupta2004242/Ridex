import { sanitizeMongo } from './sanitizeMongo';
import type { Request, Response } from 'express';

function mockRes(): Response {
  return {} as Response;
}

describe('sanitizeMongo', () => {
  it('strips $ operators from JSON bodies', () => {
    const req = {
      body: { email: 'a@b.com', $gt: '' },
      params: {},
      query: {},
    } as unknown as Request;

    sanitizeMongo(req, mockRes(), () => undefined);

    expect(req.body).toEqual({ email: 'a@b.com' });
    expect(req.body).not.toHaveProperty('$gt');
  });
});
