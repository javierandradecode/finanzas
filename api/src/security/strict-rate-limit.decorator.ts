import { SetMetadata } from '@nestjs/common';

export const STRICT_RATE_LIMIT_KEY = 'strictRateLimit';

/**
 * Marks a route (login, register) for the stricter `AUTH_RATE_LIMIT` on top of
 * the general limit that every route already has.
 */
export const StrictRateLimit = () => SetMetadata(STRICT_RATE_LIMIT_KEY, true);
