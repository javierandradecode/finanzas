import { ConfigModule } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { setupApp } from '../app.setup';
import { UsersService } from '../users/users.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

const body = { email: 'ana@example.com', password: 'password123', name: 'Ana' };

async function bootApp(allowRegistration: boolean) {
  const auth = {
    register: jest
      .fn()
      .mockResolvedValue({ accessToken: 't', user: { id: '1' } }),
    login: jest.fn().mockResolvedValue({ accessToken: 't', user: { id: '1' } }),
  };
  const moduleRef = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({
        isGlobal: true,
        ignoreEnvFile: true,
        load: [
          () => ({
            CORS_ORIGIN: 'http://localhost:5173',
            ALLOW_REGISTRATION: allowRegistration,
          }),
        ],
      }),
    ],
    controllers: [AuthController],
    providers: [
      { provide: AuthService, useValue: auth },
      { provide: UsersService, useValue: {} },
    ],
  }).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>();
  setupApp(app);
  await app.init();
  return { app, auth };
}

describe('closing registration (ALLOW_REGISTRATION=false)', () => {
  it('answers 403 and never calls the service', async () => {
    const { app, auth } = await bootApp(false);
    const res = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send(body);
    expect(res.status).toBe(403);
    expect(res.body.message).toBe('Registration is closed');
    expect(auth.register).not.toHaveBeenCalled();
    await app.close();
  });

  it('does not affect login for existing users', async () => {
    const { app, auth } = await bootApp(false);
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: body.email, password: body.password })
      .expect(200);
    expect(auth.login).toHaveBeenCalledTimes(1);
    await app.close();
  });

  it('registers normally when it is open', async () => {
    const { app, auth } = await bootApp(true);
    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send(body)
      .expect(201);
    expect(auth.register).toHaveBeenCalledTimes(1);
    await app.close();
  });
});
