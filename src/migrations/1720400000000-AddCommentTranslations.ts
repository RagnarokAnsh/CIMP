import { MigrationInterface, QueryRunner } from 'typeorm';

// Machine-translation cache on comments. `body` stays the original text; these
// two columns record what language it was written in and hold translations
// keyed by base locale. Both nullable — an unconfigured deployment never writes
// to them and behaves exactly as before.
export class AddCommentTranslations1720400000000 implements MigrationInterface {
  name = 'AddCommentTranslations1720400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "comments" ADD COLUMN IF NOT EXISTS "source_locale" character varying(8)');
    await queryRunner.query('ALTER TABLE "comments" ADD COLUMN IF NOT EXISTS "translations" jsonb');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "comments" DROP COLUMN IF EXISTS "translations"');
    await queryRunner.query('ALTER TABLE "comments" DROP COLUMN IF EXISTS "source_locale"');
  }
}
