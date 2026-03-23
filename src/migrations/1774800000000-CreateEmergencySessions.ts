import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateEmergencySessions1774800000000 implements MigrationInterface {
  name = "CreateEmergencySessions1774800000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
    await queryRunner.query(`
      CREATE TABLE "emergency_sessions" (
        "id"                        uuid NOT NULL DEFAULT uuid_generate_v4(),
        "session_id"                text NOT NULL,
        "user_id"                   text NOT NULL,
        "status"                    text NOT NULL DEFAULT 'ACTIVE',
        "trigger_source"            text,
        "user_name"                 text,
        "latitude"                  double precision,
        "longitude"                 double precision,
        "approximate_address"       text,
        "someone_answered"          boolean NOT NULL DEFAULT false,
        "emergency_services_called" boolean NOT NULL DEFAULT false,
        "contacts_messaged"         boolean NOT NULL DEFAULT false,
        "failed_step_title"         text,
        "failed_step_reason"        text,
        "cancellation_message"      text,
        "started_at"                TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "finished_at"               TIMESTAMP WITH TIME ZONE,
        "created_at"                TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at"                TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_emergency_sessions_session_id" UNIQUE ("session_id"),
        CONSTRAINT "PK_emergency_sessions_id" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_emergency_sessions_session_id" ON "emergency_sessions" ("session_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_emergency_sessions_user_id" ON "emergency_sessions" ("user_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_emergency_sessions_user_id"`);
    await queryRunner.query(`DROP INDEX "IDX_emergency_sessions_session_id"`);
    await queryRunner.query(`DROP TABLE "emergency_sessions"`);
  }
}
