// One-shot: reset password for test coach. Delete after use.
const bcrypt = require('bcrypt');
const pool = require('../config/database');
(async () => {
  try {
    const hash = await bcrypt.hash('Test123!@#', 10);
    const r = await pool.query(
      'UPDATE users SET password_hash = $1 WHERE email = $2 RETURNING id, email',
      [hash, 'collegecoach@test.com']
    );
    console.log('Reset rows:', r.rowCount, r.rows);
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await pool.end();
  }
})();
