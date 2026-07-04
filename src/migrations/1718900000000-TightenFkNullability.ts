import { MigrationInterface, QueryRunner } from 'typeorm';

// The baseline migration declared several required FK columns as nullable, while
// the entities (and DB_SYNCHRONIZE) treat them as NOT NULL — so prod (migrations)
// and dev disagreed, allowing orphan rows and 500s (e.g. IssuesService.getDetail
// dereferences issue.platform.id). This aligns prod with the entity contract.
//
// NOTE: this fails if any existing row has a NULL in these columns. On a
// consistent database (the normal case) it is a no-op-safe tightening. If it
// fails, clean up the offending rows first.
export class TightenFkNullability1718900000000 implements MigrationInterface {
  name = 'TightenFkNullability1718900000000';

  private readonly columns: Array<[string, string]> = [
    ['issues', 'platform_id'],
    ['issues', 'reporter_id'],
    ['comments', 'issue_id'],
    ['attachments', 'issue_id'],
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const [table, column] of this.columns) {
      await queryRunner.query(`ALTER TABLE "${table}" ALTER COLUMN "${column}" SET NOT NULL`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const [table, column] of this.columns) {
      await queryRunner.query(`ALTER TABLE "${table}" ALTER COLUMN "${column}" DROP NOT NULL`);
    }
  }
}
