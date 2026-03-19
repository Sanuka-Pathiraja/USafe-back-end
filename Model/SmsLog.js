import { EntitySchema } from "typeorm";

export default new EntitySchema({
  name: "SmsLog",
  tableName: "sms_logs",
  columns: {
    id: {
      primary: true,
      type: "int",
      generated: true,
    },
    userId: {
      type: "int",
    },
    contactId: {
      type: "int",
    },
    phoneNumber: {
      type: "varchar",
      nullable: true,
    },
    message: {
      type: "text",
    },
    provider: {
      type: "varchar",
    },
    providerResponse: {
      type: "jsonb",
      nullable: true,
    },
    status: {
      type: "varchar",
    },
    createdAt: {
      type: "timestamp",
      createDate: true,
      default: () => "CURRENT_TIMESTAMP",
    },
  },
});
