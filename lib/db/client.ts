import postgres from "postgres";

type SqlClient = ReturnType<typeof postgres>;

let sqlClient: SqlClient | null = null;

function getMaxConnections() {
  const configuredMax = Number(process.env.POSTGRES_MAX_CONNECTIONS);

  if (Number.isInteger(configuredMax) && configuredMax > 0) {
    return configuredMax;
  }

  return process.env.VERCEL ? 1 : 4;
}

export function getSql() {
  if (sqlClient) {
    return sqlClient;
  }

  const connectionString =
    process.env.DATABASE_URL || process.env.DIRECT_DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL is not configured");
  }

  sqlClient = postgres(connectionString, {
    connect_timeout: 10,
    idle_timeout: process.env.VERCEL ? 5 : 20,
    max: getMaxConnections(),
    max_lifetime: process.env.VERCEL ? 60 : 60 * 30,
    prepare: false,
    ssl: "require",
  });

  return sqlClient;
}
