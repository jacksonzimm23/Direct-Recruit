-- add-enterprise-admin-role.sql
-- Local-seed copy of backend/migrations/025_add_enterprise_admin_role.sql.
-- Adds 'enterprise_admin' to the user_role ENUM. Standalone because
-- Postgres forbids using a newly-added enum value as a SQL literal in the
-- same transaction that adds it.

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'enterprise_admin'
      AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'user_role')
  ) THEN
    ALTER TYPE user_role ADD VALUE 'enterprise_admin';
  END IF;
END $$;
