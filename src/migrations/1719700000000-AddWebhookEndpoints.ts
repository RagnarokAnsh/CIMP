import { MigrationInterface, QueryRunner } from 'typeorm';

// Outbound webhooks: admin-configured endpoints that receive HMAC-signed JSON
// on issue events, per-platform or global (platform_id NULL).
export class AddWebhookEndpoints1719700000000 implements MigrationInterface {
  name = 'AddWebhookEndpoints1719700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "webhook_endpoints" (
        "id"          uuid DEFAULT uuid_generate_v4() NOT NULL,
        "platform_id" uuid,
        "url"         character varying NOT NULL,
        "secret"      character varying NOT NULL,
        "events"      jsonb NOT NULL DEFAULT '[]',
        "enabled"     boolean NOT NULL DEFAULT true,
        "created_by"  uuid,
        "created_at"  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_webhook_endpoints" PRIMARY KEY ("id"),
        CONSTRAINT "FK_webhook_endpoints_platform" FOREIGN KEY ("platform_id") REFERENCES "platforms"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "idx_webhook_endpoints_platform" ON "webhook_endpoints" ("platform_id")',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS "webhook_endpoints"');
  }
}
