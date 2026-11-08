import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection, ConnectionStates } from 'mongoose';

export interface HealthStatus {
  status: 'ok' | 'degraded';
  db: 'up' | 'down';
  uptime: number;
}

@Injectable()
export class HealthService {
  constructor(@InjectConnection() private readonly connection: Connection) {}

  check(): HealthStatus {
    const dbUp = this.connection.readyState === ConnectionStates.connected;
    return {
      status: dbUp ? 'ok' : 'degraded',
      db: dbUp ? 'up' : 'down',
      uptime: process.uptime(),
    };
  }
}
