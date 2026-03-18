import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateTripSessions1773300000000 implements MigrationInterface {
  name = "CreateTripSessions1773300000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Required for uuid_generate_v4() default on PostgreSQL.
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
    // Creates status enum used by trip_sessions.status.
    await queryRunner.query(`CREATE TYPE "public"."trip_sessions_status_enum" AS ENUM('ACTIVE', 'SAFE', 'SOS')`);
    await queryRunner.query(`
      CREATE TABLE "trip_sessions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "userId" integer NOT NULL,
        "tripName" character varying(120) NOT NULL,
        "status" "public"."trip_sessions_status_enum" NOT NULL DEFAULT 'ACTIVE',
        "expectedEndTime" TIMESTAMP WITH TIME ZONE NOT NULL,
        "trackingId" character varying(32) NOT NULL,
        "lastKnownLat" double precision,
        "lastKnownLng" double precision,
        "contactIds" integer array NOT NULL DEFAULT '{}',
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_trip_sessions_trackingId" UNIQUE ("trackingId"),
        CONSTRAINT "PK_trip_sessions_id" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "trip_sessions"
      ADD CONSTRAINT "FK_trip_sessions_user"
      FOREIGN KEY ("userId") REFERENCES "users"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "trip_sessions" DROP CONSTRAINT "FK_trip_sessions_user"`);
    await queryRunner.query(`DROP TABLE "trip_sessions"`);
    await queryRunner.query(`DROP TYPE "public"."trip_sessions_status_enum"`);
  }
}
