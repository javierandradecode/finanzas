import { Body, Controller, Get, Post } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { IsString } from 'class-validator';
import request from 'supertest';
import { setupApp } from './app.setup';

class EchoDto {
  @IsString()
  name!: string;
}

@Controller()
class PingController {
  @Get('ping')
  ping() {
    return { ok: true };
  }

  @Post('echo')
  echo(@Body() dto: EchoDto) {
    return dto;
  }
}

describe('setupApp', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [() => ({ CORS_ORIGIN: 'https://app.example.com' })],
        }),
      ],
      controllers: [PingController],
    }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    setupApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('serves under the /api prefix', async () => {
    await request(app.getHttpServer())
      .get('/api/ping')
      .expect(200, { ok: true });
    await request(app.getHttpServer()).get('/ping').expect(404);
  });

  it('sends the helmet security headers and hides the framework', async () => {
    const res = await request(app.getHttpServer()).get('/api/ping');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['strict-transport-security']).toBeDefined();
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('allows CORS only for the configured origin', async () => {
    const allowed = await request(app.getHttpServer())
      .get('/api/ping')
      .set('Origin', 'https://app.example.com');
    expect(allowed.headers['access-control-allow-origin']).toBe(
      'https://app.example.com',
    );
    const other = await request(app.getHttpServer())
      .get('/api/ping')
      .set('Origin', 'https://evil.example.org');
    // cors answers with the one configured origin; the browser blocks the rest
    expect(other.headers['access-control-allow-origin']).not.toBe(
      'https://evil.example.org',
    );
  });

  it('exposes Content-Disposition so the browser can read the download name', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/ping')
      .set('Origin', 'https://app.example.com');
    expect(res.headers['access-control-expose-headers']).toMatch(
      /Content-Disposition/i,
    );
  });

  it('drops fields that are not in the DTO', async () => {
    await request(app.getHttpServer())
      .post('/api/echo')
      .send({ name: 'Ana', admin: true })
      .expect(201, { name: 'Ana' });
  });

  it('answers a malformed JSON body with 400, not 500', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/echo')
      .set('Content-Type', 'application/json')
      .send('{"name": ');
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).not.toMatch(
      /at |node_modules|SyntaxError/,
    );
  });

  it('rejects a body over 100 kb with 413 and keeps serving', async () => {
    await request(app.getHttpServer())
      .post('/api/echo')
      .send({ name: 'x'.repeat(200 * 1024) })
      .expect(413);
    await request(app.getHttpServer()).get('/api/ping').expect(200);
  });
});
