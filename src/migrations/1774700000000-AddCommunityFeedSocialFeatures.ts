import { MigrationInterface, QueryRunner } from "typeorm";

export class AddCommunityFeedSocialFeatures1774700000000 implements MigrationInterface {
    name = 'AddCommunityFeedSocialFeatures1774700000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "community_reports" ADD "issueTypes" character varying array`);
        await queryRunner.query(`CREATE TABLE "community_report_likes" ("likeId" SERIAL NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "reportId" integer, "userId" integer, CONSTRAINT "UQ_community_report_likes_report_user" UNIQUE ("reportId", "userId"), CONSTRAINT "PK_4fbcf179d388322475d57f33ab1" PRIMARY KEY ("likeId"))`);
        await queryRunner.query(`CREATE TABLE "community_report_comments" ("commentId" SERIAL NOT NULL, "text" character varying NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "reportId" integer, "userId" integer, CONSTRAINT "PK_8049ba3ceebec2f3467f1ea3158" PRIMARY KEY ("commentId"))`);
        await queryRunner.query(`ALTER TABLE "community_report_likes" ADD CONSTRAINT "FK_community_report_likes_report" FOREIGN KEY ("reportId") REFERENCES "community_reports"("reportId") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "community_report_likes" ADD CONSTRAINT "FK_community_report_likes_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "community_report_comments" ADD CONSTRAINT "FK_community_report_comments_report" FOREIGN KEY ("reportId") REFERENCES "community_reports"("reportId") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "community_report_comments" ADD CONSTRAINT "FK_community_report_comments_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "community_report_comments" DROP CONSTRAINT "FK_community_report_comments_user"`);
        await queryRunner.query(`ALTER TABLE "community_report_comments" DROP CONSTRAINT "FK_community_report_comments_report"`);
        await queryRunner.query(`ALTER TABLE "community_report_likes" DROP CONSTRAINT "FK_community_report_likes_user"`);
        await queryRunner.query(`ALTER TABLE "community_report_likes" DROP CONSTRAINT "FK_community_report_likes_report"`);
        await queryRunner.query(`DROP TABLE "community_report_comments"`);
        await queryRunner.query(`DROP TABLE "community_report_likes"`);
        await queryRunner.query(`ALTER TABLE "community_reports" DROP COLUMN "issueTypes"`);
    }
}
