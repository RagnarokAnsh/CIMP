import { MigrationInterface, QueryRunner } from 'typeorm';

// Per-platform SLA policies + the L8 fix: SLA measures from sla_started_at
// (reset on reopen) instead of created_at, and the breach sweep marks
// sla_breached_at exactly once per cycle.
export class AddSlaPolicy1720100000000 implements MigrationInterface {
  name = 'AddSlaPolicy1720100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "platforms" ADD COLUMN IF NOT EXISTS "sla_policy" jsonb',
    );
    await queryRunner.query(
      'ALTER TABLE "issues" ADD COLUMN IF NOT EXISTS "sla_started_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()',
    );
    // Existing rows: the SLA clock has been running since creation.
    await queryRunner.query('UPDATE "issues" SET "sla_started_at" = "created_at"');
    await queryRunner.query(
      'ALTER TABLE "issues" ADD COLUMN IF NOT EXISTS "sla_breached_at" TIMESTAMP WITH TIME ZONE',
    );
    // The sweep queries open, not-yet-marked issues.
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "idx_issues_sla_breached" ON "issues" ("sla_breached_at") WHERE "sla_breached_at" IS NULL',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS "idx_issues_sla_breached"');
    await queryRunner.query('ALTER TABLE "issues" DROP COLUMN IF EXISTS "sla_breached_at"');
    await queryRunner.query('ALTER TABLE "issues" DROP COLUMN IF EXISTS "sla_started_at"');
    await queryRunner.query('ALTER TABLE "platforms" DROP COLUMN IF EXISTS "sla_policy"');
  }
}
