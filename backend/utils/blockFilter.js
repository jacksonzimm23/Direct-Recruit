// Shared SQL fragment helpers for filtering blocked users + reported content
// out of list queries. Two helpers per concept to fit the two query styles
// used in this codebase:
//
//   1. Dynamic-paramCount style (PlayerProfile.search*, OtherProfile.discover,
//      etc. — query string built piece-by-piece, values array grows). Use
//      `blockedUserFilter()` / `reportedContentFilter()`.
//
//   2. Fixed-param-shape style (Post.getDiscoverFeed, Message.getUserConversations,
//      Follow.getFollowers, etc. — single big template literal, params hardcoded
//      as [userId, limit, offset] where $1 is always the viewer). Use
//      `blockedUserSubquery()` / `reportedContentSubquery()`.
//
// Both styles produce the same SQL semantics: a NOT IN (UNION of both block
// directions) subquery. Two-way blocks: if A blocked B OR B blocked A, both
// sides stop seeing each other.

// === Dynamic-param style ===

function blockedUserFilter(userIdCol, viewerUserId, currentParamCount) {
    return {
        sql: `${userIdCol} NOT IN (
            SELECT blocked_id FROM blocked_users WHERE blocker_id = $${currentParamCount}
            UNION
            SELECT blocker_id FROM blocked_users WHERE blocked_id = $${currentParamCount}
        )`,
        param: viewerUserId,
        nextIndex: currentParamCount + 1
    };
}

// content_type is hardcoded by the caller (never user-supplied) so direct
// string interpolation is safe. content_id is a SQL column reference, also
// caller-controlled.
function reportedContentFilter(contentType, contentIdCol, viewerUserId, currentParamCount) {
    return {
        sql: `NOT EXISTS (
            SELECT 1 FROM content_reports
            WHERE reporter_user_id = $${currentParamCount}
              AND content_type = '${contentType}'
              AND content_id = ${contentIdCol}
        )`,
        param: viewerUserId,
        nextIndex: currentParamCount + 1
    };
}

// === Fixed-param style ===

// Returns just the SQL string for the block-set subquery. Pass the param
// reference (e.g. '$1') that already points at the viewer in the outer query.
//
// Usage in a static template literal:
//   WHERE p.user_id NOT IN (${blockedUserSubquery('$1')})
function blockedUserSubquery(viewerParamRef) {
    return `SELECT blocked_id FROM blocked_users WHERE blocker_id = ${viewerParamRef}
            UNION
            SELECT blocker_id FROM blocked_users WHERE blocked_id = ${viewerParamRef}`;
}

// Same shape for content_reports. Use in WHERE NOT EXISTS (...) clauses.
function reportedContentSubquery(contentType, contentIdCol, viewerParamRef) {
    return `SELECT 1 FROM content_reports
            WHERE reporter_user_id = ${viewerParamRef}
              AND content_type = '${contentType}'
              AND content_id = ${contentIdCol}`;
}

module.exports = {
    blockedUserFilter,
    reportedContentFilter,
    blockedUserSubquery,
    reportedContentSubquery
};
