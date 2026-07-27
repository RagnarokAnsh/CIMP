import { MigrationInterface, QueryRunner } from 'typeorm';

// Canned responses: a per-platform catalog of reply templates ("macros") staff
// insert into the comment composer.
export class AddCannedResponses1720200000000 implements MigrationInterface {
  name = 'AddCannedResponses1720200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "canned_responses" (
        "id"          uuid DEFAULT uuid_generate_v4() NOT NULL,
        "platform_id" uuid NOT NULL,
        "title"       character varying NOT NULL,
        "body"        text NOT NULL,
        "created_by"  uuid,
        "created_at"  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at"  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_canned_responses" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_canned_responses_platform_title" UNIQUE ("platform_id","title"),
        CONSTRAINT "FK_canned_responses_platform" FOREIGN KEY ("platform_id") REFERENCES "platforms"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query('CREATE INDEX IF NOT EXISTS "idx_canned_responses_platform" ON "canned_responses" ("platform_id")');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS "canned_responses"');
  }
}
