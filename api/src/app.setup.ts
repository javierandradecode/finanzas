import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

/**
 * Everything that configures the HTTP app. `main.ts` and the tests both call
 * it, so what is tested is what runs in production.
 */
export function setupApp(app: NestExpressApplication): void {
  const config = app.get(ConfigService);

  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableCors({
    origin: config.getOrThrow<string>('CORS_ORIGIN'),
    // Without this the browser hides the file name of CSV downloads.
    exposedHeaders: ['Content-Disposition'],
  });

  // Security headers (nosniff, HSTS, no X-Powered-By...).
  app.use(helmet());
  // Behind one reverse proxy (the hosting platform): use the client's real IP.
  app.set('trust proxy', 1);
  // The API only receives small JSON bodies.
  app.useBodyParser('json', { limit: '100kb' });
}
