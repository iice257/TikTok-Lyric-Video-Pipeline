export type ApiConfig = {
  port: number;
  databaseUrl: string;
  corsOrigin: string;
  readOnlyApiKey: string;
};

export function readConfig(): ApiConfig {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required.");
  }
  return {
    port: Number(process.env.PORT || 8100),
    databaseUrl,
    corsOrigin: process.env.CORS_ORIGIN || "http://localhost:3000",
    readOnlyApiKey: process.env.READ_ONLY_API_KEY || "",
  };
}
