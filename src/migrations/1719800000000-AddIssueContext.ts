import { MigrationInterface, QueryRunner } from 'typeorm';

// Client diagnostics captured by the cimp-connect SDK at intake — environment,
// recent console errors, failed requests, route breadcrumbs. Unindexed jsonb;
// sanitized and size-clamped before write.
export class AddIssueContext1719800000000 implements MigrationInterface {
  name = 'AddIssueContext1719800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "issues" ADD COLUMN IF NOT EXISTS "context" jsonb');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "issues" DROP COLUMN IF EXISTS "context"');
  }
}
