ALTER TABLE "member" ADD COLUMN "status" text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "member" ADD COLUMN "left_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "team" ADD COLUMN "color" text;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_status_check" CHECK ("member"."status" in ('active', 'passive'));--> statement-breakpoint
ALTER TABLE "team" ADD CONSTRAINT "team_color_check" CHECK ("team"."color" ~ '^#[0-9a-f]{6}$');