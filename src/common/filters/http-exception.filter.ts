import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();

    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;

    let code = 'INTERNAL_SERVER_ERROR';

    let message = 'Internal server error';

    let details: unknown = undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();

      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (
        typeof exceptionResponse === 'object' &&
        exceptionResponse !== null
      ) {
        const body = exceptionResponse as Record<string, any>;

        code = body.code ?? this.getDefaultCode(status);

        message = Array.isArray(body.message)
          ? 'Validation failed'
          : (body.message ?? exception.message);

        if (Array.isArray(body.message)) {
          details = body.message;
        }

        if (body.details) {
          details = body.details;
        }
      }
    }

    const logMessage = `${request.method} ${request.originalUrl} ${status} - ${message}`;

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        logMessage,
        exception instanceof Error ? exception.stack : undefined,
      );
    } else {
      this.logger.warn(logMessage);
    }

    response.status(status).json({
      success: false,

      error: {
        code,
        message,
        ...(details ? { details } : {}),
      },

      timestamp: new Date().toISOString(),

      path: request.url,
    });
  }

  private getDefaultCode(status: number) {
    switch (status) {
      case 400:
        return 'BAD_REQUEST';

      case 401:
        return 'UNAUTHORIZED';

      case 403:
        return 'FORBIDDEN';

      case 404:
        return 'NOT_FOUND';

      case 409:
        return 'CONFLICT';

      default:
        return 'HTTP_ERROR';
    }
  }
}
