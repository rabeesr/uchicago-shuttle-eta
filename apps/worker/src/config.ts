function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

export const config = {
  systemId: process.env.PASSIO_SYSTEM_ID ?? "1068",
  userAgent: process.env.USER_AGENT ?? "uchicago-shuttle-eta/0.1",
  healthPort: Number(process.env.WORKER_HEALTH_PORT ?? 8080),
  supabase: {
    url: required("SUPABASE_URL"),
    serviceRoleKey: required("SUPABASE_SERVICE_ROLE_KEY"),
  },
  wsUrl: "wss://passio3.com/",
  restBase: "https://passiogo.com",
} as const;
