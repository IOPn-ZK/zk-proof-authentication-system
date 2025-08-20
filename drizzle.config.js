import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './lib/db/schema.js',
  out: './drizzle',
  driver: 'pg',
  dbCredentials: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'semaphore_oauth_demo',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'password',
    ssl: process.env.DB_SSL === 'true',
  },
  verbose: true,
  strict: true,
});

// To inspect data in Postgres:
// psql:
// List tables: psql -d semaphore_oauth_demo -c "\dt"
// Show groups: psql -d semaphore_oauth_demo -c "SELECT * FROM groups;"
// Show members: psql -d semaphore_oauth_demo -c "SELECT * FROM group_members ORDER BY member_index;"
// Drizzle Studio:
// npm run db:studio