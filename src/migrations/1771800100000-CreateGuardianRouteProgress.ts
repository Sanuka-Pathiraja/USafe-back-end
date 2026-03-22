import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateGuardianRouteProgress1771800100000 implements MigrationInterface {
    name = 'CreateGuardianRouteProgress1771800100000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "guardian_route_progress" (
                "id" SERIAL NOT NULL,
                "user_id" integer NOT NULL,
                "route_id" integer NOT NULL,
                "checkpoint_index" integer NOT NULL,
                "checkpoint_name" character varying NOT NULL,
                "passed_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_guardian_route_progress_id" PRIMARY KEY ("id")
            )
        `);

        await queryRunner.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS "UQ_guardian_route_progress_unique"
            ON "guardian_route_progress" ("user_id", "route_id", "checkpoint_index")
        `);

        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_guardian_route_progress_user_id"
            ON "guardian_route_progress" ("user_id")
        `);

        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_guardian_route_progress_route_id"
            ON "guardian_route_progress" ("route_id")
        `);

        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_guardian_route_progress_passed_at"
            ON "guardian_route_progress" ("passed_at")
        `);

        await queryRunner.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1
                    FROM pg_constraint
                    WHERE conname = 'FK_guardian_route_progress_user_id_users'
                ) THEN
                    ALTER TABLE "guardian_route_progress"
                    ADD CONSTRAINT "FK_guardian_route_progress_user_id_users"
                    FOREIGN KEY ("user_id") REFERENCES "users"("id")
                    ON DELETE CASCADE ON UPDATE NO ACTION;
                END IF;
            END
            $$;
        `);

        await queryRunner.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1
                    FROM pg_constraint
                    WHERE conname = 'FK_guardian_route_progress_route_id_guardian_routes_app'
                ) THEN
                    ALTER TABLE "guardian_route_progress"
                    ADD CONSTRAINT "FK_guardian_route_progress_route_id_guardian_routes_app"
                    FOREIGN KEY ("route_id") REFERENCES "guardian_routes_app"("id")
                    ON DELETE CASCADE ON UPDATE NO ACTION;
                END IF;
            END
            $$;
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "guardian_route_progress"
            DROP CONSTRAINT IF EXISTS "FK_guardian_route_progress_route_id_guardian_routes_app"
        `);

        await queryRunner.query(`
            ALTER TABLE "guardian_route_progress"
            DROP CONSTRAINT IF EXISTS "FK_guardian_route_progress_user_id_users"
        `);

        await queryRunner.query(`
            DROP INDEX IF EXISTS "IDX_guardian_route_progress_passed_at"
        `);

        await queryRunner.query(`
            DROP INDEX IF EXISTS "IDX_guardian_route_progress_route_id"
        `);

        await queryRunner.query(`
            DROP INDEX IF EXISTS "IDX_guardian_route_progress_user_id"
        `);

        await queryRunner.query(`
            DROP INDEX IF EXISTS "UQ_guardian_route_progress_unique"
        `);

        await queryRunner.query(`
            DROP TABLE IF EXISTS "guardian_route_progress"
        `);
    }
}
