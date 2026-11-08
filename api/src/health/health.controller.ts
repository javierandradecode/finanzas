import { Controller, Get } from '@nestjs/common';
import type { HealthStatus } from './health.service';
import { HealthService } from './health.service';

@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get()
  check(): HealthStatus {
    return this.health.check();
  }
}
