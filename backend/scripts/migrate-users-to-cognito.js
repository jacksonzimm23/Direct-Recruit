/**
 * Migration script to move existing users to AWS Cognito
 *
 * IMPORTANT: Run the SQL migration first (add-cognito-sub.sql)
 *
 * This script will:
 * 1. Fetch all existing users from the database
 * 2. Create each user in AWS Cognito with a temporary password
 * 3. Update the local database with the Cognito sub ID
 * 4. Users will need to reset their password on first login
 *
 * Usage: node scripts/migrate-users-to-cognito.js
 */

require('dotenv').config();
const pool = require('../config/database');
const cognito = require('../utils/cognito');

async function migrateUsers() {
  console.log('Starting user migration to Cognito...\n');

  // Check environment variables
  if (!process.env.AWS_COGNITO_USER_POOL_ID || !process.env.AWS_COGNITO_CLIENT_ID) {
    console.error('ERROR: AWS Cognito environment variables not set.');
    console.error('Please ensure AWS_COGNITO_USER_POOL_ID and AWS_COGNITO_CLIENT_ID are in your .env file');
    process.exit(1);
  }

  try {
    // Get all users without cognito_sub
    const result = await pool.query(`
      SELECT id, email, role
      FROM users
      WHERE cognito_sub IS NULL
      ORDER BY created_at
    `);

    const users = result.rows;
    console.log(`Found ${users.length} users to migrate\n`);

    if (users.length === 0) {
      console.log('No users to migrate. All users already have Cognito accounts.');
      process.exit(0);
    }

    const migrationResults = {
      success: [],
      failed: [],
      alreadyExists: []
    };

    for (const user of users) {
      console.log(`Migrating: ${user.email}...`);

      try {
        // Create user in Cognito
        const createResult = await cognito.adminCreateUser(user.email, user.role);

        if (!createResult.success) {
          if (createResult.error === 'User already exists in Cognito') {
            // User exists in Cognito, get their sub and link it
            const cognitoUser = await cognito.adminGetUser(user.email);
            if (cognitoUser.success) {
              await pool.query(
                'UPDATE users SET cognito_sub = $1 WHERE id = $2',
                [cognitoUser.attributes.sub, user.id]
              );
              console.log(`  - Linked existing Cognito user`);
              migrationResults.alreadyExists.push(user.email);
            }
          } else {
            throw new Error(createResult.error);
          }
        } else {
          // Get the cognito sub from the created user
          const cognitoSub = createResult.user.Attributes.find(a => a.Name === 'sub')?.Value;

          if (cognitoSub) {
            // Update local database with cognito_sub
            await pool.query(
              'UPDATE users SET cognito_sub = $1 WHERE id = $2',
              [cognitoSub, user.id]
            );
          }

          console.log(`  - Created in Cognito (temp password generated)`);
          migrationResults.success.push({
            email: user.email,
            tempPassword: createResult.temporaryPassword
          });
        }
      } catch (error) {
        console.error(`  - FAILED: ${error.message}`);
        migrationResults.failed.push({
          email: user.email,
          error: error.message
        });
      }
    }

    // Print summary
    console.log('\n' + '='.repeat(50));
    console.log('MIGRATION SUMMARY');
    console.log('='.repeat(50));
    console.log(`Successfully migrated: ${migrationResults.success.length}`);
    console.log(`Already in Cognito: ${migrationResults.alreadyExists.length}`);
    console.log(`Failed: ${migrationResults.failed.length}`);

    if (migrationResults.success.length > 0) {
      console.log('\n--- Temporary Passwords (SAVE THESE!) ---');
      console.log('Users will need to reset their password on first login.\n');

      for (const user of migrationResults.success) {
        console.log(`Email: ${user.email}`);
        console.log(`Temp Password: ${user.tempPassword}`);
        console.log('---');
      }
    }

    if (migrationResults.failed.length > 0) {
      console.log('\n--- Failed Migrations ---');
      for (const user of migrationResults.failed) {
        console.log(`${user.email}: ${user.error}`);
      }
    }

    console.log('\nMigration complete!');
    console.log('\nNOTE: Migrated users have temporary passwords and are in FORCE_CHANGE_PASSWORD status.');
    console.log('They will need to use the "Forgot Password" flow to set a new password.');

  } catch (error) {
    console.error('Migration error:', error);
  } finally {
    await pool.end();
  }
}

migrateUsers();
