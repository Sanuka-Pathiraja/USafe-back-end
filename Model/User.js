import { EntitySchema } from "typeorm";

export default new EntitySchema({
  name: "User",
  tableName: "users",
  columns: {
    id: {
      primary: true,
      type: "int",
      generated: true,
    },
    firstName: { type: "varchar" },
    lastName: { type: "varchar" },
    age: { type: "int" },
    phone: { type: "varchar" },
    email: { type: "varchar" },
    password: { type: "varchar" },
    avatar: {
      type: "varchar",
      nullable: true,
    },
    birthday: {
      type: "varchar",
      nullable: true,
    },
    authProvider: {
      type: "varchar",
      default: "local", // local | google
    },
  },
  relations: {
    contacts: {
      type: "one-to-many", // One user can have many contacts
      target: "Contact", // Must match Contact entity name
      inverseSide: "user", // Must match Contact.user
      cascade: true, // Optional: automatically save new contacts
    },
    communityReports: {
      type: "one-to-many",
      target: "CommunityReport",
      inverseSide: "user",
    },
    communityReportLikes: {
      type: "one-to-many",
      target: "CommunityReportLike",
      inverseSide: "user",
    },
    communityReportComments: {
      type: "one-to-many",
      target: "CommunityReportComment",
      inverseSide: "user",
    },
  },
});
