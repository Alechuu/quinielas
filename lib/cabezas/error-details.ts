export interface SerializedError {
  message: string;
  name?: string;
  stack?: string;
  cause?: SerializedError | string | number | boolean | null;
}

export function serializeError(error: unknown): SerializedError {
  if (!(error instanceof Error)) {
    return { message: typeof error === "string" ? error : String(error) };
  }

  const serialized: SerializedError = {
    message: error.message,
    name: error.name,
  };

  if (error.stack) {
    serialized.stack = error.stack;
  }

  if (error.cause !== undefined) {
    serialized.cause =
      error.cause instanceof Error
        ? serializeError(error.cause)
        : String(error.cause);
  }

  return serialized;
}

export function formatErrorMessage(error: unknown): string {
  const serialized = serializeError(error);
  if (
    serialized.cause &&
    typeof serialized.cause === "object" &&
    "message" in serialized.cause
  ) {
    return `${serialized.message} (cause: ${serialized.cause.message})`;
  }

  if (typeof serialized.cause === "string" && serialized.cause.length > 0) {
    return `${serialized.message} (cause: ${serialized.cause})`;
  }

  return serialized.message;
}