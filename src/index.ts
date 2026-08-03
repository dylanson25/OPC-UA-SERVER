import { OPCUAServerManager } from './core/index.ts';
import { createModuleLogger } from './infrastructure/logger/index.ts';
import { AppError, ErrorCode, ExitCode, logAppError } from './errors/index.ts';
const logger = createModuleLogger('session');

const serverManager = new OPCUAServerManager();

serverManager.initialize();

function handleFatalError(err: unknown, source: 'uncaughtException' | 'unhandledRejection'): void {
  const exitCode = err instanceof AppError ? err.exitCode : ExitCode.UNKNOWN_ERROR;

  if (err instanceof AppError) {
    logAppError(logger, err, { source });
  } else {
    logger.fatal({ err, source, code: ErrorCode.UNKNOWN_ERROR }, 'Unhandled error');
  }

  serverManager.shutdown(() => {
    process.exit(exitCode);
  });
}

const setupGracefulShutdown = (): void => {
  const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];

  signals.forEach((signal) => {
    process.on(signal, () => {
      logger.info({ signal }, 'Received termination signal');

      serverManager.shutdown(() => {
        process.exit(ExitCode.SUCCESS);
      });
    });
  });

  process.on('uncaughtException', (err) => {
    handleFatalError(err, 'uncaughtException');
  });

  process.on('unhandledRejection', (reason) => {
    handleFatalError(reason, 'unhandledRejection');
  });
}

setupGracefulShutdown();