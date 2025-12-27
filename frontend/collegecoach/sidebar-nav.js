// Sidebar Navigation Component for College Coach
// This component injects the sidebar-nav element and automatically sets the active state based on current URL
// Runs immediately since script is loaded after the sidebar-nav element exists in DOM

(function initSidebarNav() {
    const sidebarNavContainer = document.querySelector('.sidebar-nav');
    if (!sidebarNavContainer) return;

    // Determine if we're in the tabs folder or main collegecoach folder
    const currentPath = window.location.pathname;
    const isInTabsFolder = currentPath.includes('/tabs/');

    // Set correct relative paths based on location
    const basePath = isInTabsFolder ? '../' : '';
    const tabsPath = isInTabsFolder ? '' : 'tabs/';

    // Get current page name for active state
    const pageName = currentPath.split('/').pop().replace('.html', '');

    // Define navigation items for College Coach
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
            icon: `<circle cx="11" cy="11" r="8"></circle>
                   <path d="m21 21-4.35-4.35"></path>`,
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
            pages: ['recruiting-board']
        },
        {
            href: `${tabsPath}transfer-portal.html`,
            id: 'transferPortalNav',
            icon: `<circle cx="12" cy="12" r="10"></circle>
                   <path d="M8 12h8"></path>
                   <path d="M12 8v8"></path>
                   <circle cx="12" cy="12" r="3"></circle>`,
            label: 'Transfer Portal',
            pages: ['transfer-portal']
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
        const isActive = item.pages.includes(pageName);
        const activeClass = isActive ? ' active' : '';
        const idAttr = item.id ? ` id="${item.id}"` : '';
        const badgeHTML = item.hasBadge ? '<span class="notification-badge" style="display: none;"></span>' : '';

        navHTML += `
            <a href="${item.href}" class="nav-item${activeClass}"${idAttr}>
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
