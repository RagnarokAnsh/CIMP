import { randomUUID } from 'crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import request from 'supertest';
import { WebhooksController } from '../src/webhooks/webhooks.controller';
import { WebhooksService } from '../src/webhooks/webhooks.service';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard';
import { RolesGuard } from '../src/authz/roles.guard';
import { WebhookEndpoint } from '../src/entities';
import { Role } from '../src/common/enums';
import { AuthenticatedStaff } from '../src/auth/auth.types';

let currentStaff: AuthenticatedStaff;

// Minimal in-memory repo backing the controller.
const rows = new Map<string, any>();
const repo = {
  create: jest.fn((x: any) => x),
  save: jest.fn(async (x: any) => {
    const saved = { id: x.id ?? randomUUID(), createdAt: new Date(), enabled: true, ...x };
    rows.set(saved.id, saved);
    return saved;
  }),
  find: jest.fn(async () => [...rows.values()]),
  findOne: jest.fn(async ({ where }: any) => rows.get(where.id) ?? null),
  remove: jest.fn(async (x: any) => { rows.delete(x.id); return x; }),
};

describe('Admin webhooks (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [WebhooksController],
      providers: [
        WebhooksService,
        RolesGuard,
        { provide: getRepositoryToken(WebhookEndpoint), useValue: repo },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (ctx: any) => {
          ctx.switchToHttp().getRequest().user = currentStaff;
          return true;
        },
      })
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    // Mirror the production pipe so DTO whitelisting is exercised.
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });

  afterAll(async () => app?.close());
  beforeEach(() => rows.clear());

  const staff = (roles: AuthenticatedStaff['roles']): AuthenticatedStaff => ({
    id: 's1', idpSubject: 'sub', name: 'S', email: 's@x', roles,
  });
  const admin = () => { currentStaff = staff([{ role: Role.ADMIN, platformId: null }]); };

  it('non-admin staff get 403 on every route', async () => {
    currentStaff = staff([{ role: Role.DEVELOPER, platformId: null }]);
    await request(app.getHttpServer()).get('/api/admin/webhooks').expect(403);
    await request(app.getHttpServer())
      .post('/api/admin/webhooks')
      .send({ url: 'https://example.com/hook' })
      .expect(403);
  });

  it('admin CRUD roundtrip; secret appears exactly once', async () => {
    admin();
    const created = await request(app.getHttpServer())
      .post('/api/admin/webhooks')
      .send({ url: 'https://example.com/hook', events: ['issue.created'] })
      .expect(201);
    expect(created.body.secret).toMatch(/^[0-9a-f]{64}$/);

    const list = await request(app.getHttpServer()).get('/api/admin/webhooks').expect(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].secret).toBeUndefined();

    await request(app.getHttpServer())
      .patch(`/api/admin/webhooks/${created.body.id}`)
      .send({ enabled: false })
      .expect(200);

    await request(app.getHttpServer())
      .delete(`/api/admin/webhooks/${created.body.id}`)
      .expect(200);
    expect((await request(app.getHttpServer()).get('/api/admin/webhooks')).body).toHaveLength(0);
  });

  it('rejects unsafe URLs (http, private ranges) with 400', async () => {
    admin();
    await request(app.getHttpServer())
      .post('/api/admin/webhooks')
      .send({ url: 'http://example.com/hook' })
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/admin/webhooks')
      .send({ url: 'https://169.254.169.254/meta' })
      .expect(400);
  });

  it('rejects unknown event names and non-whitelisted fields (400)', async () => {
    admin();
    await request(app.getHttpServer())
      .post('/api/admin/webhooks')
      .send({ url: 'https://example.com/hook', events: ['not.an.event'] })
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/admin/webhooks')
      .send({ url: 'https://example.com/hook', secret: 'attacker-chosen' })
      .expect(400);
  });
});
