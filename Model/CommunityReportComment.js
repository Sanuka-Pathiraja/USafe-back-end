import { EntitySchema } from "typeorm";

export default new EntitySchema({
  name: "CommunityReportComment",
  tableName: "community_report_comments",
  columns: {
    commentId: {
      primary: true,
      type: "int",
      generated: true,
    },
    text: {
      type: "varchar",
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
});
