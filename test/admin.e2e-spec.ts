import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AdminController } from '../src/admin/admin.controller';
import { AdminService } from '../src/admin/admin.service';
import { AuditService } from '../src/audit/audit.service';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard';
import { RolesGuard } from '../src/authz/roles.guard';
import { Role } from '../src/common/enums';
import { AuthenticatedStaff } from '../src/auth/auth.types';

const PLATFORM = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const STAFF = '11111111-1111-1111-1111-111111111111';

// Mutable "logged-in" staff, swapped per test by the stub JwtAuthGuard.
let currentStaff: AuthenticatedStaff;

// The lifecycle routes added alongside staff/platform CRUD are the most
// destructive surface in the app. This pins two things the service specs can't:
// that RolesGuard actually gates them at ADMIN, and that the global
// ValidationPipe rejects malformed bodies before the service is reached.
describe('Admin lifecycle routes (e2e)', () => {
  let app: INestApplication;
  const admin = {
    deletePlatform: jest.fn(async () => ({ ok: true })),
    updateStaff: jest.fn(async () => ({ id: STAFF, name: 'J', email: 'j@x.com', status: 'DISABLED' })),
    deleteStaff: jest.fn(async () => ({ ok: true })),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AdminController],
      providers: [
        { provide: AdminService, useValue: admin },
        { provide: AuditService, useValue: { query: async () => [] } },
        RolesGuard,
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
    // Mirror main.ts — forbidNonWhitelisted is what rejects undeclared fields.
    app.useGlobalPipes(new ValidationPipe({
      whitelist: true, forbidNonWhitelisted: true, transform: true,
    }));
    await app.init();
  });

  afterAll(async () => app?.close());

  beforeEach(() => jest.clearAllMocks());

  const staff = (roles: AuthenticatedStaff['roles']): AuthenticatedStaff => ({
    id: 's1', idpSubject: 'sub', name: 'S', email: 's@x.com', roles,
  });

  const NON_ADMINS: [string, AuthenticatedStaff['roles']][] = [
    ['a global developer', [{ role: Role.DEVELOPER, platformId: null }]],
    ['a focal point', [{ role: Role.FOCAL_POINT, platformId: PLATFORM }]],
    ['a global watcher', [{ role: Role.WATCHER, platformId: null }]],
    ['a role-less account', []],
  ];

  describe('DELETE /api/admin/platforms/:id', () => {
    it('an admin reaches the service (200)', async () => {
      currentStaff = staff([{ role: Role.ADMIN, platformId: null }]);
      await request(app.getHttpServer()).delete(`/api/admin/platforms/${PLATFORM}`).expect(200);
      expect(admin.deletePlatform).toHaveBeenCalled();
    });

    it.each(NON_ADMINS)('%s gets 403', async (_label, roles) => {
      currentStaff = staff(roles);
      await request(app.getHttpServer()).delete(`/api/admin/platforms/${PLATFORM}`).expect(403);
      expect(admin.deletePlatform).not.toHaveBeenCalled();
    });

    it('rejects a non-UUID id before the service (400)', async () => {
      currentStaff = staff([{ role: Role.ADMIN, platformId: null }]);
      await request(app.getHttpServer()).delete('/api/admin/platforms/not-a-uuid').expect(400);
      expect(admin.deletePlatform).not.toHaveBeenCalled();
    });
  });

  describe('DELETE /api/admin/staff/:id', () => {
    it('an admin reaches the service (200)', async () => {
      currentStaff = staff([{ role: Role.ADMIN, platformId: null }]);
      await request(app.getHttpServer()).delete(`/api/admin/staff/${STAFF}`).expect(200);
      expect(admin.deleteStaff).toHaveBeenCalled();
    });

    it.each(NON_ADMINS)('%s gets 403', async (_label, roles) => {
      currentStaff = staff(roles);
      await request(app.getHttpServer()).delete(`/api/admin/staff/${STAFF}`).expect(403);
      expect(admin.deleteStaff).not.toHaveBeenCalled();
    });
  });

  describe('PATCH /api/admin/staff/:id', () => {
    it('an admin can disable an account (200)', async () => {
      currentStaff = staff([{ role: Role.ADMIN, platformId: null }]);
      await request(app.getHttpServer())
        .patch(`/api/admin/staff/${STAFF}`)
        .send({ status: 'DISABLED' })
        .expect(200);
      expect(admin.updateStaff).toHaveBeenCalledWith(
        expect.anything(), STAFF, { status: 'DISABLED' },
      );
    });

    it.each(NON_ADMINS)('%s gets 403', async (_label, roles) => {
      currentStaff = staff(roles);
      await request(app.getHttpServer())
        .patch(`/api/admin/staff/${STAFF}`)
        .send({ status: 'DISABLED' })
        .expect(403);
      expect(admin.updateStaff).not.toHaveBeenCalled();
    });

    it('rejects an unknown AccountStatus (400)', async () => {
      currentStaff = staff([{ role: Role.ADMIN, platformId: null }]);
      await request(app.getHttpServer())
        .patch(`/api/admin/staff/${STAFF}`)
        .send({ status: 'DELETED' })
        .expect(400);
      expect(admin.updateStaff).not.toHaveBeenCalled();
    });

    it('rejects a malformed email (400)', async () => {
      currentStaff = staff([{ role: Role.ADMIN, platformId: null }]);
      await request(app.getHttpServer())
        .patch(`/api/admin/staff/${STAFF}`)
        .send({ email: 'not-an-email' })
        .expect(400);
    });

    // whitelist + forbidNonWhitelisted: privilege fields must not be smuggled
    // in through the identity DTO.
    it('rejects an undeclared field such as tokenVersion (400)', async () => {
      currentStaff = staff([{ role: Role.ADMIN, platformId: null }]);
      await request(app.getHttpServer())
        .patch(`/api/admin/staff/${STAFF}`)
        .send({ name: 'Jane', tokenVersion: 99 })
        .expect(400);
      expect(admin.updateStaff).not.toHaveBeenCalled();
    });
  });
});
