import { EntitySchema } from "typeorm";

export default new EntitySchema({
  name: "PushNotificationLog",
  tableName: "push_notification_logs",
  columns: {
    id: {
      primary: true,
      type: "int",
      generated: true,
    },
    userId: {
      type: "int",
    },
    token: {
      type: "text",
      nullable: true,
    },
    platform: {
      type: "varchar",
      length: 20,
      nullable: true,
    },
    notificationType: {
      type: "varchar",
      length: 80,
    },
    score: {
      type: "int",
      nullable: true,
    },
    threshold: {
      type: "int",
      nullable: true,
    },
    provider: {
      type: "varchar",
      length: 40,
      default: "fcm",
    },
    providerResponse: {
      type: "jsonb",
      nullable: true,
    },
    status: {
      type: "varchar",
      length: 40,
    },
    sentAt: {
      type: "timestamptz",
      default: () => "CURRENT_TIMESTAMP",
    },
    createdAt: {
      type: "timestamptz",
      createDate: true,
    },
  },
});
