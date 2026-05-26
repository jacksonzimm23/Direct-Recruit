window.ModalUtils = (function () {
    let lockCount = 0;
    let originalOverflow = '';

    function lockBodyScroll() {
        if (lockCount === 0) {
            originalOverflow = document.body.style.overflow || '';
            document.body.style.overflow = 'hidden';
        }
        lockCount++;
    }

    function unlockBodyScroll() {
        if (lockCount > 0) lockCount--;
        if (lockCount === 0) {
            document.body.style.overflow = originalOverflow;
        }
    }

    return { lockBodyScroll, unlockBodyScroll };
})();
