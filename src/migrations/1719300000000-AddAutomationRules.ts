import { MigrationInterface, QueryRunner } from 'typeorm';

// Per-platform automation rules ("when X then Y").
export class AddAutomationRules1719300000000 implements MigrationInterface {
  name = 'AddAutomationRules1719300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'automation_trigger_enum') THEN
          CREATE TYPE "automation_trigger_enum" AS ENUM ('ISSUE_CREATED','STATUS_CHANGED');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'automation_action_enum') THEN
          CREATE TYPE "automation_action_enum" AS ENUM ('SET_PRIORITY','ASSIGN','ADD_LABEL');
        END IF;
      END $$;
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "automation_rules" (
        "id"             uuid DEFAULT uuid_generate_v4() NOT NULL,
        "platform_id"    uuid NOT NULL,
        "name"           character varying NOT NULL,
        "enabled"        boolean NOT NULL DEFAULT true,
        "trigger"        "automation_trigger_enum" NOT NULL,
        "trigger_status" "issue_status_enum",
        "action"         "automation_action_enum" NOT NULL,
        "action_value"   character varying NOT NULL,
        "created_by"     uuid,
        "created_at"     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_automation_rules" PRIMARY KEY ("id"),
        CONSTRAINT "FK_automation_rules_platform" FOREIGN KEY ("platform_id") REFERENCES "platforms"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query('CREATE INDEX IF NOT EXISTS "idx_automation_rules_platform" ON "automation_rules" ("platform_id")');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS "automation_rules"');
    await queryRunner.query('DROP TYPE IF EXISTS "automation_action_enum"');
    await queryRunner.query('DROP TYPE IF EXISTS "automation_trigger_enum"');
  }
}
