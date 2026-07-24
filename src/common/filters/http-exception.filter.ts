import {
  ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { OptimisticLockVersionMismatchError, QueryFailedError } from 'typeorm';

// Produces a consistent error body for every failure:
// { statusCode, message, error, timestamp, path }.
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Internal server error';
    let error = 'Internal Server Error';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
        error = exception.name;
      } else if (typeof body === 'object' && body !== null) {
        const b = body as Record<string, unknown>;
        message = (b.message as string | string[]) ?? exception.message;
        error = (b.error as string) ?? exception.name;
      }
    } else if (exception instanceof OptimisticLockVersionMismatchError) {
      // A concurrent write lost the optimistic-lock race. Surface it as the
      // documented 409 (matching assertVersion) so the client can reload+retry,
      // instead of leaking it as a generic 500.
      status = HttpStatus.CONFLICT;
      message = 'This issue was changed by someone else. Reload and try again.';
      error = 'Conflict';
    } else if (
      exception instanceof QueryFailedError &&
      (exception.driverError as { code?: string } | undefined)?.code === '22P02'
    ) {
      // Postgres 22P02 (invalid_text_representation) means a request value reached a
      // query in a shape the column type can't parse — typically a malformed uuid read
      // by a guard, which runs before ParseUUIDPipe. The caller sent bad input, so this
      // is a 400, not a server fault. Deliberately narrow to 22P02: every other
      // QueryFailedError is our bug and must stay a logged 500 below.
      status = HttpStatus.BAD_REQUEST;
      message = 'Malformed request parameter.';
      error = 'Bad Request';
    } else if (exception instanceof Error) {
      // Don't leak internals to the client, but log them for ops.
      this.logger.error(exception.message, exception.stack);
    } else {
      // Non-Error throw (string / POJO / third-party value). Log it so no 500 is
      // ever silent, while the client body stays generic.
      this.logger.error(`Non-error exception: ${safeStringify(exception)}`);
    }

    // Log security-relevant denials so an on-call/SIEM can see authz probing
    // (bad tokens, cross-scope attempts). Response body is unchanged.
    if (status === HttpStatus.UNAUTHORIZED || status === HttpStatus.FORBIDDEN) {
      this.logger.warn(`${status} ${req.method} ${req.originalUrl ?? req.url}`);
    }

    res.status(status).json({
      statusCode: status,
      message,
      error,
      timestamp: new Date().toISOString(),
      path: req.url,
    });
  }
}

function safeStringify(value: unknown): string {
  try {
    return typeof value === 'string' ? value : JSON.stringify(value);
  } catch {
    return String(value);
  }
}
