-- Migration: 028_fix_user_fk_cascades
-- Description: Ensure other_profiles.user_id and recruiting_boards.owner_user_id
--              FKs to users(id) use ON DELETE CASCADE. These columns were added
--              via ALTER TABLE on existing tables, so the CASCADE in the
--              CREATE TABLE definitions was a no-op. Without CASCADE, deleting
--              a user fails with FK violations (account-deletion flow breaks).
--              Idempotent: only fires if the current rule isn't already CASCADE.

DO $$
DECLARE
  rule text;
BEGIN
  -- other_profiles.user_id
  SELECT rc.delete_rule INTO rule
  FROM information_schema.referential_constraints rc
  JOIN information_schema.table_constraints tc ON tc.constraint_name = rc.constraint_name
  WHERE tc.table_name = 'other_profiles'
    AND tc.constraint_name = 'other_profiles_user_id_fkey';

  IF rule IS NOT NULL AND rule <> 'CASCADE' THEN
    ALTER TABLE other_profiles
      DROP CONSTRAINT other_profiles_user_id_fkey,
      ADD CONSTRAINT other_profiles_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;

  -- recruiting_boards.owner_user_id
  SELECT rc.delete_rule INTO rule
  FROM information_schema.referential_constraints rc
  JOIN information_schema.table_constraints tc ON tc.constraint_name = rc.constraint_name
  WHERE tc.table_name = 'recruiting_boards'
    AND tc.constraint_name = 'recruiting_boards_owner_user_id_fkey';

  IF rule IS NOT NULL AND rule <> 'CASCADE' THEN
    ALTER TABLE recruiting_boards
      DROP CONSTRAINT recruiting_boards_owner_user_id_fkey,
      ADD CONSTRAINT recruiting_boards_owner_user_id_fkey
        FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
END $$;
