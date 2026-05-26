// Mobile-web redirect: iOS Safari → App Store, Android → coming-soon page.
// iOS Capacitor app exempted via window.Capacitor. Email-driven flows with
// token-style query params skip the redirect so links from Cognito / coach
// invites / password resets still work on mobile Safari.
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
    var prefix = path.startsWith('/frontend/') ? '/frontend' : '';
    var target = isIOS
      ? prefix + '/landingpage/get-the-app.html'
      : prefix + '/landingpage/coming-soon-android.html';
    window.location.replace(target);
  } catch (e) { console.error('[mobileWebRedirect]', e); }
})();
