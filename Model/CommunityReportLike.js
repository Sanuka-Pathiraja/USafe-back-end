import { EntitySchema } from "typeorm";

export default new EntitySchema({
  name: "CommunityReportLike",
  tableName: "community_report_likes",
  columns: {
    likeId: {
      primary: true,
      type: "int",
      generated: true,
    },
    createdAt: {
      type: "timestamp",
      default: () => "CURRENT_TIMESTAMP",
    },
  },
  relations: {
    report: {
      type: "many-to-one",
      target: "CommunityReport",
      joinColumn: {
        name: "reportId",
      },
      onDelete: "CASCADE",
    },
    user: {
      type: "many-to-one",
      target: "User",
      joinColumn: {
        name: "userId",
      },
      onDelete: "CASCADE",
    },
  },
  uniques: [
    {
      name: "UQ_community_report_likes_report_user",
      columns: ["report", "user"],
    },
  ],
});
