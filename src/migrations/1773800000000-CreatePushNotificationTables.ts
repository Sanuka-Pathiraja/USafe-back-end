import { MigrationInterface, QueryRunner } from "typeorm";

export class CreatePushNotificationTables1773800000000 implements MigrationInterface {
  name = "CreatePushNotificationTables1773800000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TYPE "public"."notification_device_tokens_platform_enum" AS ENUM('android', 'ios', 'web')`);
    await queryRunner.query(`
      CREATE TABLE "notification_device_tokens" (
        "id" SERIAL NOT NULL,
        "userId" integer NOT NULL,
        "token" text NOT NULL,
        "platform" "public"."notification_device_tokens_platform_enum" NOT NULL,
        "deviceName" character varying(255),
        "isActive" boolean NOT NULL DEFAULT true,
        "lastUsedAt" TIMESTAMP WITH TIME ZONE,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_notification_device_tokens_token" UNIQUE ("token"),
        CONSTRAINT "PK_notification_device_tokens_id" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "push_notification_logs" (
        "id" SERIAL NOT NULL,
        "userId" integer NOT NULL,
        "token" text,
        "platform" character varying(20),
        "notificationType" character varying(80) NOT NULL,
        "score" integer,
        "threshold" integer,
        "provider" character varying(40) NOT NULL DEFAULT 'fcm',
        "providerResponse" jsonb,
        "status" character varying(40) NOT NULL,
        "sentAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_push_notification_logs_id" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_notification_device_tokens_userId_isActive" ON "notification_device_tokens" ("userId", "isActive") `);
    await queryRunner.query(`CREATE INDEX "IDX_push_notification_logs_userId_type_sentAt" ON "push_notification_logs" ("userId", "notificationType", "sentAt") `);
    await queryRunner.query(`
      ALTER TABLE "notification_device_tokens"
      ADD CONSTRAINT "FK_notification_device_tokens_user"
      FOREIGN KEY ("userId") REFERENCES "users"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "notification_device_tokens" DROP CONSTRAINT "FK_notification_device_tokens_user"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_push_notification_logs_userId_type_sentAt"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_notification_device_tokens_userId_isActive"`);
    await queryRunner.query(`DROP TABLE "push_notification_logs"`);
    await queryRunner.query(`DROP TABLE "notification_device_tokens"`);
    await queryRunner.query(`DROP TYPE "public"."notification_device_tokens_platform_enum"`);
  }
}
