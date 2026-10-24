/** Only connection/availability errors are retriable; SQL/schema defects remain INTERNAL. */
export function databaseUnavailable(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const value = error as Error & {
    code?: string;
    driverError?: { code?: string };
  };
  const code = value.driverError?.code ?? value.code;
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
    ].includes(code)
  );
}
