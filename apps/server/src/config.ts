import { z } from 'zod';

const ConfigSchema = z.object({
  HOST: z.string().min(1).default('127.0.0.1'),
  PORT: z.coerce.number().int().min(0).max(65535).default(3001),
  OPERATOR_TOKEN: z.string().min(8).max(128).optional(),
});

export interface Config {
  host: string;
  port: number;
  /** When unset, a random token is generated at startup and printed once. */
  operatorToken?: string;
}

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const parsed = ConfigSchema.parse({ ...env, OPERATOR_TOKEN: env.OPERATOR_TOKEN || undefined });
  return { host: parsed.HOST, port: parsed.PORT, operatorToken: parsed.OPERATOR_TOKEN };
}
