import { EntitySchema } from "typeorm";

export default new EntitySchema({
  name: "Contact",
  tableName: "contacts",
  columns: {
    contactId: { primary: true, type: "int", generated: true },
    name: { type: "varchar" },
    relationship: { type: "varchar" },
    phone: { type: "varchar" },
  },

  relations: {
    user: {
      type: "many-to-one",
      target: "User",
      joinColumn: {
        name: "userId", // THIS CREATES FOREIGN KEY COLUMN
      },
      onDelete: "CASCADE",
    },
  },
});
