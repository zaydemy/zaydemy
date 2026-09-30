-- Tenant integrity rules the schema alone cannot express.
--
-- 1. A class only contains members of its organization. Without this, a bug
--    (or a hand-written insert) could put someone from tenant B into a class
--    of tenant A, and every class-scoped query would leak across tenants.
-- 2. Leaving an organization removes the person from its classes.
-- 3. Tenant keys are immutable: a row never moves between organizations.
--    Moving would bypass rule 1 and silently re-scope all dependent data.

CREATE FUNCTION team_member_check_membership() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  -- FOR KEY SHARE locks the membership row until this transaction ends, so a
  -- concurrent removal from the organization cannot slip in between the check
  -- and the insert.
  PERFORM 1
     FROM member m
     JOIN team t ON t.organization_id = m.organization_id
    WHERE t.id = NEW.team_id
      AND m.user_id = NEW.user_id
      FOR KEY SHARE OF m;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'user % is not a member of the organization of team %', NEW.user_id, NEW.team_id
      USING ERRCODE = 'integrity_constraint_violation',
            CONSTRAINT = 'team_member_requires_membership';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER team_member_check_membership
  BEFORE INSERT OR UPDATE OF team_id, user_id ON team_member
  FOR EACH ROW EXECUTE FUNCTION team_member_check_membership();
--> statement-breakpoint
CREATE FUNCTION member_remove_team_memberships() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM team_member tm
   USING team t
   WHERE tm.team_id = t.id
     AND t.organization_id = OLD.organization_id
     AND tm.user_id = OLD.user_id;
  RETURN OLD;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER member_remove_team_memberships
  AFTER DELETE ON member
  FOR EACH ROW EXECUTE FUNCTION member_remove_team_memberships();
--> statement-breakpoint
CREATE FUNCTION reject_tenant_key_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '%.% cannot be changed', TG_TABLE_NAME, TG_ARGV[0]
    USING ERRCODE = 'integrity_constraint_violation',
          CONSTRAINT = TG_TABLE_NAME || '_tenant_key_immutable';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER team_organization_immutable
  BEFORE UPDATE OF organization_id ON team
  FOR EACH ROW WHEN (OLD.organization_id IS DISTINCT FROM NEW.organization_id)
  EXECUTE FUNCTION reject_tenant_key_change('organization_id');
--> statement-breakpoint
CREATE TRIGGER member_organization_immutable
  BEFORE UPDATE OF organization_id ON member
  FOR EACH ROW WHEN (OLD.organization_id IS DISTINCT FROM NEW.organization_id)
  EXECUTE FUNCTION reject_tenant_key_change('organization_id');
--> statement-breakpoint
CREATE TRIGGER member_user_immutable
  BEFORE UPDATE OF user_id ON member
  FOR EACH ROW WHEN (OLD.user_id IS DISTINCT FROM NEW.user_id)
  EXECUTE FUNCTION reject_tenant_key_change('user_id');
