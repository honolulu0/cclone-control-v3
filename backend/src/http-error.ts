export class AppError extends Error {
  readonly statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

export function createHttpError(statusCode: number, message: string): AppError {
  return new AppError(statusCode, message);
}
