export function isDomainNotFoundError(error: unknown): error is Error {
  return error instanceof Error && error.message.startsWith("NOT_FOUND:");
}
