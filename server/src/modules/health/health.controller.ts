import type { Request, Response } from 'express';
import { success } from '../../common/ApiResponse';
import { HTTP } from '../../common/constants';
import type { HealthService } from './health.service';

export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  getHealth = (req: Request, res: Response): void => {
    res.status(HTTP.OK).json(success(this.healthService.getHealth(), req.requestId));
  };

  getReady = async (req: Request, res: Response): Promise<void> => {
    const payload = await this.healthService.getReady();
    res.status(HTTP.OK).json(success(payload, req.requestId));
  };
}
