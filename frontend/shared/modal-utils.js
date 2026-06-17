window.ModalUtils = (function () {
    let lockCount = 0;
    let savedScrollY = 0;
    // Snapshot of the inline body styles we overwrite, so unlock restores
    // exactly what was there before (not just empty strings).
    let saved = {
        overflow: '',
        position: '',
        top: '',
        left: '',
        right: '',
        width: ''
    };

    // iOS Safari ignores `overflow: hidden` on <body> for touch scrolling, so a
    // modal opened over a scrollable page lets the background scroll under your
    // finger. The reliable cross-platform fix is to pin the body with
    // `position: fixed` at a negative top offset equal to the current scroll
    // position, which freezes the page in place, then restore the scroll on
    // unlock. `overflow: hidden` is kept too as a belt-and-suspenders for
    // desktop. Ref-counted so nested/stacked modals stay balanced.
    function lockBodyScroll() {
        if (lockCount === 0) {
            savedScrollY = window.scrollY || window.pageYOffset || 0;
            const body = document.body;
            saved.overflow = body.style.overflow || '';
            saved.position = body.style.position || '';
            saved.top = body.style.top || '';
            saved.left = body.style.left || '';
            saved.right = body.style.right || '';
            saved.width = body.style.width || '';

            body.style.overflow = 'hidden';
            body.style.position = 'fixed';
            body.style.top = `-${savedScrollY}px`;
            body.style.left = '0';
            body.style.right = '0';
            body.style.width = '100%';
        }
        lockCount++;
    }

    function unlockBodyScroll() {
        if (lockCount > 0) lockCount--;
        if (lockCount === 0) {
            const body = document.body;
            body.style.overflow = saved.overflow;
            body.style.position = saved.position;
            body.style.top = saved.top;
            body.style.left = saved.left;
            body.style.right = saved.right;
            body.style.width = saved.width;
            // Restore the scroll position the page had before locking. The
            // 'auto' behavior avoids a smooth-scroll animation jump.
            window.scrollTo(0, savedScrollY);
        }
    }

    return { lockBodyScroll, unlockBodyScroll };
})();
