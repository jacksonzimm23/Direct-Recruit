// Sidebar Navigation Component for HS Coach
// This component injects the sidebar-nav element and automatically sets the active state based on current URL
// Runs immediately since script is loaded after the sidebar-nav element exists in DOM

(function initSidebarNav() {
    const sidebarNavContainer = document.querySelector('.sidebar-nav');
    if (!sidebarNavContainer) return;

    const currentPath = window.location.pathname;

    // Build ABSOLUTE, origin-prefixed nav paths. Bare relative hrefs (e.g.
    // "discover-players.html") do NOT navigate inside the iOS WKWebView
    // (origin = https://localhost) — they silently fail. Full URLs navigate
    // reliably on web and in the app. Role folder is read from /frontend/<role>/.
    const roleMatch = currentPath.match(/\/frontend\/([^/]+)/);
    const roleFolder = roleMatch ? roleMatch[1] : '';
    const roleRoot = `${window.location.origin}/frontend/${roleFolder}/`;
    const basePath = roleRoot;            // mainpage-*.html lives at the role root
    const tabsPath = `${roleRoot}tabs/`;  // all tab pages live under tabs/

    // Get current page name for active state
    const pageName = currentPath.split('/').pop().replace('.html', '');

    // Check for 'from' parameter to determine which nav item should be active
    // This is used when viewing other profiles from discover, notifications, etc.
    const urlParams = new URLSearchParams(window.location.search);
    const fromPage = urlParams.get('from');

    // Map 'from' values to page names
    // When viewing another profile, highlight the nav item they came from
    const fromPageMap = {
        'notifications': 'notifications',
        'discover': 'discover-players',
        'messages': 'messages',
        'feed': 'mainpage-coach',
        'profile': 'my-profile'
    };

    // Use fromPage for active state if viewing another user's profile
    const activePageName = (fromPage && fromPageMap[fromPage]) ? fromPageMap[fromPage] : pageName;

    // Define navigation items for HS Coach
    const navItems = [
        {
            href: `${basePath}mainpage-coach.html`,
            id: 'feedNavItem',
            icon: `<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                   <polyline points="9 22 9 12 15 12 15 22"></polyline>`,
            label: 'Feed',
            pages: ['mainpage-coach']
        },
        {
            href: `${tabsPath}discover-players.html`,
            id: '',
            icon: `<path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>`,
            label: 'Discover',
            pages: ['discover-players']
        },
        {
            href: `${tabsPath}my-profile.html`,
            id: 'profileNavItem',
            icon: `<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                   <circle cx="12" cy="7" r="4"></circle>`,
            label: 'My Profile',
            pages: ['my-profile']
        },
        {
            href: `${tabsPath}messages.html`,
            id: 'messagesNavItem',
            icon: `<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>`,
            label: 'Messages',
            pages: ['messages'],
            hasBadge: true
        },
        {
            href: `${tabsPath}notifications.html`,
            id: '',
            icon: `<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
                   <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>`,
            label: 'Notifications',
            pages: ['notifications'],
            hasBadge: true
        },
        {
            href: `${tabsPath}recruiting-board.html`,
            id: 'recruitingBoardNav',
            icon: `<rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                   <line x1="9" y1="3" x2="9" y2="21"></line>
                   <line x1="15" y1="3" x2="15" y2="21"></line>
                   <line x1="3" y1="9" x2="21" y2="9"></line>
                   <line x1="3" y1="15" x2="21" y2="15"></line>`,
            label: 'Recruiting Board',
            pages: ['recruiting-board'],
            hidden: true  // Initially hidden, shown by JS for college coaches
        },
        {
            href: `${tabsPath}transfer-portal.html`,
            id: 'transferPortalNav',
            icon: `<circle cx="12" cy="12" r="10"></circle>
                   <path d="M8 12h8"></path>
                   <path d="M12 8v8"></path>
                   <circle cx="12" cy="12" r="3"></circle>`,
            label: 'Transfer Portal',
            pages: ['transfer-portal'],
            hidden: true  // Initially hidden, shown by JS for college coaches
        },
        {
            href: `${tabsPath}settings.html`,
            id: '',
            icon: `<circle cx="12" cy="12" r="3"></circle>
                   <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>`,
            label: 'Settings',
            pages: ['settings']
        }
    ];

    // Build the navigation HTML
    let navHTML = '';
    navItems.forEach(item => {
        const isActive = item.pages.includes(activePageName);
        const activeClass = isActive ? ' active' : '';
        const idAttr = item.id ? ` id="${item.id}"` : '';
        const badgeHTML = item.hasBadge ? '<span class="notification-badge" style="display: none;"></span>' : '';
        const hiddenStyle = item.hidden ? ' style="display: none;"' : '';

        navHTML += `
            <a href="${item.href}" class="nav-item${activeClass}"${idAttr}${hiddenStyle}>
                <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    ${item.icon}
                </svg>
                <span>${item.label}</span>
                ${badgeHTML}
            </a>
        `;
    });

    sidebarNavContainer.innerHTML = navHTML;
})();
