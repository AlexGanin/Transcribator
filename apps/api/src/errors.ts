export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export function createHttpError(statusCode: number, message: string): HttpError {
  return new HttpError(statusCode, message);
}

export function isHttpError(error: unknown): error is HttpError {
  return error instanceof HttpError;
}
