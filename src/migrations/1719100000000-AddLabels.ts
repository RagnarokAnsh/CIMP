import { MigrationInterface, QueryRunner } from 'typeorm';

// Labels (JIRA-like): a per-platform label catalog + an issue_labels join.
export class AddLabels1719100000000 implements MigrationInterface {
  name = 'AddLabels1719100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "labels" (
        "id"          uuid DEFAULT uuid_generate_v4() NOT NULL,
        "platform_id" uuid NOT NULL,
        "name"        character varying NOT NULL,
        "color"       character varying NOT NULL DEFAULT '#6b7280',
        "created_at"  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_labels" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_labels_platform_name" UNIQUE ("platform_id","name"),
        CONSTRAINT "FK_labels_platform" FOREIGN KEY ("platform_id") REFERENCES "platforms"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "issue_labels" (
        "id"       uuid DEFAULT uuid_generate_v4() NOT NULL,
        "issue_id" uuid NOT NULL,
        "label_id" uuid NOT NULL,
        CONSTRAINT "PK_issue_labels" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_issue_labels" UNIQUE ("issue_id","label_id"),
        CONSTRAINT "FK_issue_labels_issue" FOREIGN KEY ("issue_id") REFERENCES "issues"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_issue_labels_label" FOREIGN KEY ("label_id") REFERENCES "labels"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query('CREATE INDEX IF NOT EXISTS "idx_issue_labels_issue" ON "issue_labels" ("issue_id")');
    await queryRunner.query('CREATE INDEX IF NOT EXISTS "idx_labels_platform" ON "labels" ("platform_id")');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS "issue_labels"');
    await queryRunner.query('DROP TABLE IF EXISTS "labels"');
  }
}
