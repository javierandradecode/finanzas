import 'reflect-metadata';
import { validateEnv } from './env.validation';

const SECRET_32 = 'a'.repeat(32);
const base = {
  MONGODB_URI: 'mongodb://localhost:27017/test',
  JWT_SECRET: 'a-secret-with-16c',
};
const prod = {
  ...base,
  NODE_ENV: 'production',
  JWT_SECRET: SECRET_32,
  CORS_ORIGIN: 'https://app.example.com',
};

describe('validateEnv', () => {
  describe('defaults and conversion', () => {
    it('accepts the development setup with a 16-character secret', () => {
      const env = validateEnv({ ...base });
      expect(env.PORT).toBe(3000);
      expect(env.CORS_ORIGIN).toBe('http://localhost:5173');
      expect(env.ALLOW_REGISTRATION).toBe(true);
      expect(env.RATE_LIMIT).toBe(100);
      expect(env.AUTH_RATE_LIMIT).toBe(10);
    });

    it.each([
      ['false', false],
      [false, false],
      ['true', true],
      [undefined, true],
      ['0', true], // only the word "false" closes registration
      ['no', true],
      ['', true],
    ])('ALLOW_REGISTRATION=%p → %p', (value, expected) => {
      const env = validateEnv({ ...base, ALLOW_REGISTRATION: value });
      expect(env.ALLOW_REGISTRATION).toBe(expected);
    });

    it('converts the rate limits to numbers and rejects values below 1', () => {
      const env = validateEnv({
        ...base,
        RATE_LIMIT: '250',
        AUTH_RATE_LIMIT: '5',
      });
      expect(env.RATE_LIMIT).toBe(250);
      expect(env.AUTH_RATE_LIMIT).toBe(5);
      expect(() => validateEnv({ ...base, RATE_LIMIT: '0' })).toThrow(
        /RATE_LIMIT/,
      );
      expect(() => validateEnv({ ...base, AUTH_RATE_LIMIT: '-1' })).toThrow(
        /AUTH_RATE_LIMIT/,
      );
    });

    it('still rejects a short secret in development', () => {
      expect(() => validateEnv({ ...base, JWT_SECRET: 'short' })).toThrow(
        /JWT_SECRET/,
      );
    });
  });

  describe('development is not made stricter', () => {
    it('accepts localhost CORS, a 16-character secret and a TLS override', () => {
      expect(() =>
        validateEnv({
          ...base,
          NODE_ENV: 'development',
          CORS_ORIGIN: 'http://localhost:5173',
          NODE_TLS_REJECT_UNAUTHORIZED: '0',
        }),
      ).not.toThrow();
    });
  });

  describe('production', () => {
    it('accepts a safe configuration', () => {
      expect(() => validateEnv({ ...prod })).not.toThrow();
    });

    const fails = (
      over: Record<string, unknown>,
      variable: string,
      secret?: string,
    ) => {
      let message = '';
      try {
        validateEnv({ ...prod, ...over });
      } catch (e) {
        message = (e as Error).message;
      }
      expect(message).toContain(variable);
      if (secret) expect(message).not.toContain(secret);
    };

    it('rejects a JWT_SECRET shorter than 32 characters, without printing it', () => {
      const short = 'b'.repeat(31);
      fails({ JWT_SECRET: short }, 'JWT_SECRET', short);
    });

    it('rejects the example secret even if it is long enough', () => {
      const example = 'change-me-at-least-32-characters-long-xx';
      fails({ JWT_SECRET: example }, 'JWT_SECRET', example);
    });

    it('rejects disabling TLS verification', () => {
      fails(
        { NODE_TLS_REJECT_UNAUTHORIZED: '0' },
        'NODE_TLS_REJECT_UNAUTHORIZED',
      );
    });

    it.each([
      ['missing', undefined],
      ['a wildcard', '*'],
      ['plain http', 'http://app.example.com'],
      ['localhost', 'https://localhost:5173'],
      ['a loopback address', 'https://127.0.0.1'],
    ])('rejects a CORS_ORIGIN that is %s', (_name, value) => {
      const env: Record<string, unknown> = { ...prod };
      if (value === undefined) delete env.CORS_ORIGIN;
      else env.CORS_ORIGIN = value;
      expect(() => validateEnv(env)).toThrow(/CORS_ORIGIN/);
    });

    it('reports every problem at once', () => {
      let message = '';
      try {
        validateEnv({ ...prod, JWT_SECRET: 'c'.repeat(20), CORS_ORIGIN: '*' });
      } catch (e) {
        message = (e as Error).message;
      }
      expect(message).toContain('JWT_SECRET');
      expect(message).toContain('CORS_ORIGIN');
    });
  });
});
