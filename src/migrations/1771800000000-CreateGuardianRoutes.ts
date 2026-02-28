import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateGuardianRoutes1771800000000 implements MigrationInterface {
    name = 'CreateGuardianRoutes1771800000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "guardian_routes_app" (
                "id" SERIAL NOT NULL,
                "user_id" integer NOT NULL,
                "route_name" character varying NOT NULL,
                "checkpoints" jsonb NOT NULL DEFAULT '[]'::jsonb,
                "is_active" boolean NOT NULL DEFAULT true,
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_guardian_routes_app_id" PRIMARY KEY ("id")
            )
        `);

        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_guardian_routes_app_user_id" ON "guardian_routes_app" ("user_id")
        `);

        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_guardian_routes_app_created_at" ON "guardian_routes_app" ("created_at")
        `);

        await queryRunner.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1
                    FROM pg_constraint
                    WHERE conname = 'FK_guardian_routes_app_user_id_users'
                ) THEN
                    ALTER TABLE "guardian_routes_app"
                    ADD CONSTRAINT "FK_guardian_routes_app_user_id_users"
                    FOREIGN KEY ("user_id") REFERENCES "users"("id")
                    ON DELETE CASCADE ON UPDATE NO ACTION;
                END IF;
            END
            $$;
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "guardian_routes_app"
            DROP CONSTRAINT IF EXISTS "FK_guardian_routes_app_user_id_users"
        `);

        await queryRunner.query(`
            DROP INDEX IF EXISTS "IDX_guardian_routes_app_created_at"
        `);

        await queryRunner.query(`
            DROP INDEX IF EXISTS "IDX_guardian_routes_app_user_id"
        `);

        await queryRunner.query(`
            DROP TABLE IF EXISTS "guardian_routes_app"
        `);
    }
}
