// Authentication State Manager - Include this on protected pages

// Check authentication on page load
function checkAuth() {
    if (!isAuthenticated()) {
        window.location.href = '/frontend/landingpage/signin.html';
        return false;
    }
    return true;
}

// Check role authorization
function checkRole(requiredRole) {
    const user = getUser();
    if (!user || user.role !== requiredRole) {
        window.location.href = '/frontend/landingpage/index.html';
        return false;
    }
    return true;
}

// Logout function
async function logout() {
    if (await showConfirmModal({ title: 'Logout', message: 'Are you sure you want to logout?', confirmText: 'Logout', cancelText: 'Cancel' })) {
        authAPI.logout();
    }
}

// Display user info in nav/header
function displayUserInfo() {
    const user = getUser();
    if (!user) return;

    // Find user display elements
    const userEmailEl = document.getElementById('userEmail');
    const userRoleEl = document.getElementById('userRole');

    if (userEmailEl) userEmailEl.textContent = user.email;
    if (userRoleEl) userRoleEl.textContent = user.role.charAt(0).toUpperCase() + user.role.slice(1);
}

// Add logout button handlers
document.addEventListener('DOMContentLoaded', () => {
    const logoutBtns = document.querySelectorAll('.logout-btn, [data-logout]');
    logoutBtns.forEach(btn => {
        btn.addEventListener('click', logout);
    });

    displayUserInfo();
});
