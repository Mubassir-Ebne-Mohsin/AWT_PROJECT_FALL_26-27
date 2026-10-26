/** Only connection/availability errors are retriable; SQL/schema defects remain INTERNAL. */
export function databaseUnavailable(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const value = error as Error & {
    code?: string;
    driverError?: { code?: string; message?: string };
  };
  const code = value.driverError?.code ?? value.code;
  const message = value.driverError?.message ?? value.message;
  if (
    [
      "Connection terminated unexpectedly",
      "Connection terminated",
      "Connection terminated due to connection timeout",
      "timeout exceeded when trying to connect",
      "Query read timeout",
    ].includes(message)
  )
    return true;
  return (
    !!code &&
    [
      "ECONNREFUSED",
      "ECONNRESET",
      "ETIMEDOUT",
      "08001",
      "08003",
      "08006",
      "57P01",
      "53300",
      "57014", // configured PostgreSQL statement/lock deadline cancellation
    ].includes(code)
  );
}
