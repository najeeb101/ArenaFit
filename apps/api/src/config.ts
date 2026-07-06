import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(8),
  JWT_REFRESH_SECRET: z.string().min(8),
  JWT_ACCESS_TTL: z.string().default("15m"),
  JWT_REFRESH_TTL: z.string().default("7d"),
  PORT: z.coerce.number().default(3001),
  CORS_ORIGIN: z.string().default("http://localhost:3000"),
  // WebRTC groundwork (M2 human-vs-human video) — unused while matches are
  // solo-vs-bot. TURN_URLS is a comma-separated list; left empty until a
  // coturn deployment exists, so ICE falls back to STUN-only (works on most
  // networks, but not behind symmetric NAT/restrictive firewalls).
  TURN_URLS: z.string().default(""),
  TURN_USERNAME: z.string().default(""),
  TURN_CREDENTIAL: z.string().default(""),
});

export type AppConfig = z.infer<typeof envSchema>;

let cached: AppConfig | null = null;

export function config(): AppConfig {
  if (!cached) {
    const parsed = envSchema.safeParse(process.env);
    if (!parsed.success) {
      throw new Error(`Invalid environment: ${parsed.error.message}`);
    }
    cached = parsed.data;
  }
  return cached;
}

export interface IceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

/** STUN always included; TURN added once TURN_URLS is configured (coturn or a managed provider). */
export function iceServers(): IceServer[] {
  const servers: IceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];
  const { TURN_URLS, TURN_USERNAME, TURN_CREDENTIAL } = config();
  if (TURN_URLS) {
    servers.push({
      urls: TURN_URLS.split(",").map((u) => u.trim()),
      username: TURN_USERNAME || undefined,
      credential: TURN_CREDENTIAL || undefined,
    });
  }
  return servers;
}
