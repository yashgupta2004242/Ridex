import { ERROR_CODES } from '../../common/constants';
import { AppError } from '../../common/AppError';

export type ReadinessChecks = {
  checkMongo: () => Promise<boolean>;
  checkRedis: () => Promise<boolean>;
};

export type HealthPayload = {
  status: 'ok';
  uptimeSeconds: number;
};

export type ReadyPayload = {
  status: 'ready';
  mongo: boolean;
  redis: boolean;
};

export class HealthService {
  constructor(private readonly checks: ReadinessChecks) {}

  getHealth(): HealthPayload {
    return {
      status: 'ok',
      uptimeSeconds: Math.floor(process.uptime()),
    };
  }

  async getReady(): Promise<ReadyPayload> {
    const [mongo, redis] = await Promise.all([this.checks.checkMongo(), this.checks.checkRedis()]);
    if (!mongo || !redis) {
      throw new AppError(503, ERROR_CODES.NOT_READY, 'Service is not ready', true);
    }
    return { status: 'ready', mongo, redis };
  }
}
