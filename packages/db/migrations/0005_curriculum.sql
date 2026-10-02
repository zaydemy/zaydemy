-- Before the tables below: enrollments reference a class with its organization.
ALTER TABLE "team" ADD CONSTRAINT "team_id_organization_key" UNIQUE("id","organization_id");--> statement-breakpoint
CREATE TABLE "enrollment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"program_id" uuid NOT NULL,
	"team_id" uuid,
	"user_id" uuid,
	"access_mode" text DEFAULT 'open' NOT NULL,
	"requires_enrollment_id" uuid,
	"enrolled_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "enrollment_id_organization_key" UNIQUE("id","organization_id"),
	CONSTRAINT "enrollment_single_target_check" CHECK (num_nonnulls("enrollment"."team_id", "enrollment"."user_id") = 1),
	CONSTRAINT "enrollment_access_mode_check" CHECK ("enrollment"."access_mode" in ('open', 'selected'))
);
--> statement-breakpoint
CREATE TABLE "enrollment_lesson" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"enrollment_id" uuid NOT NULL,
	"lesson_id" uuid NOT NULL,
	"unlocked" boolean,
	"video_url" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lesson" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"section_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"title" text NOT NULL,
	"duration_minutes" integer DEFAULT 30 NOT NULL,
	"note" text,
	"video_url" text,
	"published" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lesson_id_organization_key" UNIQUE("id","organization_id"),
	CONSTRAINT "lesson_duration_check" CHECK ("lesson"."duration_minutes" between 0 and 1440)
);
--> statement-breakpoint
CREATE TABLE "lesson_note_revision" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"lesson_id" uuid NOT NULL,
	"note" text NOT NULL,
	"author_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lesson_progress" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"lesson_id" uuid NOT NULL,
	"completed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "program" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "program_id_organization_key" UNIQUE("id","organization_id"),
	CONSTRAINT "program_status_check" CHECK ("program"."status" in ('draft', 'published'))
);
--> statement-breakpoint
CREATE TABLE "section" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"program_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"title" text NOT NULL,
	CONSTRAINT "section_id_organization_key" UNIQUE("id","organization_id")
);
--> statement-breakpoint
ALTER TABLE "enrollment" ADD CONSTRAINT "enrollment_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollment" ADD CONSTRAINT "enrollment_program_fk" FOREIGN KEY ("program_id","organization_id") REFERENCES "public"."program"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollment" ADD CONSTRAINT "enrollment_team_fk" FOREIGN KEY ("team_id","organization_id") REFERENCES "public"."team"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollment" ADD CONSTRAINT "enrollment_member_fk" FOREIGN KEY ("organization_id","user_id") REFERENCES "public"."member"("organization_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollment" ADD CONSTRAINT "enrollment_requires_fk" FOREIGN KEY ("requires_enrollment_id") REFERENCES "public"."enrollment"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollment_lesson" ADD CONSTRAINT "enrollment_lesson_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollment_lesson" ADD CONSTRAINT "enrollment_lesson_enrollment_fk" FOREIGN KEY ("enrollment_id","organization_id") REFERENCES "public"."enrollment"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollment_lesson" ADD CONSTRAINT "enrollment_lesson_lesson_fk" FOREIGN KEY ("lesson_id","organization_id") REFERENCES "public"."lesson"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson" ADD CONSTRAINT "lesson_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson" ADD CONSTRAINT "lesson_section_fk" FOREIGN KEY ("section_id","organization_id") REFERENCES "public"."section"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_note_revision" ADD CONSTRAINT "lesson_note_revision_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_note_revision" ADD CONSTRAINT "lesson_note_revision_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_note_revision" ADD CONSTRAINT "lesson_note_revision_lesson_fk" FOREIGN KEY ("lesson_id","organization_id") REFERENCES "public"."lesson"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_progress" ADD CONSTRAINT "lesson_progress_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_progress" ADD CONSTRAINT "lesson_progress_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_progress" ADD CONSTRAINT "lesson_progress_lesson_fk" FOREIGN KEY ("lesson_id","organization_id") REFERENCES "public"."lesson"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program" ADD CONSTRAINT "program_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "section" ADD CONSTRAINT "section_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "section" ADD CONSTRAINT "section_program_fk" FOREIGN KEY ("program_id","organization_id") REFERENCES "public"."program"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "enrollment_team_program_idx" ON "enrollment" USING btree ("team_id","program_id") WHERE "enrollment"."team_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "enrollment_user_program_idx" ON "enrollment" USING btree ("user_id","program_id") WHERE "enrollment"."user_id" is not null;--> statement-breakpoint
CREATE INDEX "enrollment_program_idx" ON "enrollment" USING btree ("program_id");--> statement-breakpoint
CREATE UNIQUE INDEX "enrollment_lesson_idx" ON "enrollment_lesson" USING btree ("enrollment_id","lesson_id");--> statement-breakpoint
CREATE INDEX "enrollment_lesson_lesson_idx" ON "enrollment_lesson" USING btree ("lesson_id");--> statement-breakpoint
CREATE INDEX "lesson_section_idx" ON "lesson" USING btree ("section_id","position");--> statement-breakpoint
CREATE INDEX "lesson_note_revision_lesson_idx" ON "lesson_note_revision" USING btree ("lesson_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "lesson_progress_user_lesson_idx" ON "lesson_progress" USING btree ("user_id","lesson_id");--> statement-breakpoint
CREATE UNIQUE INDEX "program_organization_slug_idx" ON "program" USING btree ("organization_id","slug");--> statement-breakpoint
CREATE INDEX "section_program_idx" ON "section" USING btree ("program_id","position");
