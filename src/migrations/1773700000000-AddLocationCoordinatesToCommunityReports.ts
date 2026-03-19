import { MigrationInterface, QueryRunner } from "typeorm";

export class AddLocationCoordinatesToCommunityReports1773700000000 implements MigrationInterface {
    name = 'AddLocationCoordinatesToCommunityReports1773700000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "community_reports" ADD "locationCoordinates" jsonb`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "community_reports" DROP COLUMN "locationCoordinates"`);
    }
}
