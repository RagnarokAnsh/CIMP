import { MigrationInterface, QueryRunner } from 'typeorm';

// Issue watchers: staff subscribe to an issue's status-change notifications.
export class AddIssueWatchers1719200000000 implements MigrationInterface {
  name = 'AddIssueWatchers1719200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "issue_watchers" (
        "id"            uuid DEFAULT uuid_generate_v4() NOT NULL,
        "issue_id"      uuid NOT NULL,
        "staff_user_id" uuid NOT NULL,
        "created_at"    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_issue_watchers" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_issue_watchers" UNIQUE ("issue_id","staff_user_id"),
        CONSTRAINT "FK_issue_watchers_issue" FOREIGN KEY ("issue_id") REFERENCES "issues"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_issue_watchers_staff" FOREIGN KEY ("staff_user_id") REFERENCES "staff_users"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query('CREATE INDEX IF NOT EXISTS "idx_issue_watchers_issue" ON "issue_watchers" ("issue_id")');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS "issue_watchers"');
  }
}
