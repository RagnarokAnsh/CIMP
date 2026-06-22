import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { DataSource } from 'typeorm';

// Liveness/readiness probes for orchestrators (k8s, ECS, etc.). Unauthenticated
// by design — they expose no data, only up/down. Exempt from rate limiting so
// frequent probes are never throttled.
@SkipThrottle()
@ApiTags('health')
@Controller()
export class HealthController {
  constructor(private readonly dataSource: DataSource) {}

  // Liveness: the process is up and serving.
  @Get('health')
  @ApiOperation({ summary: 'Liveness probe.' })
  health() {
    return { status: 'ok', uptime: process.uptime() };
  }

  // Readiness: dependencies (the database) are reachable. Returns 503 if not so
  // load balancers stop routing to this instance.
  @Get('ready')
  @ApiOperation({ summary: 'Readiness probe (checks the database).' })
  async ready() {
    const checks: Record<string, 'ok' | 'down'> = { database: 'down' };
    try {
      await this.dataSource.query('SELECT 1');
      checks.database = 'ok';
    } catch {
      // leave as 'down'
    }
    const ok = Object.values(checks).every((v) => v === 'ok');
    if (!ok) throw new ServiceUnavailableException({ status: 'degraded', checks });
    return { status: 'ok', checks };
  }
}
