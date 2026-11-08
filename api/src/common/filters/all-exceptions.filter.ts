import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { STATUS_CODES } from 'http';

/** The 4xx of an `http-errors` style error (it has `expose: true`), if it is one. */
function clientErrorStatus(exception: unknown): number | undefined {
  if (typeof exception !== 'object' || exception === null) return undefined;
  const { status, statusCode, expose } = exception as {
    status?: unknown;
    statusCode?: unknown;
    expose?: unknown;
  };
  const code = typeof status === 'number' ? status : statusCode;
  return expose === true &&
    typeof code === 'number' &&
    code >= 400 &&
    code < 500
    ? code
    : undefined;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      const payload =
        typeof body === 'string'
          ? { statusCode: status, message: body, error: exception.name }
          : { statusCode: status, ...body };
      res.status(status).json(payload);
      return;
    }

    // Client errors raised by Express middleware (e.g. body-parser: payload too
    // large) are `http-errors` objects, not Nest exceptions. They are the
    // client's fault, so answer with their 4xx instead of a 500.
    const clientStatus = clientErrorStatus(exception);
    if (clientStatus) {
      res.status(clientStatus).json({
        statusCode: clientStatus,
        message: STATUS_CODES[clientStatus] ?? 'Bad Request',
        error: STATUS_CODES[clientStatus] ?? 'Bad Request',
      });
      return;
    }

    this.logger.error(
      exception instanceof Error ? exception.stack : String(exception),
    );
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
      error: 'Internal Server Error',
    });
  }
}
