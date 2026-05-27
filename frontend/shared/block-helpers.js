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
                danger: true
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
                danger: false
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
