import {
  pgTable,
  serial,
  text,
  integer,
  timestamp,
  jsonb,
} from "drizzle-orm/pg-core";

export const reviews = pgTable("reviews", {
  id: serial("id").primaryKey(),
  owner: text("owner").notNull(),
  repo: text("repo").notNull(),
  prNumber: integer("pr_number").notNull(),
  status: text("status").notNull().default("pending"), // pending | processing | done | failed
  verdict: text("verdict"), // pass | fail | incomplete
  summary: text("summary"),
  trace: jsonb("trace"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
