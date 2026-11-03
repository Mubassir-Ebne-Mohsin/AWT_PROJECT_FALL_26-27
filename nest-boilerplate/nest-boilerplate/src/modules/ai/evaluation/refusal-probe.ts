/**
 * Notes, for evaluation runs only, why the provider refused a request: its HTTP status and, if the error body gives one, a short plain
 * identifier. The hosted adapter deliberately reports nothing about such refusals and never repeats the provider's message, so this
 * wraps the network function the adapter is given instead of changing the adapter. Only a plain token is kept (never the message,
 * which can hold account or request detail), and at most 4 KB of the body is read from a copy, so the adapter sees the reply untouched.
 */
export interface RefusalNote {
  httpStatus: number;
  errorCode?: string;
}

const MAX_BODY_BYTES = 4096;
export const ERROR_IDENTIFIER = /^[A-Za-z0-9_.-]{1,64}$/;

async function identifierOf(copy: Response): Promise<string | undefined> {
  const reader = copy.body?.getReader();
  if (!reader) return undefined;
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (length < MAX_BODY_BYTES) {
      const chunk = await reader.read();
      if (chunk.done) break;
      chunks.push(chunk.value);
      length += chunk.value.byteLength;
    }
    const error = (JSON.parse(Buffer.concat(chunks).subarray(0, MAX_BODY_BYTES).toString("utf8")) as { error?: { code?: unknown; type?: unknown } }).error;
    return [error?.code, error?.type].find((v): v is string => typeof v === "string" && ERROR_IDENTIFIER.test(v));
  } catch {
    return undefined;
  } finally {
    // Not awaited: cancelling one side of a copied stream waits for the other side, which is handed back only after this returns.
    void reader.cancel().catch(() => undefined);
  }
}

/** A drop-in `fetch` for the adapter, and `take()` to read (and clear) the note for the request just made, or undefined if it succeeded. */
export function probingFetch(inner: typeof fetch = globalThis.fetch.bind(globalThis)) {
  let last: RefusalNote | undefined;
  const wrapped = (async (url: Parameters<typeof fetch>[0], init?: RequestInit) => {
    last = undefined;
    const response = await inner(url, init);
    if (!response.ok) {
      const errorCode = await identifierOf(response.clone());
      last = { httpStatus: response.status, ...(errorCode ? { errorCode } : {}) };
    }
    return response;
  }) as typeof fetch;
  return {
    fetch: wrapped,
    take: (): RefusalNote | undefined => {
      const note = last;
      last = undefined;
      return note;
    },
  };
}
