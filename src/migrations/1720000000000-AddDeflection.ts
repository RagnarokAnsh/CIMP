import { MigrationInterface, QueryRunner } from 'typeorm';

// Deflection: staff-published known issues (opt-in, curated title) and
// reporter "notify me instead" subscriptions to existing issues.
export class AddDeflection1720000000000 implements MigrationInterface {
  name = 'AddDeflection1720000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "issues" ADD COLUMN IF NOT EXISTS "publicly_visible" boolean NOT NULL DEFAULT false',
    );
    await queryRunner.query(
      'ALTER TABLE "issues" ADD COLUMN IF NOT EXISTS "public_title" character varying(140)',
    );
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "reporter_subscriptions" (
        "id"          uuid DEFAULT uuid_generate_v4() NOT NULL,
        "issue_id"    uuid NOT NULL,
        "reporter_id" uuid NOT NULL,
        "created_at"  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_reporter_subscriptions" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_reporter_subscriptions" UNIQUE ("issue_id","reporter_id"),
        CONSTRAINT "FK_reporter_subscriptions_issue" FOREIGN KEY ("issue_id") REFERENCES "issues"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_reporter_subscriptions_reporter" FOREIGN KEY ("reporter_id") REFERENCES "reporters"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "idx_reporter_subscriptions_issue" ON "reporter_subscriptions" ("issue_id")',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS "reporter_subscriptions"');
    await queryRunner.query('ALTER TABLE "issues" DROP COLUMN IF EXISTS "public_title"');
    await queryRunner.query('ALTER TABLE "issues" DROP COLUMN IF EXISTS "publicly_visible"');
  }
}
