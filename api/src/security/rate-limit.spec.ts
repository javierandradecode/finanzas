import { Controller, Get } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { setupApp } from '../app.setup';
import { AuthController } from '../auth/auth.controller';
import { AuthService } from '../auth/auth.service';
import { UsersService } from '../users/users.service';
import { SecurityModule } from './security.module';

@Controller()
class PingController {
  @Get('ping')
  ping() {
    return { ok: true };
  }
}

const login = { email: 'ana@example.com', password: 'password123' };
const register = { ...login, name: 'Ana' };

async function boot(env: Record<string, unknown>) {
  const auth = {
    login: jest.fn().mockResolvedValue({ accessToken: 't' }),
    register: jest.fn().mockResolvedValue({ accessToken: 't' }),
  };
  const moduleRef = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({
        isGlobal: true,
        ignoreEnvFile: true,
        load: [() => ({ CORS_ORIGIN: 'http://localhost:5173', ...env })],
      }),
      SecurityModule,
    ],
    controllers: [AuthController, PingController],
    providers: [
      { provide: AuthService, useValue: auth },
      { provide: UsersService, useValue: {} },
    ],
  }).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>();
  setupApp(app);
  await app.init();
  return app;
}

const from = (ip: string) => ({ 'X-Forwarded-For': ip });

describe('rate limiting', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await boot({ AUTH_RATE_LIMIT: 3, RATE_LIMIT: 1000 });
  });
  afterAll(async () => {
    await app.close();
  });

  it('answers 429 with Retry-After after AUTH_RATE_LIMIT logins from one IP', async () => {
    const http = request(app.getHttpServer());
    for (let i = 0; i < 3; i++) {
      await http
        .post('/api/auth/login')
        .set(from('10.0.0.1'))
        .send(login)
        .expect(200);
    }
    const blocked = await http
      .post('/api/auth/login')
      .set(from('10.0.0.1'))
      .send(login);
    expect(blocked.status).toBe(429);
    // with several named limits the header carries the limit name (retry-after-auth)
    expect(
      Object.keys(blocked.headers).some((h) => h.startsWith('retry-after')),
    ).toBe(true);
  });

  it('another IP is not blocked by the first one', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .set(from('10.0.0.2'))
      .send(login)
      .expect(200);
  });

  it('limits registration too', async () => {
    const http = request(app.getHttpServer());
    for (let i = 0; i < 3; i++) {
      await http
        .post('/api/auth/register')
        .set(from('10.0.0.3'))
        .send(register)
        .expect(201);
    }
    await http
      .post('/api/auth/register')
      .set(from('10.0.0.3'))
      .send(register)
      .expect(429);
  });

  it('ordinary endpoints are not held back by the strict login limit', async () => {
    const http = request(app.getHttpServer());
    for (let i = 0; i < 10; i++) {
      await http.get('/api/ping').set(from('10.0.0.1')).expect(200);
    }
  });
});

describe('the general limit', () => {
  it('applies to every endpoint (RATE_LIMIT)', async () => {
    const app = await boot({ AUTH_RATE_LIMIT: 100, RATE_LIMIT: 5 });
    const http = request(app.getHttpServer());
    for (let i = 0; i < 5; i++) {
      await http.get('/api/ping').set(from('10.0.1.1')).expect(200);
    }
    await http.get('/api/ping').set(from('10.0.1.1')).expect(429);
    await app.close();
  });
});
