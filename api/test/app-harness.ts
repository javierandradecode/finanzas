import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { FEATURE_MODULES } from '../src/app.modules';
import { setupApp } from '../src/app.setup';
import { validateEnv } from '../src/config/env.validation';
import { mongoTestOptions, startMongo } from './mongo-memory';

const TEST_ENV: Record<string, string> = {
  JWT_SECRET: 'test-secret-with-more-than-16-chars',
  JWT_EXPIRES_IN: '1h',
  CORS_ORIGIN: 'http://localhost:5173',
  // Tests make hundreds of requests from one address.
  RATE_LIMIT: '1000000',
  AUTH_RATE_LIMIT: '1000000',
};

export interface Harness {
  app: NestExpressApplication;
  /** A fresh supertest agent on the running app (prefix `/api` is added for you by the helpers). */
  http: () => ReturnType<typeof request>;
  stop: () => Promise<void>;
}

/**
 * Boots the whole API (same modules and `setupApp` as production) on an
 * in-memory MongoDB replica set. `env` overrides the test configuration.
 */
export async function bootApp(
  env: Record<string, string> = {},
): Promise<Harness> {
  const mongo = await startMongo();
  const previous = { ...process.env };
  Object.assign(process.env, TEST_ENV, env, { MONGODB_URI: mongo.uri });

  @Module({
    imports: [
      ConfigModule.forRoot({
        isGlobal: true,
        ignoreEnvFile: true,
        validate: validateEnv,
      }),
      MongooseModule.forRootAsync({
        inject: [ConfigService],
        useFactory: (config: ConfigService) => ({
          uri: config.getOrThrow<string>('MONGODB_URI'),
          ...mongoTestOptions,
        }),
      }),
      ...FEATURE_MODULES,
    ],
  })
  class TestAppModule {}

  const moduleRef = await Test.createTestingModule({
    imports: [TestAppModule],
  }).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>();
  setupApp(app);
  await app.init();

  return {
    app,
    http: () => request(app.getHttpServer()),
    stop: async () => {
      await app.close();
      await mongo.stop();
      process.env = previous;
    },
  };
}

/** Registers a user and returns its token and id. */
export async function signUp(
  http: Harness['http'],
  email: string,
  name = 'Test User',
): Promise<{ token: string; userId: string }> {
  const res = await http()
    .post('/api/auth/register')
    .send({ email, password: 'password123', name })
    .expect(201);
  const body = res.body as { accessToken: string; user: { id: string } };
  return { token: body.accessToken, userId: body.user.id };
}
