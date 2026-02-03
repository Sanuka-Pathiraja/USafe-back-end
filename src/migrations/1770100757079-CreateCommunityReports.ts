import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateCommunityReports1770100757079 implements MigrationInterface {
    name = 'CreateCommunityReports1770100757079'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "community_reports" ("reportId" SERIAL NOT NULL, "reportContent" character varying NOT NULL, "reportDate_time" TIMESTAMP NOT NULL DEFAULT now(), "images_proofs" character varying array, "location" character varying, "userId" integer, CONSTRAINT "PK_3431b855dde84e3c9624e79108f" PRIMARY KEY ("reportId"))`);
        await queryRunner.query(`ALTER TABLE "community_reports" ADD CONSTRAINT "FK_03ebc9ec1e3a25e360b66ced16f" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "community_reports" DROP CONSTRAINT "FK_03ebc9ec1e3a25e360b66ced16f"`);
        await queryRunner.query(`DROP TABLE "community_reports"`);
    }

}
