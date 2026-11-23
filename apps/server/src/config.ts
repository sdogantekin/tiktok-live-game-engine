import { z } from 'zod';

const ConfigSchema = z.object({
  HOST: z.string().min(1).default('127.0.0.1'),
  PORT: z.coerce.number().int().min(0).max(65535).default(3001),
  OPERATOR_TOKEN: z.string().min(8).max(128).optional(),
  WEB_DIR: z.string().min(1).optional(),
  /** `on` lets the operator read a TikTok LIVE. Off by default: the unofficial access it uses is a deliberate, accepted risk. */
  TIKTOK_LIVE: z.enum(['on', 'off']).default('off'),
  /** Optional API key of the signing service the TikTok library depends on. A secret: never logged, never committed. */
  EULER_API_KEY: z.string().min(8).max(256).optional(),
});

export interface Config {
  host: string;
  port: number;
  /** When unset, a random token is generated at startup and printed once. */
  operatorToken?: string;
  /** Directory of the built web app to serve (production mode). */
  webDir?: string;
  tiktokEnabled: boolean;
  signApiKey?: string;
}

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const parsed = ConfigSchema.parse({ ...env, OPERATOR_TOKEN: env.OPERATOR_TOKEN || undefined, WEB_DIR: env.WEB_DIR || undefined, EULER_API_KEY: env.EULER_API_KEY || undefined });
  return {
    host: parsed.HOST,
    port: parsed.PORT,
    operatorToken: parsed.OPERATOR_TOKEN,
    webDir: parsed.WEB_DIR,
    tiktokEnabled: parsed.TIKTOK_LIVE === 'on',
    signApiKey: parsed.EULER_API_KEY,
  };
}
