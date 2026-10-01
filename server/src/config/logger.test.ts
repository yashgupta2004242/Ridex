import { Writable } from 'node:stream';
import winston from 'winston';
import { createLogger } from './logger';

describe('logger redaction', () => {
  it('redacts passwords, tokens and OTPs from metadata', () => {
    const logger = createLogger('info');
    const output: string[] = [];
    logger.clear();
    logger.add(
      new winston.transports.Stream({
        stream: new Writable({
          write(chunk, _encoding, callback) {
            output.push(String(chunk));
            callback();
          },
        }),
      }),
    );

    logger.info('login', {
      password: 'secret-pass',
      token: 'abc',
      otp: '1234',
      email: 'rider@example.com',
    });

    const line = output.join(' ');
    expect(line).toContain('[REDACTED]');
    expect(line).not.toContain('secret-pass');
    expect(line).not.toContain('"abc"');
    expect(line).not.toContain('1234');
    expect(line).toContain('rider@example.com');
  });
});
