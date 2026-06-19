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

  it('a Portal A focal point is forbidden on a Portal B issue (403)', async () => {
    currentStaff = staff([{ role: Role.FOCAL_POINT, platformId: PORTAL_A }]);
    await request(app.getHttpServer()).get(`/api/staff/issues/${ISSUE_B}`).expect(403);
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
});
