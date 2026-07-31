import { OPCUAServerManager } from './core/index.js';
import { createModuleLogger } from './infrastructure/logger/index.js';
const logger = createModuleLogger('session');

const serverManager = new OPCUAServerManager();

serverManager.initialize();

const setupGracefulShutdown = (): void => {
  const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];

  signals.forEach((signal) => {
    process.on(signal, () => {
      logger.info({ signal }, 'Received termination signal');

      serverManager.shutdown(() => {
        process.exit(0);
      });
    });
  });

  process.on('uncaughtException', (err) => {
    logger.fatal({ err }, 'Uncaught exception');
    serverManager.shutdown(() => {
      process.exit(1);
    });
  });

  process.on('unhandledRejection', (reason) => {
    logger.fatal({ err: reason }, 'Unhandled promise rejection');
    serverManager.shutdown(() => {
      process.exit(1);
    });
  });
}

setupGracefulShutdown();