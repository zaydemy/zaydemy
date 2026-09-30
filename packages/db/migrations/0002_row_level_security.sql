-- Row level security: the database-side tenant boundary.
--
-- The app connects as the migration owner, and every tenant-scoped
-- transaction switches to `zaydemy_app` with `SET LOCAL ROLE` and records who
-- is asking in two transaction-local settings:
--
--   app.user_id          the signed-in user
--   app.organization_id  the tenant the request acts in
--
-- `zaydemy_app` is not a table owner and has no BYPASSRLS, so the policies
-- below apply to it. A query that forgets a tenant filter still cannot see or
-- write another tenant's rows. Without the settings it sees nothing.
--
-- Authentication tables (session, account, verification, passkey) are not
-- granted to `zaydemy_app` at all: only the auth library, through the owner
-- connection, touches tokens and credentials.
--
-- Every table granted to `zaydemy_app` must have RLS enabled and a policy; a
-- test in packages/core enforces this for tables added later.

-- Roles are cluster-wide and this migration runs once per database (tests
-- create many databases, concurrently), so creation tolerates an existing role.
DO $$
BEGIN
  CREATE ROLE zaydemy_app NOLOGIN NOBYPASSRLS;
EXCEPTION
  WHEN duplicate_object OR unique_violation THEN NULL;
END;
$$;
--> statement-breakpoint
-- Lets the connecting (owner) role switch to it with SET ROLE.
GRANT zaydemy_app TO CURRENT_USER;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO zaydemy_app;
--> statement-breakpoint
CREATE FUNCTION app_user_id() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('app.user_id', true), '')::uuid
$$;
--> statement-breakpoint
CREATE FUNCTION app_organization_id() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('app.organization_id', true), '')::uuid
$$;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_user_id(), app_organization_id() TO zaydemy_app;
--> statement-breakpoint

-- organization: only the current tenant. Creating or deleting tenants is a
-- platform operation (owner connection), so no INSERT or DELETE.
GRANT SELECT, UPDATE ON organization TO zaydemy_app;
--> statement-breakpoint
ALTER TABLE organization ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON organization TO zaydemy_app
  USING (id = app_organization_id())
  WITH CHECK (id = app_organization_id());
--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE, DELETE ON member, team, invitation TO zaydemy_app;
--> statement-breakpoint
ALTER TABLE member ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON member TO zaydemy_app
  USING (organization_id = app_organization_id())
  WITH CHECK (organization_id = app_organization_id());
--> statement-breakpoint
ALTER TABLE team ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON team TO zaydemy_app
  USING (organization_id = app_organization_id())
  WITH CHECK (organization_id = app_organization_id());
--> statement-breakpoint
ALTER TABLE invitation ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON invitation TO zaydemy_app
  USING (organization_id = app_organization_id())
  WITH CHECK (organization_id = app_organization_id());
--> statement-breakpoint

-- team_member has no organization column (Better Auth owns its shape); its
-- tenant is the class's. The team policy applies inside the subquery too.
GRANT SELECT, INSERT, UPDATE, DELETE ON team_member TO zaydemy_app;
--> statement-breakpoint
ALTER TABLE team_member ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON team_member TO zaydemy_app
  USING (EXISTS (SELECT 1 FROM team t WHERE t.id = team_id AND t.organization_id = app_organization_id()))
  WITH CHECK (EXISTS (SELECT 1 FROM team t WHERE t.id = team_id AND t.organization_id = app_organization_id()));
--> statement-breakpoint

-- user: identity is global, but a tenant only sees itself and the people in
-- the current organization. Accounts are created and deleted by the auth
-- library, so only SELECT and UPDATE; the profile columns a user may edit are
-- listed explicitly (never platform_role or ban fields).
GRANT SELECT ON "user" TO zaydemy_app;
--> statement-breakpoint
GRANT UPDATE (name, image, locale, time_zone, updated_at) ON "user" TO zaydemy_app;
--> statement-breakpoint
ALTER TABLE "user" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_visibility ON "user" FOR SELECT TO zaydemy_app
  USING (
    id = app_user_id()
    OR EXISTS (
      SELECT 1 FROM member m
       WHERE m.user_id = "user".id AND m.organization_id = app_organization_id()
    )
  );
--> statement-breakpoint
CREATE POLICY self_update ON "user" FOR UPDATE TO zaydemy_app
  USING (id = app_user_id())
  WITH CHECK (id = app_user_id());
