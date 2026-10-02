-- Row level security for the curriculum tables. Every table carries
-- organization_id (kept consistent by composite foreign keys), so one policy
-- shape covers them all: rows of the current tenant only.
--
-- What a student may see inside the tenant (published programs, unlocked
-- lessons, their own progress) is decided by the application's access rules.

--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON program TO zaydemy_app;
--> statement-breakpoint
ALTER TABLE program ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON program TO zaydemy_app
  USING (organization_id = app_organization_id())
  WITH CHECK (organization_id = app_organization_id());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON section TO zaydemy_app;
--> statement-breakpoint
ALTER TABLE section ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON section TO zaydemy_app
  USING (organization_id = app_organization_id())
  WITH CHECK (organization_id = app_organization_id());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON lesson TO zaydemy_app;
--> statement-breakpoint
ALTER TABLE lesson ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON lesson TO zaydemy_app
  USING (organization_id = app_organization_id())
  WITH CHECK (organization_id = app_organization_id());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON lesson_note_revision TO zaydemy_app;
--> statement-breakpoint
ALTER TABLE lesson_note_revision ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON lesson_note_revision TO zaydemy_app
  USING (organization_id = app_organization_id())
  WITH CHECK (organization_id = app_organization_id());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON enrollment TO zaydemy_app;
--> statement-breakpoint
ALTER TABLE enrollment ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON enrollment TO zaydemy_app
  USING (organization_id = app_organization_id())
  WITH CHECK (organization_id = app_organization_id());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON enrollment_lesson TO zaydemy_app;
--> statement-breakpoint
ALTER TABLE enrollment_lesson ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON enrollment_lesson TO zaydemy_app
  USING (organization_id = app_organization_id())
  WITH CHECK (organization_id = app_organization_id());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON lesson_progress TO zaydemy_app;
--> statement-breakpoint
ALTER TABLE lesson_progress ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON lesson_progress TO zaydemy_app
  USING (organization_id = app_organization_id())
  WITH CHECK (organization_id = app_organization_id());
