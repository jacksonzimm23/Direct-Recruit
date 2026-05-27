// Shared report modal — used by feed.js and per-role my-profile.js.
// Opens a modal with reason radios + optional details textarea; on submit,
// posts to /api/reports and resolves true. Cancel resolves false.

(function () {
    'use strict';

    const REASONS = [
        { value: 'spam',           label: 'Spam' },
        { value: 'harassment',     label: 'Harassment or bullying' },
        { value: 'inappropriate',  label: 'Inappropriate content' },
        { value: 'hate_speech',    label: 'Hate speech' },
        { value: 'impersonation',  label: 'Impersonation' },
        { value: 'other',          label: 'Other' }
    ];

    function injectStyles() {
        if (document.getElementById('report-modal-styles')) return;
        const style = document.createElement('style');
        style.id = 'report-modal-styles';
        style.textContent = `
            .report-modal-overlay {
                position: fixed; top: 0; left: 0; right: 0; bottom: 0;
                background: rgba(0,0,0,0.7); display: flex;
                align-items: center; justify-content: center;
                z-index: 99998; backdrop-filter: blur(4px);
                animation: reportModalFadeIn 0.2s ease-out;
            }
            @keyframes reportModalFadeIn {
                from { opacity: 0; } to { opacity: 1; }
            }
            .report-modal {
                background: rgba(10, 17, 40, 0.98);
                border: 1px solid rgba(18, 130, 162, 0.3);
                border-radius: 16px;
                padding: 1.75rem;
                max-width: 460px; width: 90%;
                box-shadow: 0 12px 48px rgba(0,0,0,0.6);
                animation: reportModalSlideUp 0.3s ease-out;
                font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
                max-height: 90vh; overflow-y: auto;
            }
            @keyframes reportModalSlideUp {
                from { opacity: 0; transform: translateY(20px); }
                to   { opacity: 1; transform: translateY(0); }
            }
            .report-modal-title {
                font-size: 1.35rem; font-weight: 700; color: #fff;
                margin: 0 0 0.5rem 0;
            }
            .report-modal-subtitle {
                font-size: 0.9rem; color: rgba(255,255,255,0.6);
                margin: 0 0 1.25rem 0;
            }
            .report-modal-reasons {
                display: flex; flex-direction: column; gap: 0.5rem;
                margin-bottom: 1rem;
            }
            .report-modal-reason {
                display: flex; align-items: center; gap: 0.75rem;
                padding: 0.65rem 0.85rem;
                background: rgba(255,255,255,0.04);
                border: 1px solid rgba(255,255,255,0.08);
                border-radius: 8px; cursor: pointer;
                transition: background 0.15s, border-color 0.15s;
                color: rgba(255,255,255,0.9); font-size: 0.95rem;
            }
            .report-modal-reason:hover {
                background: rgba(255,255,255,0.07);
            }
            .report-modal-reason input[type="radio"] {
                margin: 0; accent-color: #1282a2; width: 16px; height: 16px;
            }
            .report-modal-reason.selected {
                background: rgba(18,130,162,0.12);
                border-color: rgba(18,130,162,0.5);
            }
            .report-modal-details-wrap {
                margin-bottom: 1.25rem;
            }
            .report-modal-details-label {
                font-size: 0.85rem; color: rgba(255,255,255,0.6);
                display: block; margin-bottom: 0.4rem;
            }
            .report-modal-details {
                width: 100%; box-sizing: border-box;
                background: rgba(255,255,255,0.05);
                border: 1px solid rgba(255,255,255,0.1);
                border-radius: 8px; color: #fff;
                padding: 0.65rem 0.85rem; font-size: 0.9rem;
                font-family: inherit; resize: vertical;
                min-height: 70px; max-height: 200px;
            }
            .report-modal-details:focus {
                outline: none; border-color: rgba(18,130,162,0.6);
            }
            .report-modal-counter {
                text-align: right; font-size: 0.75rem;
                color: rgba(255,255,255,0.4); margin-top: 0.25rem;
            }
            .report-modal-actions {
                display: flex; gap: 0.75rem; justify-content: flex-end;
            }
            .report-modal-btn {
                padding: 0.65rem 1.5rem; border-radius: 8px;
                font-size: 0.95rem; font-weight: 600;
                border: none; cursor: pointer;
                transition: all 0.2s; font-family: inherit;
            }
            .report-modal-btn:hover:not(:disabled) {
                transform: translateY(-1px); filter: brightness(1.1);
            }
            .report-modal-btn-cancel {
                background: rgba(255,255,255,0.1); color: #fff;
                border: 1px solid rgba(255,255,255,0.2);
            }
            .report-modal-btn-submit {
                background: #ff6b6b; color: #fff;
            }
            .report-modal-btn-submit:disabled {
                background: rgba(255,107,107,0.35);
                cursor: not-allowed; opacity: 0.7;
            }
            @media (max-width: 768px) {
                .report-modal-overlay {
                    align-items: stretch; justify-content: stretch;
                }
                .report-modal {
                    width: 100vw; height: 100vh; max-width: 100vw; max-height: 100vh;
                    border-radius: 0; padding: 1.25rem;
                    border: none;
                }
            }

            /* Reported chip — shown in place of a faded post/share */
            .reported-chip {
                padding: 12px 16px;
                background: rgba(255,255,255,0.04);
                border: 1px solid rgba(255,255,255,0.08);
                border-radius: 8px;
                color: rgba(255,255,255,0.55);
                font-size: 13px; text-align: center;
                margin: 12px 0;
            }
        `;
        document.head.appendChild(style);
    }

    /**
     * Open the report modal.
     * @param {Object} opts
     * @param {string} opts.contentType - 'post' | 'comment' | 'message' | 'profile' | 'share'
     * @param {string=} opts.contentId - UUID for post/comment/message/share
     * @param {string=} opts.reportedUserId - UUID for profile reports
     * @param {string} opts.contentLabel - Friendly name for the modal title
     * @returns {Promise<boolean>} true if submitted, false if cancelled
     */
    window.openReportModal = function ({ contentType, contentId, reportedUserId, contentLabel }) {
        return new Promise((resolve) => {
            injectStyles();

            // Lock background scroll while modal is open. Save the previous
            // overflow value so we don't clobber pre-existing locks (e.g.
            // mobile sidebar, post modal). Restored in close().
            const prevBodyOverflow = document.body.style.overflow;
            document.body.style.overflow = 'hidden';

            const overlay = document.createElement('div');
            overlay.className = 'report-modal-overlay';
            overlay.innerHTML = `
                <div class="report-modal" role="dialog" aria-modal="true" aria-labelledby="reportModalTitle">
                    <h2 class="report-modal-title" id="reportModalTitle">Report ${contentLabel || 'Content'}</h2>
                    <p class="report-modal-subtitle">Tell us what's wrong. Reports are reviewed by our team.</p>
                    <div class="report-modal-reasons" role="radiogroup" aria-label="Reason">
                        ${REASONS.map(r => `
                            <label class="report-modal-reason">
                                <input type="radio" name="report-reason" value="${r.value}">
                                <span>${r.label}</span>
                            </label>
                        `).join('')}
                    </div>
                    <div class="report-modal-details-wrap">
                        <label class="report-modal-details-label" for="reportDetails">Add details (optional)</label>
                        <textarea id="reportDetails" class="report-modal-details" maxlength="1000" placeholder="What happened?"></textarea>
                        <div class="report-modal-counter"><span id="reportCharCount">0</span> / 1000</div>
                    </div>
                    <div class="report-modal-actions">
                        <button type="button" class="report-modal-btn report-modal-btn-cancel">Cancel</button>
                        <button type="button" class="report-modal-btn report-modal-btn-submit" disabled>Submit</button>
                    </div>
                </div>
            `;
            document.body.appendChild(overlay);

            const detailsEl  = overlay.querySelector('#reportDetails');
            const counterEl  = overlay.querySelector('#reportCharCount');
            const submitBtn  = overlay.querySelector('.report-modal-btn-submit');
            const cancelBtn  = overlay.querySelector('.report-modal-btn-cancel');
            const radios     = overlay.querySelectorAll('input[name="report-reason"]');

            radios.forEach(r => r.addEventListener('change', () => {
                submitBtn.disabled = false;
                overlay.querySelectorAll('.report-modal-reason').forEach(l => l.classList.remove('selected'));
                r.closest('.report-modal-reason').classList.add('selected');
            }));

            detailsEl.addEventListener('input', () => {
                counterEl.textContent = detailsEl.value.length;
            });

            function close(result) {
                overlay.remove();
                document.removeEventListener('keydown', escHandler);
                document.body.style.overflow = prevBodyOverflow;
                resolve(result);
            }
            function escHandler(e) {
                if (e.key === 'Escape') close(false);
            }
            document.addEventListener('keydown', escHandler);

            cancelBtn.addEventListener('click', () => close(false));
            overlay.addEventListener('click', (e) => { if (e.target === overlay) close(false); });

            submitBtn.addEventListener('click', async () => {
                const selected = overlay.querySelector('input[name="report-reason"]:checked');
                if (!selected) return;
                submitBtn.disabled = true;
                submitBtn.textContent = 'Submitting…';
                try {
                    await API.reports.create({
                        contentType,
                        contentId: contentId || null,
                        reportedUserId: reportedUserId || null,
                        reason: selected.value,
                        details: detailsEl.value.trim() || null
                    });
                    if (typeof showToast === 'function') {
                        showToast('Thanks for your report. Our team will review.', 'success');
                    }
                    close(true);
                } catch (err) {
                    if (typeof showToast === 'function') {
                        const msg = (err && err.message) ? err.message : 'Failed to submit report. Please try again.';
                        showToast(msg, 'error');
                    }
                    submitBtn.disabled = false;
                    submitBtn.textContent = 'Submit';
                }
            });
        });
    };

    /**
     * Fade an element out and replace it with a "reported" chip.
     * Shared so feed.js and my-profile.js use identical UX.
     */
    window.fadeAndReplaceWithReportedChip = function (cardElement) {
        if (!cardElement) return;
        injectStyles(); // ensures .reported-chip class is available
        cardElement.style.transition = 'opacity 300ms ease';
        cardElement.style.opacity = '0';
        setTimeout(() => {
            const chip = document.createElement('div');
            chip.className = 'reported-chip';
            chip.textContent = 'You reported this. Thank you for your feedback.';
            if (cardElement.parentNode) cardElement.replaceWith(chip);
        }, 300);
    };
})();
