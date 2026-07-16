import { INestApplication, ServiceUnavailableException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { HealthController } from '../src/health/health.controller';
import { HealthService } from '../src/health/health.service';

describe('Health endpoints (e2e)', () => {
  let app: INestApplication<App>;
  const healthService = {
    getLiveness: jest.fn(),
    getReadiness: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    healthService.getLiveness.mockReturnValue({ status: 'ok' });
    healthService.getReadiness.mockResolvedValue({
      status: 'ready',
      checks: { postgres: 'ok', redis: 'ok', base: 'ok' },
      chainId: 8453,
    });
    const moduleFixture = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: HealthService, useValue: healthService }],
    }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('serves liveness without dependency status', async () => {
    await request(app.getHttpServer())
      .get('/health/live')
      .expect(200)
      .expect({ status: 'ok' });
  });

  it('serves readiness when dependencies are healthy', async () => {
    await request(app.getHttpServer())
      .get('/health/ready')
      .expect(200)
      .expect({
        status: 'ready',
        checks: { postgres: 'ok', redis: 'ok', base: 'ok' },
        chainId: 8453,
      });
  });

  it('returns 503 when readiness fails', async () => {
    healthService.getReadiness.mockRejectedValue(
      new ServiceUnavailableException({
        status: 'not_ready',
        checks: { postgres: 'error', redis: 'ok', base: 'ok' },
      }),
    );

    await request(app.getHttpServer())
      .get('/health/ready')
      .expect(503)
      .expect({
        status: 'not_ready',
        checks: { postgres: 'error', redis: 'ok', base: 'ok' },
      });
  });
});
