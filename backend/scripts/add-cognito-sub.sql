-- Add cognito_sub column to users table for AWS Cognito integration
-- This column stores the Cognito User Sub (unique identifier from AWS Cognito)

-- Add the cognito_sub column
ALTER TABLE users ADD COLUMN IF NOT EXISTS cognito_sub VARCHAR(255);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_users_cognito_sub ON users(cognito_sub);

-- Make password_hash nullable (Cognito handles passwords now)
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
