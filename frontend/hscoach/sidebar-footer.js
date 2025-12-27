// Sidebar Footer Component for HS Coach
// This component injects the sidebar-footer element with user menu
// Runs immediately since script is loaded after the sidebar-footer element exists in DOM

(function initSidebarFooter() {
    const sidebarFooterContainer = document.querySelector('.sidebar-footer');
    if (!sidebarFooterContainer) return;

    // Build the footer HTML
    const footerHTML = `
        <div class="user-menu">
            <div class="user-avatar-circle" style="visibility: hidden;">
                <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                    <circle cx="12" cy="7" r="4"></circle>
                </svg>
            </div>
            <div class="user-info">
                <div class="user-name"></div>
                <div class="user-role"></div>
            </div>
            <svg class="more-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="1"></circle>
                <circle cx="12" cy="5" r="1"></circle>
                <circle cx="12" cy="19" r="1"></circle>
            </svg>
        </div>
    `;

    sidebarFooterContainer.innerHTML = footerHTML;
})();
