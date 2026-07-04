import { MigrationInterface, QueryRunner } from 'typeorm';

// Adds staff_users.token_version for session revocation: the value is embedded
// in each login token and re-checked on every request, so a password reset or
// account disable invalidates existing tokens instead of leaving them valid
// until natural expiry.
export class AddStaffTokenVersion1718800000000 implements MigrationInterface {
  name = 'AddStaffTokenVersion1718800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "staff_users" ADD COLUMN IF NOT EXISTS "token_version" integer NOT NULL DEFAULT 1',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "staff_users" DROP COLUMN IF EXISTS "token_version"');
  }
}
