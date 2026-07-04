import { MigrationInterface, QueryRunner } from 'typeorm';

// Scoped API tokens for read-only integration access to a platform's issues.
export class AddApiTokens1719400000000 implements MigrationInterface {
  name = 'AddApiTokens1719400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "api_tokens" (
        "id"           uuid DEFAULT uuid_generate_v4() NOT NULL,
        "platform_id"  uuid NOT NULL,
        "name"         character varying NOT NULL,
        "token_hash"   character varying NOT NULL,
        "last_four"    character varying NOT NULL,
        "created_by"   uuid,
        "last_used_at" TIMESTAMP WITH TIME ZONE,
        "revoked_at"   TIMESTAMP WITH TIME ZONE,
        "created_at"   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_api_tokens" PRIMARY KEY ("id"),
        CONSTRAINT "FK_api_tokens_platform" FOREIGN KEY ("platform_id") REFERENCES "platforms"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query('CREATE UNIQUE INDEX IF NOT EXISTS "idx_api_tokens_hash" ON "api_tokens" ("token_hash")');
    await queryRunner.query('CREATE INDEX IF NOT EXISTS "idx_api_tokens_platform" ON "api_tokens" ("platform_id")');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS "api_tokens"');
  }
}
