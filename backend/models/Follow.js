const pool = require('../config/database');

class Follow {
  // Check if a user has a private profile
  static async isPrivateProfile(userId) {

    // Check player_profiles first
    let result = await pool.query(
      'SELECT profile_visibility FROM player_profiles WHERE user_id = $1',
      [userId]
    );

    if (result.rows.length > 0) {
      return result.rows[0].profile_visibility === 'private';
    }

    // Check coach_profiles
    result = await pool.query(
      'SELECT profile_visibility FROM coach_profiles WHERE user_id = $1',
      [userId]
    );

    if (result.rows.length > 0) {
      return result.rows[0].profile_visibility === 'private';
    }

    // Check other_profiles
    result = await pool.query(
      'SELECT profile_visibility FROM other_profiles WHERE user_id = $1',
      [userId]
    );

    if (result.rows.length > 0) {
      return result.rows[0].profile_visibility === 'private';
    }

    // Default to public if no profile found
    return false;
  }

  // Get profile visibility for a user
  static async getProfileVisibility(userId) {
    // Check player_profiles first
    let result = await pool.query(
      'SELECT profile_visibility FROM player_profiles WHERE user_id = $1',
      [userId]
    );

    if (result.rows.length > 0) {
      return result.rows[0].profile_visibility || 'everyone';
    }

    // Check coach_profiles
    result = await pool.query(
      'SELECT profile_visibility FROM coach_profiles WHERE user_id = $1',
      [userId]
    );

    if (result.rows.length > 0) {
      return result.rows[0].profile_visibility || 'everyone';
    }

    // Check other_profiles
    result = await pool.query(
      'SELECT profile_visibility FROM other_profiles WHERE user_id = $1',
      [userId]
    );

    if (result.rows.length > 0) {
      return result.rows[0].profile_visibility || 'everyone';
    }

    return 'everyone';
  }

  // Send a follow request (for private accounts)
  static async sendFollowRequest(requesterId, targetId) {
    const result = await pool.query(
      `INSERT INTO follow_requests (requester_id, target_id, status)
       VALUES ($1, $2, 'pending')
       ON CONFLICT (requester_id, target_id) DO UPDATE SET status = 'pending', updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [requesterId, targetId]
    );
    return result.rows[0];
  }

  // Check if there's a pending follow request
  static async hasPendingFollowRequest(requesterId, targetId) {
    const result = await pool.query(
      `SELECT 1 FROM follow_requests
       WHERE requester_id = $1 AND target_id = $2 AND status = 'pending'`,
      [requesterId, targetId]
    );
    return result.rows.length > 0;
  }

  // Get follow request by requester and target
  static async getFollowRequest(requesterId, targetId) {
    const result = await pool.query(
      `SELECT * FROM follow_requests
       WHERE requester_id = $1 AND target_id = $2`,
      [requesterId, targetId]
    );
    return result.rows[0];
  }

  // Accept a follow request
  static async acceptFollowRequest(requestId) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Get the request details
      const requestResult = await client.query(
        'SELECT * FROM follow_requests WHERE id = $1 AND status = $2',
        [requestId, 'pending']
      );

      if (requestResult.rows.length === 0) {
        throw new Error('Follow request not found or already processed');
      }

      const request = requestResult.rows[0];

      // Update request status to accepted
      await client.query(
        `UPDATE follow_requests SET status = 'accepted', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [requestId]
      );

      // Create the actual follow relationship
      await client.query(
        'INSERT INTO follows (follower_id, following_id) VALUES ($1, $2)',
        [request.requester_id, request.target_id]
      );

      // Update following_count for the follower
      await client.query(
        'UPDATE player_profiles SET following_count = following_count + 1 WHERE user_id = $1',
        [request.requester_id]
      );
      await client.query(
        'UPDATE coach_profiles SET following_count = following_count + 1 WHERE user_id = $1',
        [request.requester_id]
      );
      await client.query(
        'UPDATE other_profiles SET following_count = following_count + 1 WHERE user_id = $1',
        [request.requester_id]
      );

      // Update followers_count for the target
      await client.query(
        'UPDATE player_profiles SET followers_count = followers_count + 1 WHERE user_id = $1',
        [request.target_id]
      );
      await client.query(
        'UPDATE coach_profiles SET followers_count = followers_count + 1 WHERE user_id = $1',
        [request.target_id]
      );
      await client.query(
        'UPDATE other_profiles SET followers_count = followers_count + 1 WHERE user_id = $1',
        [request.target_id]
      );

      await client.query('COMMIT');
      return request;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // Decline a follow request
  static async declineFollowRequest(requestId) {
    const result = await pool.query(
      `UPDATE follow_requests SET status = 'declined', updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND status = 'pending' RETURNING *`,
      [requestId]
    );
    return result.rows[0];
  }

  // Cancel an outgoing follow request
  static async cancelFollowRequest(requesterId, targetId) {
    const result = await pool.query(
      `DELETE FROM follow_requests
       WHERE requester_id = $1 AND target_id = $2 AND status = 'pending'
       RETURNING *`,
      [requesterId, targetId]
    );
    return result.rows[0];
  }

  // Get incoming follow requests (requests others have sent to the user)
  static async getIncomingFollowRequests(userId, limit = 50, offset = 0) {
    const result = await pool.query(
      `SELECT fr.*,
              u.email, u.role,
              COALESCE(pp.first_name, cp.first_name, op.first_name) as first_name,
              COALESCE(pp.last_name, cp.last_name, op.last_name) as last_name,
              COALESCE(pp.username, cp.username, op.username) as username,
              COALESCE(pp.profile_image_url, cp.profile_image_url, op.profile_picture_url) as profile_image_url,
              pp.position, pp.team_name as player_team,
              cp.team_name as coach_team, cp.position_title
       FROM follow_requests fr
       JOIN users u ON fr.requester_id = u.id
       LEFT JOIN player_profiles pp ON u.id = pp.user_id
       LEFT JOIN coach_profiles cp ON u.id = cp.user_id
       LEFT JOIN other_profiles op ON u.id = op.user_id
       WHERE fr.target_id = $1 AND fr.status = 'pending'
       ORDER BY fr.created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );
    return result.rows;
  }

  // Get outgoing follow requests (requests the user has sent)
  static async getOutgoingFollowRequests(userId, limit = 50, offset = 0) {
    const result = await pool.query(
      `SELECT fr.*,
              u.email, u.role,
              COALESCE(pp.first_name, cp.first_name, op.first_name) as first_name,
              COALESCE(pp.last_name, cp.last_name, op.last_name) as last_name,
              COALESCE(pp.username, cp.username, op.username) as username,
              COALESCE(pp.profile_image_url, cp.profile_image_url, op.profile_picture_url) as profile_image_url
       FROM follow_requests fr
       JOIN users u ON fr.target_id = u.id
       LEFT JOIN player_profiles pp ON u.id = pp.user_id
       LEFT JOIN coach_profiles cp ON u.id = cp.user_id
       LEFT JOIN other_profiles op ON u.id = op.user_id
       WHERE fr.requester_id = $1 AND fr.status = 'pending'
       ORDER BY fr.created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );
    return result.rows;
  }

  // Count pending incoming follow requests
  static async countPendingFollowRequests(userId) {
    const result = await pool.query(
      `SELECT COUNT(*) as count FROM follow_requests WHERE target_id = $1 AND status = 'pending'`,
      [userId]
    );
    return parseInt(result.rows[0].count) || 0;
  }

  // Get follow request by ID
  static async getFollowRequestById(requestId) {
    const result = await pool.query(
      'SELECT * FROM follow_requests WHERE id = $1',
      [requestId]
    );
    return result.rows[0];
  }

  // Get pending follow request by requester and target user IDs
  static async getPendingRequestByUsers(requesterId, targetId) {
    const result = await pool.query(
      `SELECT * FROM follow_requests WHERE requester_id = $1 AND target_id = $2 AND status = 'pending'`,
      [requesterId, targetId]
    );
    return result.rows[0];
  }

  static async follow(followerId, followingId) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const result = await client.query(
        'INSERT INTO follows (follower_id, following_id) VALUES ($1, $2) RETURNING *',
        [followerId, followingId]
      );

      // Update following_count for the follower (in player, coach, and other profiles)
      await client.query(
        'UPDATE player_profiles SET following_count = following_count + 1 WHERE user_id = $1',
        [followerId]
      );
      await client.query(
        'UPDATE coach_profiles SET following_count = following_count + 1 WHERE user_id = $1',
        [followerId]
      );
      await client.query(
        'UPDATE other_profiles SET following_count = following_count + 1 WHERE user_id = $1',
        [followerId]
      );

      // Update followers_count for the user being followed (in player, coach, and other profiles)
      await client.query(
        'UPDATE player_profiles SET followers_count = followers_count + 1 WHERE user_id = $1',
        [followingId]
      );
      await client.query(
        'UPDATE coach_profiles SET followers_count = followers_count + 1 WHERE user_id = $1',
        [followingId]
      );
      await client.query(
        'UPDATE other_profiles SET followers_count = followers_count + 1 WHERE user_id = $1',
        [followingId]
      );

      await client.query('COMMIT');
      return result.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  static async unfollow(followerId, followingId) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const result = await client.query(
        'DELETE FROM follows WHERE follower_id = $1 AND following_id = $2 RETURNING *',
        [followerId, followingId]
      );

      // Only update counts if a row was actually deleted
      if (result.rows.length > 0) {
        // Decrement following_count for the follower (in player, coach, and other profiles)
        await client.query(
          'UPDATE player_profiles SET following_count = GREATEST(following_count - 1, 0) WHERE user_id = $1',
          [followerId]
        );
        await client.query(
          'UPDATE coach_profiles SET following_count = GREATEST(following_count - 1, 0) WHERE user_id = $1',
          [followerId]
        );
        await client.query(
          'UPDATE other_profiles SET following_count = GREATEST(following_count - 1, 0) WHERE user_id = $1',
          [followerId]
        );

        // Decrement followers_count for the user being unfollowed (in player, coach, and other profiles)
        await client.query(
          'UPDATE player_profiles SET followers_count = GREATEST(followers_count - 1, 0) WHERE user_id = $1',
          [followingId]
        );
        await client.query(
          'UPDATE coach_profiles SET followers_count = GREATEST(followers_count - 1, 0) WHERE user_id = $1',
          [followingId]
        );
        await client.query(
          'UPDATE other_profiles SET followers_count = GREATEST(followers_count - 1, 0) WHERE user_id = $1',
          [followingId]
        );
      }

      await client.query('COMMIT');
      return result.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  static async getFollowers(userId, limit = 50, offset = 0) {
    const result = await pool.query(
      `SELECT u.id, u.email, u.role,
              COALESCE(pp.first_name, cp.first_name, op.first_name) as first_name,
              COALESCE(pp.last_name, cp.last_name, op.last_name) as last_name,
              COALESCE(pp.profile_image_url, cp.profile_image_url, op.profile_picture_url) as profile_image_url,
              f.created_at as followed_at,
              pp.position as player_position,
              pp.height as player_height,
              pp.weight as player_weight,
              pp.graduation_year,
              pp.team_name as player_team_name,
              pp.state as player_state,
              pp.college_division as player_college_division,
              pp.transfer as is_transfer,
              pp.eligibility as years_of_eligibility,
              cp.position_title as coach_position_title,
              cp.team_name as coach_team_name,
              cp.state as coach_state,
              cp.college_division as coach_college_division,
              op.subheader as other_subheader
       FROM follows f
       JOIN users u ON f.follower_id = u.id
       LEFT JOIN player_profiles pp ON u.id = pp.user_id
       LEFT JOIN coach_profiles cp ON u.id = cp.user_id
       LEFT JOIN other_profiles op ON u.id = op.user_id
       WHERE f.following_id = $1
       ORDER BY f.created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );
    return result.rows;
  }

  static async getFollowing(userId, limit = 50, offset = 0) {
    const result = await pool.query(
      `SELECT u.id, u.email, u.role,
              COALESCE(pp.first_name, cp.first_name, op.first_name) as first_name,
              COALESCE(pp.last_name, cp.last_name, op.last_name) as last_name,
              COALESCE(pp.profile_image_url, cp.profile_image_url, op.profile_picture_url) as profile_image_url,
              f.created_at as followed_at,
              pp.position as player_position,
              pp.height as player_height,
              pp.weight as player_weight,
              pp.graduation_year,
              pp.team_name as player_team_name,
              pp.state as player_state,
              pp.college_division as player_college_division,
              pp.transfer as is_transfer,
              pp.eligibility as years_of_eligibility,
              cp.position_title as coach_position_title,
              cp.team_name as coach_team_name,
              cp.state as coach_state,
              cp.college_division as coach_college_division,
              op.subheader as other_subheader
       FROM follows f
       JOIN users u ON f.following_id = u.id
       LEFT JOIN player_profiles pp ON u.id = pp.user_id
       LEFT JOIN coach_profiles cp ON u.id = cp.user_id
       LEFT JOIN other_profiles op ON u.id = op.user_id
       WHERE f.follower_id = $1
       ORDER BY f.created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );
    return result.rows;
  }

  static async isFollowing(followerId, followingId) {
    const result = await pool.query(
      'SELECT 1 FROM follows WHERE follower_id = $1 AND following_id = $2',
      [followerId, followingId]
    );
    return result.rows.length > 0;
  }

  static async getFollowCounts(userId) {
    // Try to get counts from player_profiles first
    let result = await pool.query(
      'SELECT followers_count, following_count FROM player_profiles WHERE user_id = $1',
      [userId]
    );

    // If not found in player_profiles, try coach_profiles
    if (result.rows.length === 0) {
      result = await pool.query(
        'SELECT followers_count, following_count FROM coach_profiles WHERE user_id = $1',
        [userId]
      );
    }

    // If not found in coach_profiles, try other_profiles
    if (result.rows.length === 0) {
      try {
        result = await pool.query(
          'SELECT followers_count, following_count FROM other_profiles WHERE user_id = $1',
          [userId]
        );
      } catch (error) {
        // If columns don't exist, fall back to counting from follows table
        if (error.code === '42703') { // undefined_column error
          const followersResult = await pool.query(
            'SELECT COUNT(*) as count FROM follows WHERE following_id = $1',
            [userId]
          );
          const followingResult = await pool.query(
            'SELECT COUNT(*) as count FROM follows WHERE follower_id = $1',
            [userId]
          );
          return {
            followers_count: parseInt(followersResult.rows[0].count) || 0,
            following_count: parseInt(followingResult.rows[0].count) || 0
          };
        }
        throw error;
      }
    }

    // Return the counts or default to 0
    if (result.rows.length > 0) {
      return {
        followers_count: parseInt(result.rows[0].followers_count) || 0,
        following_count: parseInt(result.rows[0].following_count) || 0
      };
    }

    // If no profile found at all, count from follows table
    const followersResult = await pool.query(
      'SELECT COUNT(*) as count FROM follows WHERE following_id = $1',
      [userId]
    );
    const followingResult = await pool.query(
      'SELECT COUNT(*) as count FROM follows WHERE follower_id = $1',
      [userId]
    );
    return {
      followers_count: parseInt(followersResult.rows[0].count) || 0,
      following_count: parseInt(followingResult.rows[0].count) || 0
    };
  }

  // Get message permissions for a user
  static async getMessagePermissions(userId) {
    // Check player_profiles first
    let result = await pool.query(
      'SELECT message_permissions FROM player_profiles WHERE user_id = $1',
      [userId]
    );

    if (result.rows.length > 0) {
      return result.rows[0].message_permissions || 'everyone';
    }

    // Check coach_profiles
    result = await pool.query(
      'SELECT message_permissions FROM coach_profiles WHERE user_id = $1',
      [userId]
    );

    if (result.rows.length > 0) {
      return result.rows[0].message_permissions || 'everyone';
    }

    // Check other_profiles
    result = await pool.query(
      'SELECT message_permissions FROM other_profiles WHERE user_id = $1',
      [userId]
    );

    if (result.rows.length > 0) {
      return result.rows[0].message_permissions || 'everyone';
    }

    return 'everyone';
  }

  // Check if a user can message another user based on message permissions
  // Returns: { canMessage: boolean, reason: string }
  static async canMessage(senderId, recipientId) {
    // Can always message yourself (edge case)
    if (senderId === recipientId) {
      return { canMessage: false, reason: 'cannot_message_self' };
    }

    // Get recipient's message permissions
    const messagePermissions = await this.getMessagePermissions(recipientId);

    switch (messagePermissions) {
      case 'everyone':
        return { canMessage: true, reason: 'everyone' };

      case 'followers':
        // Check if sender is following the recipient
        const isFollowing = await this.isFollowing(senderId, recipientId);
        if (isFollowing) {
          return { canMessage: true, reason: 'follower' };
        }
        return { canMessage: false, reason: 'followers_only' };

      case 'none':
        return { canMessage: false, reason: 'no_messages' };

      default:
        // Default to everyone if unknown value
        return { canMessage: true, reason: 'default' };
    }
  }
}

module.exports = Follow;
