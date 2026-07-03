CREATE TABLE "reviews" (
	"id" serial PRIMARY KEY NOT NULL,
	"owner" text NOT NULL,
	"repo" text NOT NULL,
	"pr_number" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"verdict" text,
	"summary" text,
	"trace" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
