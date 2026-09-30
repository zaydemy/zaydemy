CREATE TABLE "rate_limit_hit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"hit_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "preset" text DEFAULT 'academy' NOT NULL;--> statement-breakpoint
CREATE INDEX "rate_limit_hit_key_idx" ON "rate_limit_hit" USING btree ("key","hit_at");--> statement-breakpoint
ALTER TABLE "organization" ADD CONSTRAINT "organization_preset_check" CHECK ("organization"."preset" in ('individual', 'academy', 'school'));