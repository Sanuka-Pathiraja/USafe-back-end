import { EntitySchema } from "typeorm";

export default new EntitySchema({
  name: "CommunityReport",
  tableName: "community_reports",
  columns: {
    reportId: {
      primary: true,
      type: "int",
      generated: true,
    },
    reportContent: {
      type: "varchar",
    },
    reportDate_time: {
      type: "timestamp",
      default: () => "CURRENT_TIMESTAMP",
    },
    images_proofs: {
      type: "varchar",
      array: true,
      nullable: true,
    },
    location: {
      type: "varchar",
      nullable: true,
    },
  },
  relations: {
    user: {
      type: "many-to-one",
      target: "User",
      joinColumn: {
        name: "userId", // FK column name
      },
      onDelete: "CASCADE",
    },
  },
});
