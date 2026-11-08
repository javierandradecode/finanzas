import { bootApp, Harness, signUp } from '../../test/app-harness';

jest.setTimeout(180_000);

describe('end-to-end harness', () => {
  let h: Harness;
  beforeAll(async () => {
    h = await bootApp();
  });
  afterAll(async () => {
    await h.stop();
  });

  it('boots the real module graph and answers health', async () => {
    await h.http().get('/api/health').expect(200);
  });

  it('registers a user and reads it back with the token', async () => {
    const { token } = await signUp(h.http, 'harness@example.com');
    const me = await h
      .http()
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(me.body).toMatchObject({ email: 'harness@example.com' });
  });

  it('rejects requests without a token', async () => {
    await h.http().get('/api/accounts').expect(401);
  });
});
