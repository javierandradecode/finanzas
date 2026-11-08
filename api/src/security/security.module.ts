import { ExecutionContext, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { STRICT_RATE_LIMIT_KEY } from './strict-rate-limit.decorator';

const WINDOW_MS = 60_000;

/**
 * Rate limiting per client IP. Two limits run side by side: `default` for the
 * whole API (RATE_LIMIT per minute) and `auth` only for routes marked with
 * `@StrictRateLimit()` (AUTH_RATE_LIMIT per minute), which slows down password
 * guessing and mass sign-ups.
 */
@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      inject: [ConfigService, Reflector],
      useFactory: (config: ConfigService, reflector: Reflector) => ({
        throttlers: [
          {
            name: 'default',
            ttl: WINDOW_MS,
            limit: config.get<number>('RATE_LIMIT') ?? 100,
          },
          {
            name: 'auth',
            ttl: WINDOW_MS,
            limit: config.get<number>('AUTH_RATE_LIMIT') ?? 10,
            skipIf: (context: ExecutionContext) =>
              !reflector.getAllAndOverride<boolean>(STRICT_RATE_LIMIT_KEY, [
                context.getHandler(),
                context.getClass(),
              ]),
          },
        ],
      }),
    }),
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class SecurityModule {}
