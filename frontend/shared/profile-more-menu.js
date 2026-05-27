// Shared three-dot (More) menu for the profile-page Follow/Message row.
// Used by every role's tabs/my-profile.js when viewing someone else's profile.
//
// Renders a dropdown with two items:
//   - Report Profile  -> opens shared openReportModal
//   - Block User / Unblock User  -> opens confirmAndBlock / confirmAndUnblock
//
// Block redirects the user to their role's mainpage afterward (the blocked
// profile is no longer visible). Unblock keeps them on the page.

(function () {
    'use strict';

    function _profileMoreMainpageUrl() {
        const path = window.location.pathname;
        if (path.includes('/hsplayer/')
            || path.includes('/collegeplayer/')
            || path.includes('/transferplayer/')) {
            return '../mainpage-player.html';
        }
        if (path.includes('/hscoach/') || path.includes('/collegecoach/')) {
            return '../mainpage-coach.html';
        }
        if (path.includes('/other/')) {
            return '../mainpage-other.html';
        }
        // Fallback: parent folder
        return '../';
    }

    function _injectStyles() {
        if (document.getElementById('profile-more-menu-styles')) return;
        const style = document.createElement('style');
        style.id = 'profile-more-menu-styles';
        style.textContent = `
            /* Desktop: matches btn-message/btn-back rectangular style */
            .btn-profile-more {
                background: rgba(255, 255, 255, 0.1);
                color: var(--white, #fff);
                border: 1px solid rgba(255, 255, 255, 0.2);
                padding: 0.85rem 1rem;
                border-radius: 8px;
                font-size: 0.95rem;
                font-weight: 700;
                cursor: pointer;
                transition: all 0.3s ease;
                font-family: 'Inter', sans-serif;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                line-height: 1;
            }
            .btn-profile-more:hover {
                background: rgba(255, 255, 255, 0.15);
                border-color: var(--cerulean, #1282a2);
                transform: translateY(-2px);
            }
            .btn-profile-more svg {
                width: 18px; height: 18px;
                display: block;
            }
            /* Mobile: lift the button out of the action row and pin it to the
               top-right of the profile header card so the Back/Follow/Message
               row can stay inline with the avatar without wrapping. */
            @media (max-width: 768px) {
                .profile-header-simple {
                    position: relative;
                }
                .btn-profile-more {
                    position: absolute;
                    /* Sit directly below the Pipeline / action-row buttons.
                       Action row is ~46px tall (30px button + ~16px padding-top
                       of .profile-actions in mobile), so 56px clears it with
                       an 8px gap. right:1rem matches .profile-header-simple
                       padding so the button aligns vertically with the
                       Pipeline button right edge. */
                    top: 56px;
                    right: 1rem;
                    width: 30px;
                    height: 30px;
                    padding: 0;
                    border-radius: 6px;
                    background: rgba(255, 255, 255, 0.08);
                    border: 1px solid rgba(255, 255, 255, 0.15);
                    z-index: 5;
                }
                .btn-profile-more svg {
                    width: 14px !important;
                    height: 14px !important;
                    flex-shrink: 0;
                }
                .btn-profile-more:hover {
                    transform: none;
                }
            }
            .profile-more-menu {
                position: fixed;
                background: #0a1128;
                border: 1px solid rgba(255,255,255,0.12);
                border-radius: 10px;
                padding: 6px;
                z-index: 10000;
                min-width: 200px;
                box-shadow: 0 8px 24px rgba(0,0,0,0.5);
                font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
            }
            .profile-more-menu .dropdown-item {
                display: flex; align-items: center; gap: 0.65rem;
                padding: 0.6rem 0.8rem; border-radius: 6px;
                color: rgba(255,255,255,0.92); font-size: 0.92rem;
                cursor: pointer; transition: background 0.12s;
            }
            .profile-more-menu .dropdown-item:hover {
                background: rgba(255,255,255,0.06);
            }
            .profile-more-menu .dropdown-item.dropdown-item-danger {
                color: #ff8a8a;
            }
            .profile-more-menu .dropdown-item.dropdown-item-danger:hover {
                background: rgba(255,107,107,0.1);
            }
            .profile-more-menu .dropdown-item svg {
                flex-shrink: 0;
            }
        `;
        document.head.appendChild(style);
    }

    /**
     * Wire up the three-dot button on a profile page.
     * Call this after the button is in the DOM. The profile object should
     * have at minimum: user_id, first_name, last_name.
     */
    window.setupProfileMoreMenu = function (profile) {
        if (!profile || !profile.user_id) return;
        const btn = document.getElementById('profileMoreBtn');
        if (!btn) return;
        _injectStyles();

        btn.addEventListener('click', async (e) => {
            e.stopPropagation();

            // Toggle off if already open
            const existing = document.querySelector('.profile-more-menu');
            if (existing) { existing.remove(); return; }

            // Lazy block-status check
            let blockState;
            try {
                blockState = await API.blocks.check(profile.user_id);
            } catch (err) {
                showToast('Failed to load options. Please try again.', 'error');
                return;
            }
            const displayName = `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || 'this user';
            const iBlocked = !!(blockState && blockState.i_blocked_them);

            const menu = document.createElement('div');
            menu.className = 'profile-more-menu';
            menu.innerHTML = `
                <div class="dropdown-item" data-action="report">
                    <svg viewBox="0 0 24 24" fill="none" stroke="#1282a2" stroke-width="2" width="18" height="18">
                        <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path>
                        <line x1="4" y1="22" x2="4" y2="15"></line>
                    </svg>
                    <span>Report Profile</span>
                </div>
                <div class="dropdown-item dropdown-item-danger" data-action="${iBlocked ? 'unblock' : 'block'}">
                    <svg viewBox="0 0 24 24" fill="none" stroke="#ff8a8a" stroke-width="2" width="18" height="18">
                        <circle cx="12" cy="12" r="10"></circle>
                        <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line>
                    </svg>
                    <span>${iBlocked ? 'Unblock User' : 'Block User'}</span>
                </div>
            `;
            document.body.appendChild(menu);

            // Position next to the button
            const rect = btn.getBoundingClientRect();
            menu.style.top = (rect.bottom + 6) + 'px';
            menu.style.right = (window.innerWidth - rect.right) + 'px';

            // Wire up item clicks BEFORE the outside-click handler (avoid swallow race)
            menu.querySelectorAll('.dropdown-item').forEach(item => {
                item.addEventListener('click', async (ev) => {
                    ev.stopPropagation();
                    const action = item.dataset.action;
                    menu.remove();
                    if (action === 'report') {
                        if (typeof window.openReportModal !== 'function') {
                            showToast('Report unavailable. Please refresh and try again.', 'error');
                            return;
                        }
                        await window.openReportModal({
                            contentType: 'profile',
                            reportedUserId: profile.user_id,
                            contentLabel: 'Profile'
                        });
                    } else if (action === 'block') {
                        if (typeof window.confirmAndBlock !== 'function') {
                            showToast('Block unavailable. Please refresh and try again.', 'error');
                            return;
                        }
                        const ok = await window.confirmAndBlock({ userId: profile.user_id, displayName });
                        if (ok) {
                            window.location.href = _profileMoreMainpageUrl();
                        }
                    } else if (action === 'unblock') {
                        if (typeof window.confirmAndUnblock !== 'function') {
                            showToast('Unblock unavailable. Please refresh and try again.', 'error');
                            return;
                        }
                        await window.confirmAndUnblock({ userId: profile.user_id, displayName });
                        // Stay on page — unblock takes effect immediately.
                    }
                });
            });

            // Defer the outside-click listener so it doesn't fire on the same
            // click that opened the menu (matches feed.js showQuotePostMenu pattern).
            setTimeout(() => {
                function closeMenu() {
                    menu.remove();
                    document.removeEventListener('click', closeMenu);
                    window.removeEventListener('scroll', closeMenu, true);
                }
                document.addEventListener('click', closeMenu);
                window.addEventListener('scroll', closeMenu, true);
            }, 0);
        });
    };
})();
