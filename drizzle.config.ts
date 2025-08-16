if (!process.env.DATABASE_URL) {
  throw new Error("Missing DATABASE_URL environment variable. Please ensure the database is provisioned and the variable is set.");
}

export default {
  out: "./migrations",
  schema: "./shared/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
};
