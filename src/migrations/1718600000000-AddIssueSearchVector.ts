import { MigrationInterface, QueryRunner } from 'typeorm';

// Adds Postgres full-text search over an issue's description AND its comment
// bodies (FR per Section 6.4). A tsvector column on `issues` is kept current by
// two triggers — one on issues (description changes) and one on comments
// (so adding/editing a comment refreshes its parent issue's vector) — and
// indexed with GIN for fast `@@` queries.
//
// Apply AFTER the baseline schema migration (generate that against a live DB
// with `npm run migration:generate`). Once this is in place, swap the ILIKE
// branch in IssuesService for: `issue.search_vector @@ plainto_tsquery('english', :q)`.
export class AddIssueSearchVector1718600000000 implements MigrationInterface {
  name = 'AddIssueSearchVector1718600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "issues" ADD COLUMN IF NOT EXISTS "search_vector" tsvector`);

    // Recompute an issue's vector from its description + all comment bodies.
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION issues_refresh_search_vector(p_issue_id uuid)
      RETURNS void AS $$
      BEGIN
        UPDATE "issues" i
        SET "search_vector" =
          setweight(to_tsvector('english', coalesce(i.description, '')), 'A') ||
          setweight(to_tsvector('english', coalesce((
            SELECT string_agg(c.body, ' ') FROM "comments" c WHERE c.issue_id = i.id
          ), '')), 'B')
        WHERE i.id = p_issue_id;
      END;
      $$ LANGUAGE plpgsql;
    `);

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION issues_search_vector_trigger()
      RETURNS trigger AS $$
      BEGIN
        PERFORM issues_refresh_search_vector(NEW.id);
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION comments_search_vector_trigger()
      RETURNS trigger AS $$
      BEGIN
        PERFORM issues_refresh_search_vector(COALESCE(NEW.issue_id, OLD.issue_id));
        RETURN NULL;
      END;
      $$ LANGUAGE plpgsql;
    `);

    await queryRunner.query(`DROP TRIGGER IF EXISTS issues_search_vector_update ON "issues"`);
    await queryRunner.query(`
      CREATE TRIGGER issues_search_vector_update
      AFTER INSERT OR UPDATE OF description ON "issues"
      FOR EACH ROW EXECUTE FUNCTION issues_search_vector_trigger();
    `);

    await queryRunner.query(`DROP TRIGGER IF EXISTS comments_search_vector_update ON "comments"`);
    await queryRunner.query(`
      CREATE TRIGGER comments_search_vector_update
      AFTER INSERT OR UPDATE OF body OR DELETE ON "comments"
      FOR EACH ROW EXECUTE FUNCTION comments_search_vector_trigger();
    `);

    // Backfill existing rows, then index.
    await queryRunner.query(`SELECT issues_refresh_search_vector(id) FROM "issues"`);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_issues_search_vector" ON "issues" USING GIN ("search_vector")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_issues_search_vector"`);
    await queryRunner.query(`DROP TRIGGER IF EXISTS comments_search_vector_update ON "comments"`);
    await queryRunner.query(`DROP TRIGGER IF EXISTS issues_search_vector_update ON "issues"`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS comments_search_vector_trigger()`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS issues_search_vector_trigger()`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS issues_refresh_search_vector(uuid)`);
    await queryRunner.query(`ALTER TABLE "issues" DROP COLUMN IF EXISTS "search_vector"`);
  }
}
