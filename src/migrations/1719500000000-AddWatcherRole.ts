import { MigrationInterface, QueryRunner } from 'typeorm';

// WATCHER: a read-only staff role (sees issues/comments/attachments in scope,
// never mutates). Grantable per-platform or globally, like DEVELOPER.
// Postgres 12+ allows ADD VALUE inside a transaction as long as the new value
// is not used in the same transaction — we only add it here.
export class AddWatcherRole1719500000000 implements MigrationInterface {
  name = 'AddWatcherRole1719500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TYPE "role_enum" ADD VALUE IF NOT EXISTS 'WATCHER'`);
  }

  public async down(): Promise<void> {
    // Postgres cannot drop a value from an enum type. Rolling back would mean
    // rebuilding the type and every column using it — intentionally a no-op;
    // revoke any WATCHER grants instead.
  }
}
