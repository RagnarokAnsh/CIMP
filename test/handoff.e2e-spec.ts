import { INestApplication, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { ReporterController } from '../src/reporter/reporter.controller';
import { ReporterService } from '../src/reporter/reporter.service';
import { HandoffGuard } from '../src/handoff/handoff.guard';
import { HandoffService } from '../src/handoff/handoff.service';

// Exercises the hand-off guard end-to-end over HTTP with a stubbed
// HandoffService: a valid token reaches the controller, a missing/invalid one
// is rejected with 401 before the controller runs.
describe('HandoffGuard (e2e)', () => {
  let app: INestApplication;

  const handoff = {
    verify: jest.fn(async (token: string) => {
      if (token !== 'good-token') throw new UnauthorizedException('Invalid');
      return {
        platformId: 'p1',
        platformKey: 'portal-a',
        reporter: { portalUserId: 'u1', name: 'R', email: 'r@x' },
      };
    }),
  };

  const reporter = {
    listForReporter: jest.fn(async () => [{ id: 'i1', referenceNo: 'SUP-1' }]),
    createIssue: jest.fn(),
    getIssueForReporter: jest.fn(),
    markSeen: jest.fn(),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ReporterController],
      providers: [
        { provide: ReporterService, useValue: reporter },
        HandoffGuard,
        { provide: HandoffService, useValue: handoff },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(async () => app?.close());

  it('rejects a request with no hand-off token (401)', async () => {
    await request(app.getHttpServer()).get('/api/reporter/issues').expect(401);
  });

  it('rejects a request with an invalid token (401)', async () => {
    await request(app.getHttpServer())
      .get('/api/reporter/issues')
      .set('X-Handoff-Token', 'nope')
      .expect(401);
  });

  it('allows a request with a valid token (200)', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/reporter/issues')
      .set('X-Handoff-Token', 'good-token')
      .expect(200);
    expect(res.body).toHaveLength(1);
    expect(handoff.verify).toHaveBeenCalledWith('good-token');
  });
});
