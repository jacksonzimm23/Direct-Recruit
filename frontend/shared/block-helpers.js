// Shared block / unblock confirm helpers — used by per-role my-profile.js.
// Each function shows a confirm modal, calls the API, toasts the result,
// and resolves boolean (true = action taken, false = cancelled / failed).

(function () {
    'use strict';

    window.confirmAndBlock = async function ({ userId, displayName }) {
        if (!userId) return false;
        const name = displayName || 'this user';
        // Lock background scroll while the confirm modal is open.
        const prevBodyOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        let confirmed;
        try {
            confirmed = await showConfirmModal({
                title: 'Block this user?',
                message: `Block ${name}? You will both unfollow each other, existing conversations will be hidden, and you will no longer see each other on the platform. You can unblock later in Settings.`,
                confirmText: 'Block',
                cancelText: 'Cancel',
                danger: true,
                icon: 'x'
            });
        } finally {
            document.body.style.overflow = prevBodyOverflow;
        }
        if (!confirmed) return false;
        try {
            await API.blocks.block(userId);
            showToast('User blocked.', 'success');
            return true;
        } catch (err) {
            const msg = (err && err.message) ? err.message : 'Failed to block user. Please try again.';
            showToast(msg, 'error');
            return false;
        }
    };

    /**
     * Used by the my-profile.js repost/quote menus (Fix #2d).
     * Resolves the post author's user_id + display name from the profile-post
     * card's data attributes and calls confirmAndBlock. On success, fades the
     * specific card from the DOM. Doesn't bulk-remove across the surface
     * (server-side filter handles next fetch).
     *
     * Profile-post cards should expose data-author-user-id on the article
     * element. Fall back to the .profile-post-author element's textContent
     * for the display name.
     */
    window.blockProfilePostAuthor = async function (postId, shareId) {
        // Close any open menus
        document.querySelectorAll('.repost-dropdown-menu, .profile-post-dropdown-menu').forEach(m => m.remove());

        // Find the card via data-share-id (more specific) or data-post-id
        const card = shareId
            ? document.querySelector(`.profile-post-card[data-share-id="${shareId}"]`)
            : document.querySelector(`.profile-post-card[data-post-id="${postId}"]`);
        const userId = card?.dataset.authorUserId;
        if (!userId) {
            showToast('Unable to identify user.', 'error');
            return;
        }
        const displayName =
            card?.querySelector('.profile-post-author')?.textContent?.trim()
            || card?.querySelector('.profile-post-name')?.textContent?.trim()
            || 'this user';
        const ok = await window.confirmAndBlock({ userId, displayName });
        if (!ok) return;
        // Fade the local card only
        if (card) {
            card.style.transition = 'opacity 300ms ease';
            card.style.opacity = '0';
            setTimeout(() => card.remove(), 300);
        }
    };

    window.confirmAndUnblock = async function ({ userId, displayName }) {
        if (!userId) return false;
        const name = displayName || 'this user';
        const prevBodyOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        let confirmed;
        try {
            confirmed = await showConfirmModal({
                title: 'Unblock this user?',
                message: `Unblock ${name}? They will be able to see your profile and posts again. Following relationship and conversation history will NOT be restored.`,
                confirmText: 'Unblock',
                cancelText: 'Cancel',
                danger: false,
                icon: 'check'
            });
        } finally {
            document.body.style.overflow = prevBodyOverflow;
        }
        if (!confirmed) return false;
        try {
            await API.blocks.unblock(userId);
            showToast('User unblocked.', 'success');
            return true;
        } catch (err) {
            const msg = (err && err.message) ? err.message : 'Failed to unblock user. Please try again.';
            showToast(msg, 'error');
            return false;
        }
    };
})();
