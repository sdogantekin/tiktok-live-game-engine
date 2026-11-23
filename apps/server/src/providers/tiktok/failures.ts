export type FailureKind = 'offline' | 'invalid_username' | 'rate_limited' | 'signing' | 'timeout' | 'blocked' | 'network' | 'unknown';

export interface ConnectFailure {
  kind: FailureKind;
  /** When TikTok or the signing service said how long to wait (ms). */
  retryAfterMs?: number;
  /** A short technical note for the server log. Never contains a credential. */
  detail: string;
}

/** An error already classified by the library adapter (which can use `instanceof` on the library's own error classes). */
export class ConnectFailureError extends Error {
  constructor(readonly failure: ConnectFailure) {
    super(failure.detail);
    this.name = 'ConnectFailureError';
  }
}

/** Removes anything that looks like a key, token or session from text that may reach a log or the operator's screen. */
export function redactSecrets(text: string): string {
  return text
    .replace(/([?&](?:api[_-]?key|key|token|session(?:id)?|access[_-]?token|sign[_-]?api[_-]?key)=)[^&\s"']+/gi, '$1[redacted]')
    .replace(/((?:x-api-key|authorization|api[_-]?key|cookie|set-cookie|sessionid|token)["']?\s*[:=]\s*["']?)(?:bearer\s+)?[^\s,;"'}&]+/gi, '$1[redacted]');
}

/**
 * Names what went wrong when connecting, from the error alone, so the operator gets a plain reason and the retry policy
 * can differ by reason. Library errors are matched by class name and message; anything unrecognised is `unknown`.
 */
export function classifyFailure(error: unknown): ConnectFailure {
  if (error instanceof ConnectFailureError) return error.failure;
  const name = error instanceof Error ? (error.constructor?.name ?? error.name) : '';
  const message = error instanceof Error ? error.message : String(error);
  const detail = redactSecrets(`${name || 'Error'}: ${message}`).slice(0, 200);
  const retryAfter = typeof (error as { retryAfter?: unknown } | null)?.retryAfter === 'number' ? (error as { retryAfter: number }).retryAfter : undefined;

  if (/UserOffline/i.test(name) || /not (currently )?live|user.*offline|offline/i.test(message)) return { kind: 'offline', detail };
  if (/InvalidUniqueId/i.test(name) || /invalid.*(unique ?id|username)|user.*not found/i.test(message)) return { kind: 'invalid_username', detail };
  if (/RateLimit/i.test(name) || /rate.?limit|too many requests|429/i.test(message)) return { kind: 'rate_limited', retryAfterMs: retryAfter, detail };
  if (/SignAPI|Signature/i.test(name) || /sign(ature|ing)? (server|service|api|error)|euler/i.test(message)) return { kind: 'signing', detail };
  if (/Timeout/i.test(name) || /timed? ?out|ETIMEDOUT/i.test(message)) return { kind: 'timeout', detail };
  if (/captcha|403|forbidden|blocked|denied/i.test(message)) return { kind: 'blocked', detail };
  if (/ENOTFOUND|ECONNRESET|ECONNREFUSED|EAI_AGAIN|ENETUNREACH|network|socket hang up/i.test(message)) return { kind: 'network', detail };
  return { kind: 'unknown', detail };
}

/** What the operator reads for each failure. */
export const FAILURE_MESSAGE: Readonly<Record<FailureKind, string>> = {
  offline: 'The creator is not live right now. Waiting for the stream to start.',
  invalid_username: 'TikTok does not know that username. Type the name from the profile address (after the @), not the display name.',
  rate_limited: 'The signing service asked us to slow down. Retrying shortly.',
  signing: 'The signing service TikTok access depends on is unavailable. Retrying shortly; this is not your fault.',
  timeout: 'TikTok did not answer in time. Retrying.',
  blocked: 'TikTok asked for a captcha or blocked this network. Waiting before trying again.',
  network: 'No internet connection, or TikTok cannot be reached. Retrying.',
  unknown: 'Could not connect to TikTok for an unknown reason. Retrying; details are in the server log.',
};

/** How long to wait before the next attempt, by reason; null means do not retry (a person has to fix something). */
const RETRY: Readonly<Record<FailureKind, { baseMs: number; maxMs: number } | null>> = {
  offline: { baseMs: 30_000, maxMs: 30_000 },
  rate_limited: { baseMs: 60_000, maxMs: 300_000 },
  signing: { baseMs: 30_000, maxMs: 300_000 },
  timeout: { baseMs: 10_000, maxMs: 60_000 },
  network: { baseMs: 10_000, maxMs: 60_000 },
  blocked: { baseMs: 120_000, maxMs: 600_000 },
  unknown: { baseMs: 30_000, maxMs: 300_000 },
  invalid_username: null,
};

/** The delay before attempt number `consecutive + 1` after `consecutive` failures of this kind in a row, or null for no retry. */
export function retryDelayMs(failure: ConnectFailure, consecutive: number): number | null {
  const policy = RETRY[failure.kind];
  if (policy === null) return null;
  const backoff = Math.min(policy.maxMs, policy.baseMs * 2 ** Math.max(0, consecutive - 1));
  return Math.max(backoff, failure.retryAfterMs ?? 0);
}
