import postgres from "postgres";

type SqlClient = ReturnType<typeof postgres>;

let sqlClient: SqlClient | null = null;

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
    max: 4,
    prepare: false,
    ssl: "require",
  });

  return sqlClient;
}
