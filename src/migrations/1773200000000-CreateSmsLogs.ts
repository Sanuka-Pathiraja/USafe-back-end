import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateSmsLogs1773200000000 implements MigrationInterface {
    name = 'CreateSmsLogs1773200000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "sms_logs" ("id" SERIAL NOT NULL, "userId" integer NOT NULL, "contactId" integer NOT NULL, "phoneNumber" character varying, "message" text NOT NULL, "provider" character varying NOT NULL, "providerResponse" jsonb, "status" character varying NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_7cfe71ab494db24fc1f6b0b0b1f" PRIMARY KEY ("id"))`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "sms_logs"`);
    }
}
