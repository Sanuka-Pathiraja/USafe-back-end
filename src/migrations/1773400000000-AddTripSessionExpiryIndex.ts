import { MigrationInterface, QueryRunner } from "typeorm";

export class AddTripSessionExpiryIndex1773400000000 implements MigrationInterface {
  name = "AddTripSessionExpiryIndex1773400000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_trip_sessions_status_expectedEndTime"
      ON "trip_sessions" ("status", "expectedEndTime")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_trip_sessions_status_expectedEndTime"
    `);
  }
}
