import { EntitySchema } from "typeorm";

export default new EntitySchema({
  name: "User",
  tableName: "users",
  columns: {
    id: { primary: true, type: "int", generated: true },
    name: { type: "varchar" },
    age: { type: "int" },
    phone: { type: "varchar" },
  },
});
