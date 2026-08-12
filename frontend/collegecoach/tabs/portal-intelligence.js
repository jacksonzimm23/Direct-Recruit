// Portal Intelligence - AI Chat for Transfer Portal Predictions

document.addEventListener('DOMContentLoaded', function() {

    // ========================
    // SUBTAB SWITCHING
    // ========================

    const subtabs = document.querySelectorAll('.tp-subtab');
    const tabContents = {
        'current-portal': document.getElementById('currentPortalTab'),
        'portal-intelligence': document.getElementById('portalIntelligenceTab')
    };

    subtabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const targetTab = tab.dataset.tab;

            subtabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            Object.entries(tabContents).forEach(([key, content]) => {
                if (content) {
                    if (key === targetTab) {
                        content.classList.add('active');
                    } else {
                        content.classList.remove('active');
                    }
                }
            });

            sessionStorage.setItem('tpActiveTab', targetTab);
        });
    });

    const savedTab = sessionStorage.getItem('tpActiveTab');
    if (savedTab && tabContents[savedTab]) {
        const targetBtn = document.querySelector(`.tp-subtab[data-tab="${savedTab}"]`);
        if (targetBtn) targetBtn.click();
    }

    // ========================
    // PORTAL INTELLIGENCE CHAT
    // ========================

    const messagesContainer = document.getElementById('piMessages');
    const welcome = document.getElementById('piWelcome');
    const input = document.getElementById('piInput');
    const sendBtn = document.getElementById('piSendBtn');
    const historyList = document.getElementById('piHistoryList');
    const newChatBtn = document.getElementById('piNewChatBtn');
    const suggestions = document.querySelectorAll('.pi-suggestion');

    if (!messagesContainer || !input) return;

    // Shorten placeholder on mobile to prevent text wrapping in textarea
    if (window.innerWidth <= 768 && input) {
        input.placeholder = 'Ask about portal predictions...';
    }

    let chats = [];
    let activeChatId = null;
    let isSending = false;
    let watchlistCount = 0;
    let longPressTriggered = false;
    let lastSignalFilters = null;
    let currentSearchOffset = 0;

    const SHOW_MORE_PATTERN = /^(show\s*(me\s*)?more|more\s*players?|next\s*(5|players?|results?|batch)?|load\s*more|keep\s*going|any\s*more|see\s*more)/i;

    // Watchlist DOM elements
    const watchlistBtn = document.getElementById('piWatchlistBtn');
    const watchlistCountEl = document.getElementById('piWatchlistCount');
    const watchlistOverlay = document.getElementById('piWatchlistOverlay');
    const watchlistBody = document.getElementById('piWatchlistBody');
    const watchlistCloseBtn = document.getElementById('piWatchlistCloseBtn');
    const watchlistClearAll = document.getElementById('piWatchlistClearAll');
    const watchlistHeaderCount = document.getElementById('piWatchlistHeaderCount');

    // ========================
    // API-BACKED CHAT STORAGE
    // ========================

    async function loadChats() {
        try {
            const data = await API.ai.getChats('portal_intelligence');
            chats = data.chats || [];
            renderHistory();
        } catch (e) {
            console.error('Failed to load PI chats:', e);
            chats = [];
            renderHistory();
        }
    }

    async function createNewChat() {
        try {
            const data = await API.ai.createChat('portal_intelligence');
            const chat = data.chat;
            chats.unshift(chat);
            activeChatId = chat.id;
            messagesContainer.querySelectorAll('.pi-msg, .pi-typing, .pi-player-cards').forEach(el => el.remove());
            if (welcome) welcome.style.display = '';
            renderHistory();
            input.focus();
            return chat;
        } catch (e) {
            console.error('Failed to create PI chat:', e);
            return null;
        }
    }

    async function deleteChat(chatId) {
        try {
            await API.ai.deleteChat(chatId);
            chats = chats.filter(c => c.id !== chatId);
            if (activeChatId === chatId) {
                activeChatId = chats.length > 0 ? chats[0].id : null;
                if (activeChatId) {
                    await selectChat(activeChatId);
                } else {
                    messagesContainer.querySelectorAll('.pi-msg, .pi-typing, .pi-player-cards').forEach(el => el.remove());
                    if (welcome) welcome.style.display = '';
                }
            }
            renderHistory();
        } catch (e) {
            console.error('Failed to delete PI chat:', e);
        }
    }

    async function selectChat(chatId) {
        activeChatId = chatId;
        lastSignalFilters = null;
        currentSearchOffset = 0;
        renderHistory();

        try {
            const data = await API.ai.getChat(chatId);
            const chat = data.chat;

            messagesContainer.querySelectorAll('.pi-msg, .pi-typing, .pi-player-cards').forEach(el => el.remove());

            if (!chat.messages || chat.messages.length === 0) {
                if (welcome) welcome.style.display = '';
                return;
            }

            if (welcome) welcome.style.display = 'none';

            chat.messages.forEach(msg => {
                const div = document.createElement('div');
                div.className = `pi-msg ${msg.role}`;
                div.textContent = msg.content;
                messagesContainer.appendChild(div);

                // Render player cards from metadata if present
                if (msg.role === 'assistant' && msg.metadata && msg.metadata.players && msg.metadata.players.length > 0) {
                    // Track filters and offset for "show more" continuity
                    if (msg.metadata.signal_filters) {
                        lastSignalFilters = msg.metadata.signal_filters;
                        currentSearchOffset = msg.metadata.offset || 0;
                    }

                    const cardsContainer = document.createElement('div');
                    cardsContainer.className = 'pi-player-cards';
                    msg.metadata.players.forEach(player => {
                        cardsContainer.appendChild(createPlayerCard(player));
                    });
                    messagesContainer.appendChild(cardsContainer);
                }
            });

            // Batch check flag states for all rendered player cards
            batchCheckFlags(messagesContainer);

            const savedScroll = sessionStorage.getItem('piScrollPosition');
            if (savedScroll !== null) {
                messagesContainer.scrollTop = parseInt(savedScroll);
                sessionStorage.removeItem('piScrollPosition');
            } else {
                scrollToBottom();
            }
        } catch (e) {
            console.error('Failed to load PI chat:', e);
        }
    }

    // ========================
    // RENDERING
    // ========================

    function renderHistory() {
        if (!historyList) return;

        if (chats.length === 0) {
            historyList.innerHTML = `
                <div class="pi-history-empty">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M12 2a4 4 0 0 1 4 4c0 1.95-1.4 3.57-3.25 3.92L12 22"></path>
                        <path d="M12 2a4 4 0 0 0-4 4c0 1.95 1.4 3.57 3.25 3.92"></path>
                    </svg>
                    <span>No conversations yet</span>
                    <button class="pi-history-empty-new-chat" onclick="document.getElementById('piNewChatBtn').click()">Start New Chat</button>
                </div>
            `;
            return;
        }

        historyList.innerHTML = chats.map(chat => {
            const timeStr = formatTimeAgo(chat.created_at);
            const isActive = chat.id === activeChatId;
            return `
                <div class="pi-history-item ${isActive ? 'active' : ''}" data-chat-id="${chat.id}">
                    <div class="pi-history-item-icon">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M12 2a4 4 0 0 1 4 4c0 1.95-1.4 3.57-3.25 3.92L12 22"></path>
                            <path d="M12 2a4 4 0 0 0-4 4c0 1.95 1.4 3.57 3.25 3.92"></path>
                        </svg>
                    </div>
                    <div class="pi-history-item-info">
                        <div class="pi-history-item-title">${escapeHtml(chat.title)}</div>
                        <div class="pi-history-item-time">${timeStr}</div>
                    </div>
                    <button class="pi-history-item-delete" data-delete-id="${chat.id}" title="Delete chat">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                </div>
            `;
        }).join('');

        historyList.querySelectorAll('.pi-history-item').forEach(item => {
            item.addEventListener('click', (e) => {
                if (e.target.closest('.pi-history-item-delete')) return;
                if (longPressTriggered) { longPressTriggered = false; return; }
                selectChat(item.dataset.chatId);
                if (window.innerWidth <= 768 && typeof closeMobileHistoryPanel === 'function') closeMobileHistoryPanel();
            });
        });

        historyList.querySelectorAll('.pi-history-item-delete').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                deleteChat(btn.dataset.deleteId);
            });
        });
    }

    // iOS app only. The input area is position:fixed on iOS (ios-app-overrides.css),
    // so it no longer takes flex space and the message list runs underneath it and
    // the 76px bottom nav. The list reserves that covered height via padding-bottom
    // calc(76px + var(--ai-input-h)), so the measured height has to be published
    // here — and re-published whenever the textarea auto-grows. No-op on desktop.
    const isIOSApp = document.documentElement.classList.contains('ios-app');

    function syncInputHeightVar() {
        if (!isIOSApp) return;
        const area = document.querySelector('.pi-input-area');
        if (!area) return;
        const h = area.offsetHeight;
        if (h > 0) document.documentElement.style.setProperty('--ai-input-h', h + 'px');
    }

    function scrollToBottom() {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
        // iOS app only: avatars finish loading AFTER this first jump and grow the
        // list, and PI cards expand further as their signal-detail sections render,
        // so the view ends up short of the real bottom. Re-pin next frame, as each
        // late image lands, and once after layout settles. Desktop is unchanged.
        if (!isIOSApp) return;
        const pin = () => { messagesContainer.scrollTop = messagesContainer.scrollHeight; };
        requestAnimationFrame(pin);
        messagesContainer.querySelectorAll('img').forEach(img => {
            if (!img.complete) img.addEventListener('load', pin, { once: true });
        });
        setTimeout(pin, 250);
    }

    // ========================
    // MESSAGING
    // ========================

    function showTyping() {
        const typing = document.createElement('div');
        typing.className = 'pi-typing';
        typing.id = 'piTyping';
        typing.innerHTML = '<span></span><span></span><span></span>';
        messagesContainer.appendChild(typing);
        scrollToBottom();
    }

    function removeTyping() {
        const typing = document.getElementById('piTyping');
        if (typing) typing.remove();
    }

    async function sendMessage(text) {
        text = text.trim();
        if (!text || isSending) return;

        isSending = true;

        if (!activeChatId) {
            const chat = await createNewChat();
            if (!chat) {
                isSending = false;
                return;
            }
        }

        if (welcome) welcome.style.display = 'none';

        // Show user message immediately
        const userDiv = document.createElement('div');
        userDiv.className = 'pi-msg user';
        userDiv.textContent = text;
        messagesContainer.appendChild(userDiv);
        scrollToBottom();

        input.value = '';
        input.style.height = 'auto';

        showTyping();

        try {
            // Check for "show more" pattern — skip Claude, query DB directly
            const isShowMore = SHOW_MORE_PATTERN.test(text) && lastSignalFilters && activeChatId;

            let data;
            if (isShowMore) {
                currentSearchOffset += 5;
                data = await API.ai.showMore(activeChatId, 'portal_intelligence', null, lastSignalFilters, currentSearchOffset);
            } else {
                data = await API.ai.sendPiMessage(activeChatId, text);

                // Track filters for "show more" follow-ups
                if (data.signal_filters) {
                    lastSignalFilters = data.signal_filters;
                    currentSearchOffset = 0;
                }
            }

            removeTyping();

            // Show the AI response text
            const aiDiv = document.createElement('div');
            aiDiv.className = 'pi-msg assistant';
            aiDiv.textContent = data.response;
            messagesContainer.appendChild(aiDiv);

            // Render player cards with signal reasoning
            if (data.players && data.players.length > 0) {
                const cardsContainer = document.createElement('div');
                cardsContainer.className = 'pi-player-cards';
                data.players.forEach(player => {
                    cardsContainer.appendChild(createPlayerCard(player));
                });
                messagesContainer.appendChild(cardsContainer);
                batchCheckFlags(cardsContainer);
            }

            scrollToBottom();

            // Refresh chat list to update title/order
            loadChats();

        } catch (error) {
            removeTyping();
            const errorDiv = document.createElement('div');
            errorDiv.className = 'pi-msg assistant error';
            errorDiv.textContent = 'Sorry, something went wrong. Please try again.';
            messagesContainer.appendChild(errorDiv);
            scrollToBottom();
        }

        isSending = false;
    }

    // ========================
    // PLAYER CARD RENDERING
    // ========================

    function createPlayerCard(player) {
        const card = document.createElement('div');
        const displayName = `${player.first_name || ''} ${player.last_name || ''}`.trim() || 'Unknown Player';
        const height = formatHeight(player.height);
        const weight = player.weight ? `${player.weight} lbs` : 'N/A';
        const school = player.team_name || 'Unknown School';
        const division = formatDivision(player.college_division);
        const profileImage = player.profile_image_url;
        const gpaVal = player.gpa ? parseFloat(player.gpa) : null;
        const gpa = gpaVal ? gpaVal.toFixed(1) : 'N/A';

        card.className = 'pi-player-card';

        // Build signal badges
        const signalBadges = (player.signal_types || []).map(signal => {
            const labels = {
                'bio_and_film': 'Bio + New Film',
                'portal_keywords': 'Portal Keywords',
                'browsing_coaches': 'Browsing Coaches'
            };
            const icons = {
                'bio_and_film': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>',
                'portal_keywords': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.35-4.35"></path></svg>',
                'browsing_coaches': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>'
            };
            return `<span class="pi-signal-badge pi-signal-${signal}">${icons[signal] || ''}${labels[signal] || signal}</span>`;
        }).join('');

        // Build in-depth signal reasoning sections
        let signalDetailsHtml = '';
        const details = player.signal_details || {};

        // Portal Keywords — show matched keywords + full bio with highlights
        if (details.portal_keywords) {
            const kw = details.portal_keywords;
            let section = '<div class="pi-signal-section pi-section-keywords">';
            section += '<div class="pi-section-header"><span class="pi-section-icon">&#128269;</span> Portal Keywords Detected</div>';
            if (kw.matched_keywords && kw.matched_keywords.length > 0) {
                section += '<div class="pi-keyword-tags">';
                kw.matched_keywords.forEach(keyword => {
                    section += `<span class="pi-keyword-tag">${escapeHtml(keyword)}</span>`;
                });
                section += '</div>';
            }
            if (kw.bio_text) {
                let bioHtml = escapeHtml(kw.bio_text);
                // Highlight matched keywords in the bio text
                if (kw.matched_keywords) {
                    kw.matched_keywords.forEach(keyword => {
                        const regex = new RegExp(`(${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
                        bioHtml = bioHtml.replace(regex, '<mark class="pi-keyword-highlight">$1</mark>');
                    });
                }
                section += `<div class="pi-bio-preview"><div class="pi-bio-label">Player's Bio:</div><div class="pi-bio-text">${bioHtml}</div></div>`;
            }
            if (kw.bio_updated) {
                section += `<div class="pi-detail-meta">Bio last updated: ${formatDate(kw.bio_updated)}</div>`;
            }
            section += '</div>';
            signalDetailsHtml += section;
        }

        // Bio + Film — show update date, highlights, and bio only if not already shown in keywords section
        if (details.bio_and_film) {
            const bf = details.bio_and_film;
            const bioAlreadyShown = !!details.portal_keywords;
            let section = '<div class="pi-signal-section pi-section-biofilm">';
            section += '<div class="pi-section-header"><span class="pi-section-icon">&#127916;</span> Bio Updated + New Film Uploaded</div>';
            if (!bioAlreadyShown && bf.bio_updated) {
                section += `<div class="pi-detail-meta">Bio updated: ${formatDate(bf.bio_updated)}</div>`;
            }
            if (!bioAlreadyShown && bf.bio_excerpt) {
                section += `<div class="pi-bio-preview"><div class="pi-bio-label">Bio excerpt:</div><div class="pi-bio-text">${escapeHtml(bf.bio_excerpt)}</div></div>`;
            }
            if (bf.recent_highlights && bf.recent_highlights.length > 0) {
                section += '<div class="pi-highlights-list"><div class="pi-bio-label">Recent Highlights:</div>';
                bf.recent_highlights.forEach(hl => {
                    const typeLabel = hl.type === 'season' ? 'Season' : hl.type === 'game' ? 'Game' : (hl.type || 'Highlight');
                    section += `<div class="pi-highlight-item"><span class="pi-hl-title">${escapeHtml(hl.title || 'Untitled')}</span><span class="pi-hl-meta">${typeLabel} &middot; Uploaded ${formatDate(hl.uploaded_at)}</span></div>`;
                });
                section += '</div>';
            }
            section += '</div>';
            signalDetailsHtml += section;
        }

        // Browsing Coaches — show each coach name, title, team, view count, last viewed
        if (details.browsing_coaches) {
            const bc = details.browsing_coaches;
            let section = '<div class="pi-signal-section pi-section-browsing">';
            section += '<div class="pi-section-header"><span class="pi-section-icon">&#128065;</span> Browsing Coaches From Other Programs</div>';
            if (bc.unique_teams_browsed || bc.total_external_views) {
                section += `<div class="pi-detail-meta">${bc.unique_teams_browsed || 0} different program${(bc.unique_teams_browsed || 0) !== 1 ? 's' : ''} &middot; ${bc.total_external_views || 0} total coach profile view${(bc.total_external_views || 0) !== 1 ? 's' : ''}</div>`;
            }
            if (bc.coaches_viewed && bc.coaches_viewed.length > 0) {
                const recentDates = bc.coaches_viewed
                    .filter(c => c.last_viewed)
                    .map(c => formatDate(c.last_viewed))
                    .filter((d, i, arr) => arr.indexOf(d) === i)
                    .slice(0, 3);
                if (recentDates.length > 0) {
                    section += `<div class="pi-detail-meta">Recent activity: ${recentDates.join(', ')}</div>`;
                }
            }
            section += '</div>';
            signalDetailsHtml += section;
        }

        // Mobile (including the iOS app) moves the Flag button up into the header,
        // pinned far right and vertically centered against the avatar, and drops
        // View Profile entirely — tapping the card already opens the profile, so
        // the button only stole width from the player's info. Desktop keeps the
        // original bottom action bar. JS picks the markup and CSS backs it up,
        // matching the isMobile()-decides-the-HTML convention on the discover pages.
        const isMobileCard = window.innerWidth <= 768;
        const flagBtnHtml = `
                <button class="pi-btn-flag-player" data-player-id="${player.user_id || ''}" data-flagged="false">
                    <svg class="pi-flag-icon-outline" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
                        <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
                    </svg>
                    <svg class="pi-flag-icon-filled" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" style="display:none;">
                        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
                        <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
                    </svg>
                    <span class="pi-flag-label">Flag Player</span>
                </button>`;

        card.innerHTML = `
            <div class="pi-card-header">
                <div class="pi-card-avatar">
                    ${profileImage
                        ? `<img src="${profileImage}" alt="${escapeHtml(displayName)}" class="pi-avatar-image">`
                        : `<svg viewBox="0 0 24 24" fill="currentColor">
                            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                            <circle cx="12" cy="7" r="4"></circle>
                        </svg>`
                    }
                </div>
                <div class="pi-card-info">
                    <h3 class="pi-card-name">${escapeHtml(displayName)}</h3>
                    <div class="pi-card-positions">${formatPositions(player.position)}</div>
                </div>
                ${isMobileCard ? flagBtnHtml : ''}
            </div>
            <div class="pi-card-stats">
                <div class="pi-stat-item">
                    <div class="pi-stat-label">Height</div>
                    <div class="pi-stat-value">${height}</div>
                </div>
                <div class="pi-stat-item">
                    <div class="pi-stat-label">Weight</div>
                    <div class="pi-stat-value">${weight}</div>
                </div>
                <div class="pi-stat-item">
                    <div class="pi-stat-label">GPA</div>
                    <div class="pi-stat-value">${gpa}</div>
                </div>
            </div>
            <div class="pi-card-school">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                    <path d="M9 22V12h6v10"></path>
                </svg>
                ${escapeHtml(school)}${division ? ` (${division})` : ''}
            </div>
            <div class="pi-signal-badges">${signalBadges}</div>
            ${signalDetailsHtml ? `<div class="pi-signal-details">${signalDetailsHtml}</div>` : ''}
            ${isMobileCard ? '' : `<div class="pi-card-actions">
                <button class="pi-btn-view-profile">View Profile</button>${flagBtnHtml}
            </div>`}
        `;

        // Null on mobile — the View Profile button isn't rendered there.
        const viewBtn = card.querySelector('.pi-btn-view-profile');
        if (viewBtn) viewBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            sessionStorage.setItem('piScrollPosition', String(messagesContainer.scrollTop));
            // Resolve relative nav against current page so it works in both web and iOS WKWebView
            if (player.username) {
                window.location.href = new URL(`../../shared/view-profile.html?username=${player.username}&from=transfer-portal`, window.location.href).href;
            } else if (player.user_id) {
                window.location.href = new URL(`../../shared/view-profile.html?userId=${player.user_id}&from=transfer-portal`, window.location.href).href;
            }
        });

        // Flag player button
        const flagBtn = card.querySelector('.pi-btn-flag-player');
        if (flagBtn && player.user_id) {
            flagBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                toggleFlag(flagBtn, player.user_id);
            });
        }

        card.addEventListener('click', () => {
            sessionStorage.setItem('piScrollPosition', String(messagesContainer.scrollTop));
            if (player.username) {
                window.location.href = new URL(`../../shared/view-profile.html?username=${player.username}&from=transfer-portal`, window.location.href).href;
            } else if (player.user_id) {
                window.location.href = new URL(`../../shared/view-profile.html?userId=${player.user_id}&from=transfer-portal`, window.location.href).href;
            }
        });

        return card;
    }

    // ========================
    // HELPERS
    // ========================

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function formatTimeAgo(dateStr) {
        const date = new Date(dateStr);
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays < 7) return `${diffDays}d ago`;
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }

    function formatDate(dateStr) {
        if (!dateStr) return '';
        const date = new Date(dateStr);
        const now = new Date();
        const diffMs = now - date;
        const diffDays = Math.floor(diffMs / 86400000);
        if (diffDays === 0) return 'Today';
        if (diffDays === 1) return 'Yesterday';
        if (diffDays < 7) return `${diffDays} days ago`;
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined });
    }

    function formatHeight(heightVal) {
        if (!heightVal) return 'N/A';
        if (typeof heightVal === 'string' && heightVal.includes("'")) return heightVal;
        const totalInches = parseInt(heightVal);
        if (isNaN(totalInches) || totalInches <= 0) return 'N/A';
        return `${Math.floor(totalInches / 12)}'${totalInches % 12}"`;
    }

    function formatDivision(division) {
        if (!division) return '';
        const div = division.trim().toUpperCase();
        if (div === 'D1 FBS' || div === 'FBS') return 'D1 FBS';
        if (div === 'D1 FCS' || div === 'FCS') return 'D1 FCS';
        if (div === 'D2' || div === 'DIVISION II') return 'D2';
        if (div === 'D3' || div === 'DIVISION III') return 'D3';
        if (div === 'NAIA') return 'NAIA';
        if (div === 'NJCAA' || div === 'JUCO') return 'JUCO';
        return division;
    }

    const positionNames = {
        'QB': 'QB', 'RB': 'RB', 'FB': 'FB', 'WR': 'WR', 'TE': 'TE',
        'OT': 'OT', 'OG': 'OG', 'C': 'C', 'OL': 'OL',
        'DE': 'DE', 'DT': 'DT', 'NT': 'NT',
        'ILB': 'ILB', 'OLB': 'OLB', 'MLB': 'MLB', 'LB': 'LB',
        'CB': 'CB', 'FS': 'FS', 'SS': 'SS', 'S': 'S',
        'K': 'K', 'P': 'P', 'LS': 'LS', 'ATH': 'ATH'
    };

    function formatPositions(positionString) {
        if (!positionString) return '';
        return positionString.split(/[,\/]/).map(p => p.trim()).filter(p => p !== '').map(pos => {
            const abbr = positionNames[pos.toUpperCase()] || pos;
            return `<span class="pi-position-badge">${abbr}</span>`;
        }).join('');
    }

    // ========================
    // WATCHLIST FUNCTIONS
    // ========================

    function updateWatchlistCount(count) {
        watchlistCount = count;
        if (watchlistCountEl) watchlistCountEl.textContent = `${count}/50`;
        if (watchlistHeaderCount) watchlistHeaderCount.textContent = `${count}/50`;
    }

    async function loadWatchlistCount() {
        try {
            const data = await API.ai.getWatchlist();
            updateWatchlistCount(data.count);
        } catch (e) {
            console.error('Failed to load watchlist count:', e);
        }
    }

    async function toggleFlag(btn, playerUserId) {
        const isFlagged = btn.dataset.flagged === 'true';
        try {
            if (isFlagged) {
                const data = await API.ai.removeFromWatchlist(playerUserId);
                setFlagState(btn, false);
                updateWatchlistCount(data.count);
            } else {
                const data = await API.ai.addToWatchlist(playerUserId);
                setFlagState(btn, true);
                updateWatchlistCount(data.count);
            }
        } catch (e) {
            if (e.message && e.message.includes('Watchlist full')) {
                showFlagError(btn, 'Watchlist full — maximum 50 players');
            } else {
                console.error('Failed to toggle flag:', e);
            }
        }
    }

    function setFlagState(btn, flagged) {
        btn.dataset.flagged = flagged ? 'true' : 'false';
        const outlineIcon = btn.querySelector('.pi-flag-icon-outline');
        const filledIcon = btn.querySelector('.pi-flag-icon-filled');
        const label = btn.querySelector('.pi-flag-label');
        if (flagged) {
            btn.classList.add('flagged');
            if (outlineIcon) outlineIcon.style.display = 'none';
            if (filledIcon) filledIcon.style.display = '';
            if (label) label.textContent = 'Flagged';
        } else {
            btn.classList.remove('flagged');
            if (outlineIcon) outlineIcon.style.display = '';
            if (filledIcon) filledIcon.style.display = 'none';
            if (label) label.textContent = 'Flag Player';
        }
    }

    function showFlagError(btn, message) {
        const existing = btn.parentElement.querySelector('.pi-flag-error');
        if (existing) existing.remove();
        const err = document.createElement('div');
        err.className = 'pi-flag-error';
        err.textContent = message;
        btn.parentElement.appendChild(err);
        setTimeout(() => err.remove(), 3000);
    }

    async function batchCheckFlags(container) {
        const flagBtns = container.querySelectorAll('.pi-btn-flag-player[data-player-id]');
        const playerIds = [];
        flagBtns.forEach(btn => {
            const id = btn.dataset.playerId;
            if (id) playerIds.push(id);
        });
        if (playerIds.length === 0) return;

        try {
            const data = await API.ai.checkWatchlist(playerIds);
            const watchedSet = new Set(data.watchedIds || []);
            flagBtns.forEach(btn => {
                if (watchedSet.has(btn.dataset.playerId)) {
                    setFlagState(btn, true);
                }
            });
        } catch (e) {
            console.error('Failed to batch check watchlist:', e);
        }
    }

    // Watchlist modal
    function openWatchlistModal() {
        if (!watchlistOverlay) return;
        watchlistOverlay.classList.add('active');
        if (window.ModalUtils) ModalUtils.lockBodyScroll();
        renderWatchlistModal();
    }

    function closeWatchlistModal() {
        if (!watchlistOverlay) return;
        watchlistOverlay.classList.remove('active');
        if (window.ModalUtils) ModalUtils.unlockBodyScroll();
    }

    async function renderWatchlistModal() {
        if (!watchlistBody) return;
        watchlistBody.innerHTML = '<div class="pi-watchlist-loading">Loading watchlist...</div>';

        try {
            const data = await API.ai.getWatchlist();
            updateWatchlistCount(data.count);
            const players = data.players || [];

            if (players.length === 0) {
                watchlistBody.innerHTML = `
                    <div class="pi-watchlist-empty">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
                            <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
                        </svg>
                        <p>No players flagged yet</p>
                        <span>Flag players from Portal Intelligence results to track them here.</span>
                    </div>
                `;
                return;
            }

            watchlistBody.innerHTML = players.map(player => {
                const displayName = `${player.first_name || ''} ${player.last_name || ''}`.trim() || 'Unknown Player';
                const position = player.position || '—';
                const heightDisplay = formatHeight(player.height);
                const weightDisplay = player.weight ? `${player.weight} lbs` : '';
                const school = player.team_name || '';
                const division = formatDivision(player.college_division);
                const inPortal = player.transfer === 'y';
                const profileImage = player.profile_image_url;

                // Role-specific subheader (lesson 7)
                let subheader, subColor;
                if (inPortal) {
                    const elig = player.eligibility ? `YOE: ${player.eligibility} year${player.eligibility > 1 ? 's' : ''}` : '';
                    subheader = [position, heightDisplay, weightDisplay, elig].filter(Boolean).join(' \u2022 ');
                    subColor = '#b91c1c';
                } else {
                    // College player (not yet in portal)
                    subheader = [position, school, division].filter(Boolean).join(' \u2022 ');
                    subColor = '#1282a2';
                }

                return `
                    <div class="pi-watchlist-item" data-user-id="${player.user_id}" data-username="${player.username || ''}">
                        <div class="pi-watchlist-item-avatar">
                            ${profileImage
                                ? `<img src="${profileImage}" alt="${escapeHtml(displayName)}">`
                                : `<svg viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                                    <circle cx="12" cy="7" r="4"></circle>
                                </svg>`
                            }
                        </div>
                        <div class="pi-watchlist-item-info">
                            <div class="pi-watchlist-item-name">${escapeHtml(displayName)}</div>
                            <div class="pi-watchlist-item-detail" style="color: ${subColor}">${escapeHtml(subheader)}</div>
                            ${!inPortal && school ? `<div class="pi-watchlist-item-school">${escapeHtml(school)}${player.state ? ', ' + escapeHtml(player.state) : ''}</div>` : ''}
                        </div>
                        <div class="pi-watchlist-item-status ${inPortal ? 'in-portal' : 'not-in-portal'}">
                            ${inPortal ? 'In Portal' : 'Not in Portal'}
                        </div>
                        <button class="pi-watchlist-item-remove" data-remove-id="${player.user_id}" title="Remove from watchlist">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <line x1="18" y1="6" x2="6" y2="18"></line>
                                <line x1="6" y1="6" x2="18" y2="18"></line>
                            </svg>
                        </button>
                    </div>
                `;
            }).join('');

            // Click handlers for watchlist items (save modal state for back navigation)
            watchlistBody.querySelectorAll('.pi-watchlist-item').forEach(item => {
                item.addEventListener('click', (e) => {
                    if (e.target.closest('.pi-watchlist-item-remove')) return;
                    sessionStorage.setItem('piWatchlistModalOpen', 'true');
                    const username = item.dataset.username;
                    const userId = item.dataset.userId;
                    if (username) {
                        window.location.href = new URL(`../../shared/view-profile.html?username=${username}&from=transfer-portal`, window.location.href).href;
                    } else if (userId) {
                        window.location.href = new URL(`../../shared/view-profile.html?userId=${userId}&from=transfer-portal`, window.location.href).href;
                    }
                });
            });

            // Remove buttons
            watchlistBody.querySelectorAll('.pi-watchlist-item-remove').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const playerId = btn.dataset.removeId;
                    try {
                        const data = await API.ai.removeFromWatchlist(playerId);
                        updateWatchlistCount(data.count);
                        // Update any flag buttons in the chat for this player
                        messagesContainer.querySelectorAll(`.pi-btn-flag-player[data-player-id="${playerId}"]`).forEach(flagBtn => {
                            setFlagState(flagBtn, false);
                        });
                        // Re-render modal
                        renderWatchlistModal();
                    } catch (err) {
                        console.error('Failed to remove from watchlist:', err);
                    }
                });
            });

        } catch (e) {
            console.error('Failed to load watchlist:', e);
            watchlistBody.innerHTML = '<div class="pi-watchlist-empty"><p>Failed to load watchlist</p></div>';
        }
    }

    // ========================
    // EVENT LISTENERS
    // ========================

    sendBtn.addEventListener('click', () => sendMessage(input.value));

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage(input.value);
        }
    });

    input.addEventListener('input', () => {
        input.style.height = 'auto';
        input.style.height = Math.min(input.scrollHeight, 120) + 'px';
        syncInputHeightVar(); // the pinned input grew/shrank — re-reserve list space
    });

    if (newChatBtn) {
        newChatBtn.addEventListener('click', () => createNewChat());
    }

    // Mobile action bar buttons
    const piMobileNewChat = document.getElementById('piMobileNewChat');
    const piMobileHistory = document.getElementById('piMobileHistory');
    const piMobileWatchlist = document.getElementById('piMobileWatchlist');
    const piMobileUsage = document.getElementById('piMobileUsage');

    // Move modal overlays to document.body on mobile so they escape the fixed .main-content clipping
    if (window.innerWidth <= 768) {
        const usageOverlay = document.getElementById('piUsageOverlay');
        const watchlistOverlay = document.querySelector('.pi-watchlist-overlay');
        if (usageOverlay) document.body.appendChild(usageOverlay);
        if (watchlistOverlay) document.body.appendChild(watchlistOverlay);
    }

    if (piMobileNewChat) piMobileNewChat.addEventListener('click', () => createNewChat());
    if (piMobileWatchlist) piMobileWatchlist.addEventListener('click', () => openWatchlistModal());
    if (piMobileUsage) piMobileUsage.addEventListener('click', () => openPiUsageModal());
    // Mobile history panel toggle — slide-in with backdrop overlay
    let piHistoryOverlay = null;

    function openMobileHistoryPanel() {
        const history = document.getElementById('piHistory');
        const actionsBar = document.getElementById('piMobileActions');
        if (history) {
            history.style.display = 'flex';
            history.style.position = 'fixed';
            // Start below the in-app mobile header + iOS status bar (matches the
            // .pi-layout container offset) so the "Chat History" header isn't cut off.
            // +8px so the New Chat button's top edge clears the subheader line.
            history.style.top = 'calc(58px + env(safe-area-inset-top, 0px))';
            history.style.left = '0';
            history.style.width = '68%';
            history.style.bottom = '0';
            history.style.right = '';
            history.style.zIndex = '1001';
            history.style.background = 'rgba(10, 17, 40, 0.98)';
            history.style.flexDirection = 'column';
        }
        if (actionsBar) actionsBar.style.display = 'none';

        // Create backdrop overlay for closing
        if (!piHistoryOverlay) {
            piHistoryOverlay = document.createElement('div');
            piHistoryOverlay.style.cssText = 'position:fixed;top:0;left:68%;right:0;bottom:0;background:transparent;z-index:1002;';
            piHistoryOverlay.addEventListener('click', closeMobileHistoryPanel);
        }
        document.body.appendChild(piHistoryOverlay);
    }

    function closeMobileHistoryPanel() {
        const history = document.getElementById('piHistory');
        const actionsBar = document.getElementById('piMobileActions');
        if (history && window.innerWidth <= 768) {
            history.style.display = 'none';
            history.style.position = '';
            history.style.top = '';
            history.style.left = '';
            history.style.width = '';
            history.style.bottom = '';
            history.style.right = '';
            history.style.zIndex = '';
            history.style.background = '';
            history.style.flexDirection = '';
        }
        if (actionsBar && window.innerWidth <= 768) actionsBar.style.display = 'flex';
        if (piHistoryOverlay && piHistoryOverlay.parentNode) {
            piHistoryOverlay.parentNode.removeChild(piHistoryOverlay);
        }
    }

    if (piMobileHistory) {
        piMobileHistory.addEventListener('click', () => {
            const history = document.getElementById('piHistory');
            const isVisible = history && history.style.display === 'flex';
            if (isVisible) {
                closeMobileHistoryPanel();
            } else {
                openMobileHistoryPanel();
            }
        });
    }

    // Long-press to delete on mobile + desktop
    const historyListEl = document.getElementById('piHistoryList');
    if (historyListEl) {
        let longPressTimer = null;

        historyListEl.addEventListener('touchstart', (e) => {
            const item = e.target.closest('.pi-history-item');
            if (!item) return;
            longPressTriggered = false;
            longPressTimer = setTimeout(() => {
                longPressTriggered = true;
                const chatId = item.dataset.chatId;
                if (chatId && typeof showConfirmModal === 'function') {
                    showConfirmModal({
                        title: 'Delete Conversation',
                        message: 'Are you sure you want to delete this conversation?',
                        confirmText: 'Delete',
                        danger: true,
                        icon: 'trash'
                    }).then(confirmed => {
                        if (confirmed) deleteChat(chatId);
                    });
                }
            }, 400);
        }, { passive: true });

        historyListEl.addEventListener('touchend', () => { clearTimeout(longPressTimer); });
        historyListEl.addEventListener('touchmove', () => { clearTimeout(longPressTimer); });

        historyListEl.addEventListener('mousedown', (e) => {
            const item = e.target.closest('.pi-history-item');
            if (!item) return;
            longPressTriggered = false;
            longPressTimer = setTimeout(() => {
                longPressTriggered = true;
                const chatId = item.dataset.chatId;
                if (chatId && typeof showConfirmModal === 'function') {
                    showConfirmModal({
                        title: 'Delete Conversation',
                        message: 'Are you sure you want to delete this conversation?',
                        confirmText: 'Delete',
                        danger: true,
                        icon: 'trash'
                    }).then(confirmed => {
                        if (confirmed) deleteChat(chatId);
                    });
                }
            }, 400);
        });

        historyListEl.addEventListener('mouseup', () => { clearTimeout(longPressTimer); });
        historyListEl.addEventListener('mouseleave', () => { clearTimeout(longPressTimer); });
    }

    // Patch new chat button inside history panel to close panel
    if (newChatBtn) {
        newChatBtn.addEventListener('click', () => {
            if (window.innerWidth <= 768) closeMobileHistoryPanel();
        });
    }

    suggestions.forEach(btn => {
        btn.addEventListener('click', () => {
            const prompt = btn.dataset.prompt;
            if (prompt) sendMessage(prompt);
        });
    });

    // Watchlist modal event listeners
    if (watchlistBtn) {
        watchlistBtn.addEventListener('click', openWatchlistModal);
    }
    if (watchlistCloseBtn) {
        watchlistCloseBtn.addEventListener('click', closeWatchlistModal);
    }
    if (watchlistOverlay) {
        watchlistOverlay.addEventListener('click', (e) => {
            if (e.target === watchlistOverlay) closeWatchlistModal();
        });
    }
    if (watchlistClearAll) {
        watchlistClearAll.addEventListener('click', async () => {
            if (!(await showConfirmModal({ title: 'Clear Watchlist', message: 'Remove all players from your watchlist?', confirmText: 'Clear All', cancelText: 'Cancel' }))) return;
            try {
                const data = await API.ai.clearWatchlist();
                updateWatchlistCount(data.count);
                // Update all flag buttons in chat
                messagesContainer.querySelectorAll('.pi-btn-flag-player').forEach(btn => {
                    setFlagState(btn, false);
                });
                renderWatchlistModal();
            } catch (e) {
                console.error('Failed to clear watchlist:', e);
            }
        });
    }
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && watchlistOverlay && watchlistOverlay.classList.contains('active')) {
            closeWatchlistModal();
        }
        if (e.key === 'Escape' && piUsageOverlay && piUsageOverlay.classList.contains('active')) {
            closePiUsageModal();
        }
    });

    // ========================
    // VIEW USAGE MODAL
    // ========================

    const piUsageOverlay = document.getElementById('piUsageOverlay');
    const piOpenUsageBtn = document.getElementById('piOpenUsageBtn');
    const piCloseUsageBtn = document.getElementById('piCloseUsageBtn');

    function piFormatTokenCount(n) {
        if (n == null) return '—';
        if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
        if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
        return n.toLocaleString();
    }

    async function openPiUsageModal() {
        if (!piUsageOverlay) return;
        try {
        const usage = await API.ai.getUsage();
        const totalUsed = usage.inputTokens + usage.outputTokens;
        const percent = Math.min((totalUsed / usage.tokenCap) * 100, 100);
        const remaining = Math.max(usage.tokenCap - totalUsed, 0);

        document.getElementById('piUsagePlanName').textContent = usage.plan;
        document.getElementById('piUsagePeriod').textContent =
            new Date(usage.periodStart).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
            ' – ' +
            new Date(usage.periodEnd).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        document.getElementById('piUsageNumbers').textContent = piFormatTokenCount(totalUsed) + ' / ' + piFormatTokenCount(usage.tokenCap);
        document.getElementById('piUsagePercent').textContent = percent.toFixed(1) + '% used';
        document.getElementById('piUsageRemaining').textContent = piFormatTokenCount(remaining) + ' tokens remaining';
        document.getElementById('piUsageRequests').textContent = usage.totalRequests.toLocaleString();

        const barFill = document.getElementById('piUsageBarFill');
        barFill.style.width = percent + '%';
        barFill.classList.remove('warning', 'critical');
        if (percent >= 90) barFill.classList.add('critical');
        else if (percent >= 75) barFill.classList.add('warning');

        const summary = document.getElementById('piUsageSummary');
        if (summary) summary.textContent = Math.round(percent) + '%';

        piUsageOverlay.classList.add('active');
        if (window.ModalUtils) ModalUtils.lockBodyScroll();
        } catch (err) {
            console.error('Failed to load usage:', err);
        }
    }

    function closePiUsageModal() {
        if (piUsageOverlay) piUsageOverlay.classList.remove('active');
        if (window.ModalUtils) ModalUtils.unlockBodyScroll();
    }

    if (piOpenUsageBtn) {
        piOpenUsageBtn.addEventListener('click', openPiUsageModal);
    }

    if (piCloseUsageBtn) {
        piCloseUsageBtn.addEventListener('click', closePiUsageModal);
    }

    if (piUsageOverlay) {
        piUsageOverlay.addEventListener('click', (e) => {
            if (e.target === piUsageOverlay) closePiUsageModal();
        });
    }

    // ========================
    // INIT
    // ========================

    // Measure before any chat renders so the list reserves the right space and the
    // scroll-to-bottom in selectChat lands correctly on the first paint.
    syncInputHeightVar();
    if (isIOSApp && window.ResizeObserver) {
        const piInputArea = document.querySelector('.pi-input-area');
        // Also catches the tab becoming visible (0px -> real height), since the PI
        // subtab can start hidden when sessionStorage restores Current Portal.
        if (piInputArea) new ResizeObserver(syncInputHeightVar).observe(piInputArea);
    }

    loadWatchlistCount();

    // Auto-reopen watchlist modal if returning from profile view
    const shouldReopenWatchlist = sessionStorage.getItem('piWatchlistModalOpen');
    if (shouldReopenWatchlist) {
        sessionStorage.removeItem('piWatchlistModalOpen');
        setTimeout(() => openWatchlistModal(), 300);
    }

    loadChats().then(() => {
        if (chats.length > 0) {
            activeChatId = chats[0].id;
            selectChat(activeChatId);
        }
    });

    // Update usage badge on page load
    API.ai.getUsage().then(usage => {
        const totalUsed = usage.inputTokens + usage.outputTokens;
        const percent = Math.min((totalUsed / usage.tokenCap) * 100, 100);
        const summary = document.getElementById('piUsageSummary');
        if (summary) summary.textContent = Math.round(percent) + '%';
    }).catch(() => { /* silent */ });
});
