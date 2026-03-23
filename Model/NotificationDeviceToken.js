import { EntitySchema } from "typeorm";

export const NOTIFICATION_PLATFORM = {
  ANDROID: "android",
  IOS: "ios",
  WEB: "web",
};

export default new EntitySchema({
  name: "NotificationDeviceToken",
  tableName: "notification_device_tokens",
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
      unique: true,
    },
    platform: {
      type: "enum",
      enum: Object.values(NOTIFICATION_PLATFORM),
    },
    deviceName: {
      type: "varchar",
      length: 255,
      nullable: true,
    },
    isActive: {
      type: "boolean",
      default: true,
    },
    lastUsedAt: {
      type: "timestamptz",
      nullable: true,
    },
    createdAt: {
      type: "timestamptz",
      createDate: true,
    },
    updatedAt: {
      type: "timestamptz",
      updateDate: true,
    },
  },
  relations: {
    user: {
      type: "many-to-one",
      target: "User",
      joinColumn: { name: "userId" },
      onDelete: "CASCADE",
    },
  },
});
