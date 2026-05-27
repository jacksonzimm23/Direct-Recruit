// Settings → Blocked Users section renderer (Fix #2d).
// Lazily fetches API.blocks.list() and renders rows with role-specific
// subheaders + an Unblock button. Reuses window.buildCommentSubheader for
// the subheader format and window.confirmAndUnblock for the action.

(function () {
    'use strict';

    function injectStyles() {
        if (document.getElementById('blocked-users-section-styles')) return;
        const style = document.createElement('style');
        style.id = 'blocked-users-section-styles';
        style.textContent = `
            .blocked-users-list {
                display: flex; flex-direction: column;
                gap: 0.5rem;
            }
            .blocked-users-empty {
                color: rgba(255,255,255,0.55);
                font-size: 0.95rem;
                padding: 1.5rem 0.5rem;
                text-align: center;
            }
            .blocked-users-error {
                color: #ff8a8a;
                font-size: 0.9rem;
                padding: 0.75rem;
            }
            .blocked-user-row {
                display: flex; align-items: center; gap: 0.85rem;
                padding: 0.75rem 0.85rem;
                background: rgba(255,255,255,0.03);
                border: 1px solid rgba(255,255,255,0.08);
                border-radius: 10px;
                transition: background 0.15s;
            }
            .blocked-user-row:hover {
                background: rgba(255,255,255,0.05);
            }
            .blocked-user-avatar {
                width: 44px; height: 44px;
                border-radius: 50%;
                flex-shrink: 0;
                display: flex; align-items: center; justify-content: center;
                overflow: hidden;
            }
            .blocked-user-avatar img {
                width: 100%; height: 100%;
                object-fit: cover;
                display: block;
            }
            .blocked-user-avatar svg {
                width: 22px; height: 22px;
            }
            .blocked-user-info {
                flex: 1; min-width: 0;
                display: flex; flex-direction: column; gap: 2px;
            }
            .blocked-user-name {
                color: #fff;
                font-weight: 600;
                font-size: 0.95rem;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }
            .blocked-user-handle {
                color: rgba(255,255,255,0.45);
                font-size: 0.78rem;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }
            .blocked-user-subheader {
                margin-top: 1px;
            }
            .blocked-user-unblock-btn {
                background: rgba(255, 255, 255, 0.1);
                color: #fff;
                border: 1px solid rgba(255, 255, 255, 0.2);
                padding: 0.5rem 1rem;
                border-radius: 8px;
                font-size: 0.85rem;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.2s;
                font-family: 'Inter', sans-serif;
                flex-shrink: 0;
            }
            .blocked-user-unblock-btn:hover {
                background: rgba(255, 107, 107, 0.15);
                border-color: #ff8a8a;
                color: #ff8a8a;
            }
            .blocked-user-unblock-btn:disabled {
                opacity: 0.5;
                cursor: not-allowed;
            }
            @media (max-width: 768px) {
                .blocked-user-row {
                    padding: 0.65rem 0.6rem;
                    gap: 0.6rem;
                }
                .blocked-user-avatar {
                    width: 38px; height: 38px;
                }
                .blocked-user-name { font-size: 0.9rem; }
                .blocked-user-unblock-btn {
                    padding: 0.4rem 0.75rem;
                    font-size: 0.8rem;
                }
            }
        `;
        document.head.appendChild(style);
    }

    function escapeHtml(text) {
        if (text == null) return '';
        const div = document.createElement('div');
        div.textContent = String(text);
        return div.innerHTML;
    }

    function renderEmpty(container) {
        container.innerHTML = '<div class="blocked-users-empty">You haven’t blocked anyone.</div>';
    }

    function renderRow(block) {
        const fullName = `${block.first_name || ''} ${block.last_name || ''}`.trim() || 'Unknown user';
        const handle = block.username ? `@${block.username}` : '';
        const borderColor = (typeof window.getRoleBorderColor === 'function')
            ? window.getRoleBorderColor(block.role, block.transfer, block.division)
            : '#1282a2';
        const bgColor = (typeof window.getRoleAvatarBg === 'function')
            ? window.getRoleAvatarBg(block.role, block.transfer, block.division)
            : 'rgba(18,130,162,0.2)';

        const avatarInner = block.profile_image_url
            ? `<img src="${escapeHtml(block.profile_image_url)}" alt="">`
            : `<svg viewBox="0 0 24 24" fill="${borderColor}"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>`;

        const subheaderHtml = (typeof window.buildCommentSubheader === 'function')
            ? window.buildCommentSubheader(block.role, block) || ''
            : '';

        return `
            <div class="blocked-user-row" data-user-id="${escapeHtml(block.user_id)}">
                <div class="blocked-user-avatar" style="border: 2px solid ${borderColor}; background: ${bgColor};">
                    ${avatarInner}
                </div>
                <div class="blocked-user-info">
                    <div class="blocked-user-name">${escapeHtml(fullName)}</div>
                    ${handle ? `<div class="blocked-user-handle">${escapeHtml(handle)}</div>` : ''}
                    ${subheaderHtml ? `<div class="blocked-user-subheader">${subheaderHtml}</div>` : ''}
                </div>
                <button class="blocked-user-unblock-btn" type="button"
                        data-user-id="${escapeHtml(block.user_id)}"
                        data-display-name="${escapeHtml(fullName)}">
                    Unblock
                </button>
            </div>
        `;
    }

    function wireUnblockButtons(container) {
        container.querySelectorAll('.blocked-user-unblock-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                if (typeof window.confirmAndUnblock !== 'function') {
                    if (typeof window.showToast === 'function') {
                        window.showToast('Unblock unavailable. Please refresh and try again.', 'error');
                    }
                    return;
                }
                btn.disabled = true;
                const userId = btn.dataset.userId;
                const displayName = btn.dataset.displayName;
                const ok = await window.confirmAndUnblock({ userId, displayName });
                if (!ok) {
                    btn.disabled = false;
                    return;
                }
                // Fade and remove the row
                const row = btn.closest('.blocked-user-row');
                if (row) {
                    row.style.transition = 'opacity 250ms ease, max-height 350ms ease, padding 350ms ease, margin 350ms ease';
                    row.style.opacity = '0';
                    setTimeout(() => {
                        row.remove();
                        // If list is now empty, show empty state
                        if (!container.querySelector('.blocked-user-row')) {
                            renderEmpty(container);
                        }
                    }, 300);
                }
            });
        });
    }

    /**
     * Initialize / refresh the Blocked Users section content.
     * Idempotent — safe to call multiple times (e.g. when user re-enters the
     * section in Settings).
     */
    window.initializeBlockedUsersSection = async function () {
        injectStyles();
        const container = document.getElementById('blockedUsersContent');
        if (!container) return;
        container.innerHTML = '<div class="blocked-users-empty">Loading…</div>';

        try {
            const resp = await API.blocks.list();
            const blocks = (resp && Array.isArray(resp.blocks)) ? resp.blocks : [];
            if (blocks.length === 0) {
                renderEmpty(container);
                return;
            }
            container.innerHTML = `<div class="blocked-users-list">${blocks.map(renderRow).join('')}</div>`;
            wireUnblockButtons(container);
        } catch (err) {
            console.error('Failed to load blocked users:', err);
            container.innerHTML = '<div class="blocked-users-error">Failed to load blocked users. Please try again.</div>';
        }
    };
})();
