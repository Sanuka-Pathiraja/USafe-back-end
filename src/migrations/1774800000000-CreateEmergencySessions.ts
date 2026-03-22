import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateEmergencySessions1774800000000 implements MigrationInterface {
  name = "CreateEmergencySessions1774800000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
    await queryRunner.query(`
      CREATE TABLE "emergency_sessions" (
        "id" uuid NOT NULL,
        "user_id" integer NOT NULL,
        "status" character varying(20) NOT NULL DEFAULT 'ACTIVE',
        "user_name" character varying(255),
        "triggered_at" TIMESTAMP WITH TIME ZONE,
        "latitude" double precision,
        "longitude" double precision,
        "approximate_address" text,
        "contacts_count" integer NOT NULL DEFAULT 0,
        "sms_attempted" integer NOT NULL DEFAULT 0,
        "sms_sent" integer NOT NULL DEFAULT 0,
        "sms_failed" integer NOT NULL DEFAULT 0,
        "someone_answered" boolean NOT NULL DEFAULT false,
        "answered_by" character varying(255),
        "emergency_services_called" boolean NOT NULL DEFAULT false,
        "finished_at" TIMESTAMP WITH TIME ZONE,
        "cancelled_at" TIMESTAMP WITH TIME ZONE,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_emergency_sessions_id" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_emergency_sessions_user_id" ON "emergency_sessions" ("user_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_emergency_sessions_status" ON "emergency_sessions" ("status")
    `);
    await queryRunner.query(`
      ALTER TABLE "emergency_sessions"
      ADD CONSTRAINT "FK_emergency_sessions_user"
      FOREIGN KEY ("user_id") REFERENCES "users"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "emergency_sessions" DROP CONSTRAINT "FK_emergency_sessions_user"`);
    await queryRunner.query(`DROP INDEX "IDX_emergency_sessions_status"`);
    await queryRunner.query(`DROP INDEX "IDX_emergency_sessions_user_id"`);
    await queryRunner.query(`DROP TABLE "emergency_sessions"`);
  }
}
