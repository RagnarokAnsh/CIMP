import { MigrationInterface, QueryRunner } from 'typeorm';

// The baseline migration created only the reference_no unique index, so every
// issue list, dashboard aggregate, reporter lookup, and child-table join ran as
// a full sequential scan. This adds btree indexes on the hot filter/sort/FK
// columns. Names match the @Index decorators on the entities so dev
// (DB_SYNCHRONIZE) and prod (migrations) converge on the same indexes.
export class AddIssueIndexes1718700000000 implements MigrationInterface {
  name = 'AddIssueIndexes1718700000000';

  private readonly indexes: Array<[string, string]> = [
    ['idx_issues_platform', 'CREATE INDEX IF NOT EXISTS "idx_issues_platform" ON "issues" ("platform_id")'],
    ['idx_issues_status', 'CREATE INDEX IF NOT EXISTS "idx_issues_status" ON "issues" ("status")'],
    ['idx_issues_assignee', 'CREATE INDEX IF NOT EXISTS "idx_issues_assignee" ON "issues" ("assignee_id")'],
    ['idx_issues_reporter', 'CREATE INDEX IF NOT EXISTS "idx_issues_reporter" ON "issues" ("reporter_id")'],
    ['idx_issues_created_at', 'CREATE INDEX IF NOT EXISTS "idx_issues_created_at" ON "issues" ("created_at")'],
    ['idx_issues_platform_status', 'CREATE INDEX IF NOT EXISTS "idx_issues_platform_status" ON "issues" ("platform_id", "status")'],
    ['idx_issues_platform_created', 'CREATE INDEX IF NOT EXISTS "idx_issues_platform_created" ON "issues" ("platform_id", "created_at")'],
    ['idx_comments_issue', 'CREATE INDEX IF NOT EXISTS "idx_comments_issue" ON "comments" ("issue_id")'],
    ['idx_attachments_issue', 'CREATE INDEX IF NOT EXISTS "idx_attachments_issue" ON "attachments" ("issue_id")'],
    ['idx_audit_events_issue', 'CREATE INDEX IF NOT EXISTS "idx_audit_events_issue" ON "audit_events" ("issue_id")'],
    ['idx_reporter_issue_views_reporter', 'CREATE INDEX IF NOT EXISTS "idx_reporter_issue_views_reporter" ON "reporter_issue_views" ("reporter_id")'],
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const [, sql] of this.indexes) {
      await queryRunner.query(sql);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const [name] of this.indexes) {
      await queryRunner.query(`DROP INDEX IF EXISTS "${name}"`);
    }
  }
}
