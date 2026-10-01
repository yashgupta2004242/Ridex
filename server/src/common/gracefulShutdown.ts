import { logger } from '../config/logger';

export type ShutdownDeps = {
  closeHttp: (callback: (error?: Error) => void) => void;
  disconnectRedis: () => Promise<void>;
  disconnectMongo: () => Promise<void>;
  exit: (code: number) => void;
};

export function createGracefulShutdown(deps: ShutdownDeps) {
  let shuttingDown = false;

  return async function shutdown(signal: string): Promise<void> {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    logger.info('Shutting down', { signal });

    await new Promise<void>((resolve) => {
      deps.closeHttp((error) => {
        if (error) {
          logger.error('HTTP server close failed', { error: error.message });
        }
        resolve();
      });
    });

    await deps.disconnectRedis();
    await deps.disconnectMongo();
    deps.exit(0);
  };
}
