import { EntitySchema } from "typeorm";

export default new EntitySchema({
  name: "Contact",
  tableName: "contacts", // Plural to avoid conflicts
  columns: {
    contactId: {
      primary: true,
      type: "int",
      generated: true,
    },
    name: { type: "varchar" },
    relationship: { type: "varchar" },
    phone: { type: "varchar" },
  },
  relations: {
    user: {
      type: "many-to-one", // Each contact belongs to one user
      target: "User", // Must match User entity name
      joinColumn: { name: "userId" }, // FK column in contacts table
      onDelete: "CASCADE",
    },
  },
});
