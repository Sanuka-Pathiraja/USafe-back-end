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
    name: { type: "varchar" },
    age: { type: "int" },
    phone: { type: "varchar" },
  },
  relations: {
    contacts: {
      type: "one-to-many", // One user can have many contacts
      target: "Contact", // Must match Contact entity name
      inverseSide: "user", // Must match Contact.user
      cascade: true, // Optional: automatically save new contacts
    },
  },
});
