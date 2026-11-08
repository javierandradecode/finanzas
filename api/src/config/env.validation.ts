import { plainToInstance, Transform } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';

export class EnvironmentVariables {
  @IsString()
  @IsNotEmpty()
  MONGODB_URI!: string;

  @IsString()
  @MinLength(16)
  JWT_SECRET!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  PORT: number = 3000;

  @IsOptional()
  @IsString()
  CORS_ORIGIN: string = 'http://localhost:5173';

  @IsOptional()
  @IsString()
  JWT_EXPIRES_IN: string = '7d';

  @IsOptional()
  @IsString()
  NODE_ENV?: string;

  /**
   * Only the word "false" closes registration. Read from the raw value because
   * implicit conversion would turn the string "false" into `true`.
   */
  @IsBoolean()
  @Transform(({ obj }: { obj: Record<string, unknown> }) => {
    const raw = obj.ALLOW_REGISTRATION;
    return !(raw === false || raw === 'false');
  })
  ALLOW_REGISTRATION: boolean = true;

  /** Requests per minute per IP, for the whole API. */
  @IsOptional()
  @IsInt()
  @Min(1)
  RATE_LIMIT: number = 100;

  /** Requests per minute per IP for login and registration. */
  @IsOptional()
  @IsInt()
  @Min(1)
  AUTH_RATE_LIMIT: number = 10;
}

const EXAMPLE_SECRET_PREFIX = 'change-me';
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '0.0.0.0']);

/**
 * Refuses to start in production with a configuration that would be unsafe on
 * the internet. Messages name the variable and never include its value.
 */
export function assertProductionSafe(config: Record<string, unknown>): void {
  const problems: string[] = [];

  const secret = config.JWT_SECRET;
  if (typeof secret === 'string') {
    if (secret.length < 32) {
      problems.push('JWT_SECRET: must be at least 32 characters in production');
    }
    if (secret.startsWith(EXAMPLE_SECRET_PREFIX)) {
      problems.push(
        'JWT_SECRET: must not be the example value from .env.example',
      );
    }
  }

  if (String(config.NODE_TLS_REJECT_UNAUTHORIZED) === '0') {
    problems.push(
      'NODE_TLS_REJECT_UNAUTHORIZED: TLS verification must not be disabled in production',
    );
  }

  const origin = config.CORS_ORIGIN;
  if (typeof origin !== 'string' || origin === '') {
    problems.push('CORS_ORIGIN: must be set to the https URL of the web app');
  } else if (!origin.startsWith('https://')) {
    problems.push(
      'CORS_ORIGIN: must be an https:// URL (no wildcard, no http)',
    );
  } else {
    let host = '';
    try {
      host = new URL(origin).hostname;
    } catch {
      problems.push('CORS_ORIGIN: is not a valid URL');
    }
    if (LOCAL_HOSTS.has(host)) {
      problems.push('CORS_ORIGIN: must not point to localhost in production');
    }
  }

  if (problems.length > 0) {
    throw new Error(`Unsafe production configuration:\n${problems.join('\n')}`);
  }
}

export function validateEnv(
  config: Record<string, unknown>,
): EnvironmentVariables {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validated, { skipMissingProperties: false });
  if (errors.length > 0) {
    const details = errors
      .map(
        (e) =>
          `${e.property}: ${Object.values(e.constraints ?? {}).join(', ')}`,
      )
      .join('\n');
    throw new Error(`Invalid environment variables:\n${details}`);
  }
  if (config.NODE_ENV === 'production') {
    assertProductionSafe(config);
  }
  return validated;
}
