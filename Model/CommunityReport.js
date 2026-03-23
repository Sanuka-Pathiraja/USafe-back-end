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
    issueTypes: {
      type: "varchar",
      array: true,
      nullable: true,
    },
    location: {
      type: "varchar",
      nullable: true,
    },
    locationCoordinates: {
      type: "jsonb",
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
    likes: {
      type: "one-to-many",
      target: "CommunityReportLike",
      inverseSide: "report",
      cascade: true,
    },
    comments: {
      type: "one-to-many",
      target: "CommunityReportComment",
      inverseSide: "report",
      cascade: true,
    },
  },
});
