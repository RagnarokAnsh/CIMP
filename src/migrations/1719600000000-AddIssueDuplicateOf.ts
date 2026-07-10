import { MigrationInterface, QueryRunner } from 'typeorm';

// Duplicate merge flow: an issue merged as a duplicate points at its canonical
// issue. Fan-out queries (notify duplicate reporters when the canonical
// resolves) go through this column; the DUPLICATES issue_link is presentational.
export class AddIssueDuplicateOf1719600000000 implements MigrationInterface {
  name = 'AddIssueDuplicateOf1719600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "issues" ADD COLUMN IF NOT EXISTS "duplicate_of_id" uuid',
    );
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "issues"
          ADD CONSTRAINT "FK_issues_duplicate_of"
          FOREIGN KEY ("duplicate_of_id") REFERENCES "issues"("id") ON DELETE SET NULL;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `);
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "idx_issues_duplicate_of" ON "issues" ("duplicate_of_id")',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS "idx_issues_duplicate_of"');
    await queryRunner.query('ALTER TABLE "issues" DROP CONSTRAINT IF EXISTS "FK_issues_duplicate_of"');
    await queryRunner.query('ALTER TABLE "issues" DROP COLUMN IF EXISTS "duplicate_of_id"');
  }
}
