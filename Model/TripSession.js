import { EntitySchema } from "typeorm";

// Canonical lifecycle states used by TripSession records and API responses.
export const TRIP_SESSION_STATUS = {
  ACTIVE: "ACTIVE",
  SAFE: "SAFE",
  SOS: "SOS",
};

// Persists a user's SafePath trip session for timer, tracking, and SOS workflows.
export default new EntitySchema({
  name: "TripSession",
  tableName: "trip_sessions",
  columns: {
    id: {
      primary: true,
      type: "uuid",
      generated: "uuid",
    },
    userId: {
      type: "int",
    },
    tripName: {
      type: "varchar",
      length: 120,
    },
    status: {
      type: "enum",
      enum: Object.values(TRIP_SESSION_STATUS),
      default: TRIP_SESSION_STATUS.ACTIVE,
    },
    expectedEndTime: {
      type: "timestamptz",
    },
    trackingId: {
      type: "varchar",
      length: 32,
      unique: true,
    },
    lastKnownLat: {
      type: "double precision",
      nullable: true,
    },
    lastKnownLng: {
      type: "double precision",
      nullable: true,
    },
    contactIds: {
      type: "int",
      array: true,
      default: "{}",
    },
    createdAt: {
      type: "timestamptz",
      createDate: true,
    },
    updatedAt: {
      type: "timestamptz",
      updateDate: true,
    },
  },
  relations: {
    user: {
      type: "many-to-one",
      target: "User",
      joinColumn: { name: "userId" },
      onDelete: "CASCADE",
    },
  },
});