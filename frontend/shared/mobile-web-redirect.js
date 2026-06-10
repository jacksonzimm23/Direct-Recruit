// Mobile-web redirect: iOS Safari → App Store, Android → coming-soon page.
// iOS Capacitor app exempted via window.Capacitor. Email-driven flows with
// token-style query params skip the redirect so links from Cognito / coach
// invites / password resets still work on mobile Safari.
// IMPORTANT: a twin copy of this logic lives in the mobileWebRedirect() IIFE
// at the top of shared/api.js (which loads on EVERY page). Any exemption added
// here MUST also be added there, or api.js will redirect the page anyway.
(function () {
  try {
    if (window.Capacitor) return;
    var ua = navigator.userAgent || '';
    var isIOS = /iPhone|iPad|iPod/i.test(ua);
    var isAndroid = /Android/i.test(ua);
    if (!isIOS && !isAndroid) return;

    // Preserve email-driven flows (token/code/reset/invite URLs).
    var qs = window.location.search || '';
    if (/[?&](token|code|reset|invite)=/i.test(qs)) return;

    var path = window.location.pathname;

    // Belt-and-suspenders: the College Coach invite + team-switch pages MUST work in
    // mobile Safari (the invite token only validates on web, and a coach completes
    // account creation + email verification here before being sent to the app to pay).
    // The ?token= check above should already exempt them, but email clients sometimes
    // wrap/normalize the link and can drop the query before this runs — so also exempt
    // these pages by path so an invited coach is never bounced to "Get the App"
    // mid-onboarding and locked out.
    if (path.indexOf('create-coach-profile.html') !== -1 ||
        path.indexOf('confirm-team-switch.html') !== -1 ||
        path.indexOf('verify-email.html') !== -1) return;

    var prefix = path.startsWith('/frontend/') ? '/frontend' : '';
    var target = isIOS
      ? prefix + '/landingpage/get-the-app.html'
      : prefix + '/landingpage/coming-soon-android.html';
    window.location.replace(target);
  } catch (e) { console.error('[mobileWebRedirect]', e); }
})();
