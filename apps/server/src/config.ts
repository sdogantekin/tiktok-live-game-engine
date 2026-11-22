import { z } from 'zod';

const ConfigSchema = z.object({
  HOST: z.string().min(1).default('127.0.0.1'),
  PORT: z.coerce.number().int().min(0).max(65535).default(3001),
});

export interface Config {
  host: string;
  port: number;
}

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const parsed = ConfigSchema.parse(env);
  return { host: parsed.HOST, port: parsed.PORT };
}
