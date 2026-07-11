import { MigrationInterface, QueryRunner } from 'typeorm';

// CSAT: reporters rate a resolution 👍/👎 in the portal; one row per issue.
export class AddCsatResponses1719900000000 implements MigrationInterface {
  name = 'AddCsatResponses1719900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "csat_responses" (
        "id"          uuid DEFAULT uuid_generate_v4() NOT NULL,
        "issue_id"    uuid NOT NULL,
        "reporter_id" uuid NOT NULL,
        "score"       smallint NOT NULL,
        "comment"     character varying(500),
        "created_at"  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at"  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_csat_responses" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_csat_responses_issue" UNIQUE ("issue_id"),
        CONSTRAINT "FK_csat_responses_issue" FOREIGN KEY ("issue_id") REFERENCES "issues"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_csat_responses_reporter" FOREIGN KEY ("reporter_id") REFERENCES "reporters"("id") ON DELETE CASCADE
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS "csat_responses"');
  }
}
