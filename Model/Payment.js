import { EntitySchema } from "typeorm";

export default new EntitySchema({
  name: "Payment",
  tableName: "payments",

  columns: {
    id: {
      primary: true,
      type: "int",
      generated: true,
    },

    amount: {
      type: "float",
    },

    currency: {
      type: "varchar",
    },

    stripe_id: {
      type: "varchar",
      unique: true,
    },

    status: {
      type: "varchar",
    },

    created_at: {
      type: "timestamp",
      createDate: true,
    },
  },

  relations: {
    user: {
      type: "many-to-one",
      target: "User",
      joinColumn: {
        name: "user_id",
      },
      onDelete: "CASCADE",
    },
  },
});
