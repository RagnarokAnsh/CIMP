import 'reflect-metadata';
import 'dotenv/config';
import { DataSource } from 'typeorm';
import { ALL_ENTITIES } from './entities';

// Standalone DataSource for seeding and migrations (outside the Nest runtime).
// In production set DB_SYNCHRONIZE=false and run migrations instead.
export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST ?? 'localhost',
  port: parseInt(process.env.DB_PORT ?? '5432', 10),
  username: process.env.DB_USER ?? 'support',
  password: process.env.DB_PASSWORD ?? 'support',
  database: process.env.DB_NAME ?? 'support_platform',
  entities: ALL_ENTITIES,
  migrations: ['src/migrations/*.ts'],
  migrationsTableName: 'migrations',
  synchronize: (process.env.DB_SYNCHRONIZE ?? 'true') === 'true',
});
