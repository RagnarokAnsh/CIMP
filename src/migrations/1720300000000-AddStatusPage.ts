import { MigrationInterface, QueryRunner } from 'typeorm';

// Public status page: per-platform components + incidents with a public update
// timeline. Enum types are created explicitly so the columns match the
// TypeScript enums in src/common/enums.ts.
export class AddStatusPage1720300000000 implements MigrationInterface {
  name = 'AddStatusPage1720300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "status_components_status_enum" AS ENUM
          ('OPERATIONAL','MAINTENANCE','DEGRADED','PARTIAL_OUTAGE','MAJOR_OUTAGE');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "status_incidents_status_enum" AS ENUM
          ('INVESTIGATING','IDENTIFIED','MONITORING','RESOLVED');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "status_incidents_impact_enum" AS ENUM
          ('MINOR','MAJOR','CRITICAL','MAINTENANCE');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "status_incident_updates_status_enum" AS ENUM
          ('INVESTIGATING','IDENTIFIED','MONITORING','RESOLVED');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "status_components" (
        "id"          uuid DEFAULT uuid_generate_v4() NOT NULL,
        "platform_id" uuid NOT NULL,
        "name"        character varying NOT NULL,
        "description" text,
        "status"      "status_components_status_enum" NOT NULL DEFAULT 'OPERATIONAL',
        "position"    integer NOT NULL DEFAULT 0,
        "created_at"  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at"  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_status_components" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_status_components_platform_name" UNIQUE ("platform_id","name"),
        CONSTRAINT "FK_status_components_platform" FOREIGN KEY ("platform_id") REFERENCES "platforms"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "status_incidents" (
        "id"          uuid DEFAULT uuid_generate_v4() NOT NULL,
        "platform_id" uuid NOT NULL,
        "title"       character varying NOT NULL,
        "status"      "status_incidents_status_enum" NOT NULL DEFAULT 'INVESTIGATING',
        "impact"      "status_incidents_impact_enum" NOT NULL DEFAULT 'MINOR',
        "started_at"  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "resolved_at" TIMESTAMP WITH TIME ZONE,
        "created_by"  uuid,
        "created_at"  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at"  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_status_incidents" PRIMARY KEY ("id"),
        CONSTRAINT "FK_status_incidents_platform" FOREIGN KEY ("platform_id") REFERENCES "platforms"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "status_incident_updates" (
        "id"          uuid DEFAULT uuid_generate_v4() NOT NULL,
        "incident_id" uuid NOT NULL,
        "status"      "status_incident_updates_status_enum" NOT NULL,
        "body"        text NOT NULL,
        "created_by"  uuid,
        "created_at"  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_status_incident_updates" PRIMARY KEY ("id"),
        CONSTRAINT "FK_status_incident_updates_incident" FOREIGN KEY ("incident_id") REFERENCES "status_incidents"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "status_incident_components" (
        "incident_id"  uuid NOT NULL,
        "component_id" uuid NOT NULL,
        CONSTRAINT "PK_status_incident_components" PRIMARY KEY ("incident_id","component_id"),
        CONSTRAINT "FK_sic_incident" FOREIGN KEY ("incident_id") REFERENCES "status_incidents"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_sic_component" FOREIGN KEY ("component_id") REFERENCES "status_components"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query('CREATE INDEX IF NOT EXISTS "idx_status_components_platform" ON "status_components" ("platform_id")');
    await queryRunner.query('CREATE INDEX IF NOT EXISTS "idx_status_incidents_platform" ON "status_incidents" ("platform_id")');
    await queryRunner.query('CREATE INDEX IF NOT EXISTS "idx_status_incidents_started" ON "status_incidents" ("started_at")');
    await queryRunner.query('CREATE INDEX IF NOT EXISTS "idx_status_incident_updates_incident" ON "status_incident_updates" ("incident_id")');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS "status_incident_components"');
    await queryRunner.query('DROP TABLE IF EXISTS "status_incident_updates"');
    await queryRunner.query('DROP TABLE IF EXISTS "status_incidents"');
    await queryRunner.query('DROP TABLE IF EXISTS "status_components"');
    await queryRunner.query('DROP TYPE IF EXISTS "status_incident_updates_status_enum"');
    await queryRunner.query('DROP TYPE IF EXISTS "status_incidents_impact_enum"');
    await queryRunner.query('DROP TYPE IF EXISTS "status_incidents_status_enum"');
    await queryRunner.query('DROP TYPE IF EXISTS "status_components_status_enum"');
  }
}
