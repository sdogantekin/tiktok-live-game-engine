import { ConnectFailureError, classifyFailure } from './failures';

/** What the provider needs from a connection to a TikTok LIVE. The real one wraps the library; tests use a fake. */
export interface LiveConnection {
  /** Resolves once events can flow; rejects (with any error) if the stream cannot be joined. */
  connect(): Promise<void>;
  /** Closes the connection. Never rejects. */
  disconnect(): Promise<void>;
}

export interface ConnectionHandlers {
  onChat(message: unknown): void;
  onGift(message: unknown): void;
  /** The connection closed (the stream may or may not have ended). */
  onDisconnected(): void;
  /** TikTok said the stream ended. */
  onStreamEnd(): void;
  /** A non-fatal error from the connection. */
  onError(error: unknown): void;
}

export type ConnectionFactory = (username: string, handlers: ConnectionHandlers) => LiveConnection;

export interface LibraryConnectionOptions {
  /** Optional API key of the signing service (raises its free rate limits). Never logged and never sent to the game. */
  signApiKey?: string;
}

const DISCONNECT_TIMEOUT_MS = 3_000;

/**
 * The connection to TikTok LIVE through the unofficial `tiktok-live-connector` library, which is read-only: it listens to
 * a public stream by username, with no login and no session cookie (this adapter never passes either). The library is
 * loaded only when a connection is first made, so the simulator and the tests never load it. Library errors are
 * classified here, where its own error classes are known.
 */
export function createLibraryConnectionFactory(options: LibraryConnectionOptions = {}): ConnectionFactory {
  return (username, handlers) => {
    let connection: { disconnect(): Promise<void> } | null = null;

    return {
      async connect() {
        try {
          const lib = await import('tiktok-live-connector');
          const instance = new lib.TikTokLiveConnection(username, {
            processInitialData: false, // history is not wanted: only what happens from now on
            enableExtendedGiftInfo: false,
            fetchRoomInfoOnConnect: true, // fails with UserOfflineError if the creator is not live
            ...(options.signApiKey ? { signApiKey: options.signApiKey } : {}),
          });
          connection = instance;
          instance.on(lib.WebcastEvent.CHAT, (message: unknown) => handlers.onChat(message));
          instance.on(lib.WebcastEvent.GIFT, (message: unknown) => handlers.onGift(message));
          instance.on(lib.WebcastEvent.STREAM_END, () => handlers.onStreamEnd());
          instance.on(lib.ControlEvent.DISCONNECTED, () => handlers.onDisconnected());
          instance.on(lib.ControlEvent.ERROR, (event: unknown) => handlers.onError((event as { exception?: unknown })?.exception ?? event));

          try {
            await instance.connect();
          } catch (error) {
            throw new ConnectFailureError(classifyLibraryError(error, lib));
          }
        } catch (error) {
          if (error instanceof ConnectFailureError) throw error;
          throw new ConnectFailureError(classifyFailure(error));
        }
      },

      async disconnect() {
        const current = connection;
        connection = null;
        if (!current) return;
        await Promise.race([current.disconnect().catch(() => undefined), new Promise((resolve) => setTimeout(resolve, DISCONNECT_TIMEOUT_MS))]);
      },
    };
  };
}

/** Classifies by the library's own error classes first (reliable), then by message (for errors wrapped by `got` or `ws`). */
export function classifyLibraryError(error: unknown, lib: typeof import('tiktok-live-connector')) {
  if (error instanceof lib.UserOfflineError) return { kind: 'offline' as const, detail: 'UserOfflineError' };
  if (error instanceof lib.InvalidUniqueIdError) return { kind: 'invalid_username' as const, detail: 'InvalidUniqueIdError' };
  if (error instanceof lib.SignatureRateLimitError) return { kind: 'rate_limited' as const, retryAfterMs: error.retryAfter, detail: 'SignatureRateLimitError' };
  if (error instanceof lib.SignAPIError) return { kind: 'signing' as const, detail: `SignAPIError: ${error.reason}` };
  if (error instanceof lib.ConnectTimeoutError) return { kind: 'timeout' as const, detail: 'ConnectTimeoutError' };
  return classifyFailure(error);
}
