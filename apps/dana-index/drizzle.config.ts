import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/social/schema.ts',
  out: './src/social/migrations',
  dialect: 'sqlite',
});
