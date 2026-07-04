import { MigrationInterface, QueryRunner } from 'typeorm';

// Issue linking (blocks / relates / duplicates) — the first item on the
// JIRA-like roadmap. A directional link between two issues on the same platform.
export class AddIssueLinks1719000000000 implements MigrationInterface {
  name = 'AddIssueLinks1719000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'issue_link_type_enum') THEN
          CREATE TYPE "issue_link_type_enum" AS ENUM ('BLOCKS','RELATES','DUPLICATES');
        END IF;
      END $$;
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "issue_links" (
        "id"              uuid DEFAULT uuid_generate_v4() NOT NULL,
        "source_issue_id" uuid NOT NULL,
        "target_issue_id" uuid NOT NULL,
        "type"            "issue_link_type_enum" NOT NULL,
        "created_by"      uuid,
        "created_at"      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_issue_links" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_issue_links_pair_type" UNIQUE ("source_issue_id","target_issue_id","type"),
        CONSTRAINT "FK_issue_links_source" FOREIGN KEY ("source_issue_id") REFERENCES "issues"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_issue_links_target" FOREIGN KEY ("target_issue_id") REFERENCES "issues"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query('CREATE INDEX IF NOT EXISTS "idx_issue_links_source" ON "issue_links" ("source_issue_id")');
    await queryRunner.query('CREATE INDEX IF NOT EXISTS "idx_issue_links_target" ON "issue_links" ("target_issue_id")');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS "issue_links"');
    await queryRunner.query('DROP TYPE IF EXISTS "issue_link_type_enum"');
  }
}
