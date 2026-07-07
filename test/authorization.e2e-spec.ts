import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import request from 'supertest';
import { IssuesController } from '../src/issues/issues.controller';
import { IssuesService } from '../src/issues/issues.service';
import { AttachmentsController } from '../src/issues/attachments.controller';
import { AttachmentsService } from '../src/issues/attachments.service';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard';
import { PlatformAccessGuard } from '../src/authz/platform-access.guard';
import { ScopeService } from '../src/authz/scope.service';
import { Issue } from '../src/entities';
import { Role } from '../src/common/enums';
import { AuthenticatedStaff } from '../src/auth/auth.types';

const PORTAL_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const PORTAL_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const ISSUE_A = '11111111-1111-1111-1111-111111111111';
const ISSUE_B = '22222222-2222-2222-2222-222222222222';

// Mutable "logged-in" staff, swapped per test by the stub JwtAuthGuard.
let currentStaff: AuthenticatedStaff;

// The platform-access guard resolves an issue's platform from this fake repo.
const issueRepo = {
  findOne: jest.fn(async ({ where }: any) => {
    const id = where.id;
    if (id === ISSUE_A) return { id, platform: { id: PORTAL_A } };
    if (id === ISSUE_B) return { id, platform: { id: PORTAL_B } };
    return null;
  }),
};

describe('PlatformAccessGuard (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [IssuesController, AttachmentsController],
      providers: [
        { provide: IssuesService, useValue: { getDetail: async (id: string) => ({ id }) } },
        { provide: AttachmentsService, useValue: {} },
        ScopeService,
        PlatformAccessGuard,
        { provide: getRepositoryToken(Issue), useValue: issueRepo },
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
    await app.init();
  });

  afterAll(async () => app?.close());

  const staff = (roles: AuthenticatedStaff['roles']): AuthenticatedStaff => ({
    id: 's1', idpSubject: 'sub', name: 'S', email: 's@x', roles,
  });

  it('a Portal A focal point can read a Portal A issue (200)', async () => {
    currentStaff = staff([{ role: Role.FOCAL_POINT, platformId: PORTAL_A }]);
    await request(app.getHttpServer()).get(`/api/staff/issues/${ISSUE_A}`).expect(200);
  });

  it('a Portal A focal point gets 404 (not 403) on a Portal B issue — no existence oracle', async () => {
    // Out-of-scope must be indistinguishable from not-found so a focal point
    // cannot enumerate other platforms' issue ids via a 403-vs-404 difference.
    currentStaff = staff([{ role: Role.FOCAL_POINT, platformId: PORTAL_A }]);
    const res = await request(app.getHttpServer()).get(`/api/staff/issues/${ISSUE_B}`).expect(404);
    expect(res.body.message).toBe('Issue not found');
  });

  it('an admin can read any platform issue (200)', async () => {
    currentStaff = staff([{ role: Role.ADMIN, platformId: null }]);
    await request(app.getHttpServer()).get(`/api/staff/issues/${ISSUE_B}`).expect(200);
  });

  it('a global developer can read any platform issue (200)', async () => {
    currentStaff = staff([{ role: Role.DEVELOPER, platformId: null }]);
    await request(app.getHttpServer()).get(`/api/staff/issues/${ISSUE_A}`).expect(200);
  });

  it('returns 404 for an unknown issue', async () => {
    currentStaff = staff([{ role: Role.ADMIN, platformId: null }]);
    await request(app.getHttpServer())
      .get('/api/staff/issues/33333333-3333-3333-3333-333333333333')
      .expect(404);
  });

  describe('WATCHER (read-only role)', () => {
    it('a Portal A watcher can read a Portal A issue (200)', async () => {
      currentStaff = staff([{ role: Role.WATCHER, platformId: PORTAL_A }]);
      await request(app.getHttpServer()).get(`/api/staff/issues/${ISSUE_A}`).expect(200);
    });

    it('a Portal A watcher gets a truthful 403 on a write to their own platform', async () => {
      // In scope (so the issue "exists" for them) but read-only: mutations 403.
      currentStaff = staff([{ role: Role.WATCHER, platformId: PORTAL_A }]);
      await request(app.getHttpServer())
        .patch(`/api/staff/issues/${ISSUE_A}/status`)
        .send({ status: 'IN_PROGRESS', version: 1 })
        .expect(403);
    });

    it('a Portal A watcher gets 404 on a Portal B issue — same no-oracle rule', async () => {
      currentStaff = staff([{ role: Role.WATCHER, platformId: PORTAL_A }]);
      const res = await request(app.getHttpServer()).get(`/api/staff/issues/${ISSUE_B}`).expect(404);
      expect(res.body.message).toBe('Issue not found');
    });

    it('a watcher gets 403 on the @mention member list (not mentionable, cannot comment)', async () => {
      currentStaff = staff([{ role: Role.WATCHER, platformId: PORTAL_A }]);
      await request(app.getHttpServer()).get(`/api/staff/issues/${ISSUE_A}/members`).expect(403);
    });

    it('a global watcher can read any platform issue (200)', async () => {
      currentStaff = staff([{ role: Role.WATCHER, platformId: null }]);
      await request(app.getHttpServer()).get(`/api/staff/issues/${ISSUE_B}`).expect(200);
    });

    it('a global watcher still cannot write anywhere (403)', async () => {
      currentStaff = staff([{ role: Role.WATCHER, platformId: null }]);
      await request(app.getHttpServer())
        .patch(`/api/staff/issues/${ISSUE_B}/status`)
        .send({ status: 'IN_PROGRESS', version: 1 })
        .expect(403);
    });
  });
});
