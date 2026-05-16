/* Public Recruiting Questionnaire — vanilla JS, no auth.
   Reads ?slug=... from URL, fetches team header via API.questionnaire.get(),
   renders 7 sections, posts via API.questionnaire.submit() on submit. */

(function () {
    'use strict';

    // ---------- Constants ----------
    const STATES_50 = [
        ['AL','Alabama'],['AK','Alaska'],['AZ','Arizona'],['AR','Arkansas'],['CA','California'],
        ['CO','Colorado'],['CT','Connecticut'],['DE','Delaware'],['FL','Florida'],['GA','Georgia'],
        ['HI','Hawaii'],['ID','Idaho'],['IL','Illinois'],['IN','Indiana'],['IA','Iowa'],
        ['KS','Kansas'],['KY','Kentucky'],['LA','Louisiana'],['ME','Maine'],['MD','Maryland'],
        ['MA','Massachusetts'],['MI','Michigan'],['MN','Minnesota'],['MS','Mississippi'],['MO','Missouri'],
        ['MT','Montana'],['NE','Nebraska'],['NV','Nevada'],['NH','New Hampshire'],['NJ','New Jersey'],
        ['NM','New Mexico'],['NY','New York'],['NC','North Carolina'],['ND','North Dakota'],['OH','Ohio'],
        ['OK','Oklahoma'],['OR','Oregon'],['PA','Pennsylvania'],['RI','Rhode Island'],['SC','South Carolina'],
        ['SD','South Dakota'],['TN','Tennessee'],['TX','Texas'],['UT','Utah'],['VT','Vermont'],
        ['VA','Virginia'],['WA','Washington'],['WV','West Virginia'],['WI','Wisconsin'],['WY','Wyoming']
    ];
    const GRAD_YEARS = [2024, 2025, 2026, 2027, 2028, 2029, 2030, 2031, 2032];
    const POSITION_GROUPS = [
        { label: 'Offense - Skill', items: [['QB','Quarterback'],['RB','Running Back'],['FB','Fullback'],['WR','Wide Receiver'],['TE','Tight End']] },
        { label: 'Offense - Line', items: [['OT','Offensive Tackle'],['OG','Offensive Guard'],['C','Center']] },
        { label: 'Defense - Line', items: [['DE','Defensive End'],['DT','Defensive Tackle'],['NT','Nose Tackle']] },
        { label: 'Defense - LBs',  items: [['ILB','Inside LB'],['OLB','Outside LB']] },
        { label: 'Defense - Secondary', items: [['CB','Cornerback'],['S','Safety']] },
        { label: 'Special Teams', items: [['K','Kicker'],['P','Punter'],['LS','Long Snapper']] }
    ];
    const OTHER_SPORTS = ['Basketball','Baseball','Track and Field','Wrestling','Soccer','Lacrosse','Hockey','Volleyball','Tennis','Golf','Swimming','Rugby'];
    const MAX_PARENTS = 10;
    const MAX_VIDEO_URLS = 4;

    // ---------- State ----------
    let SCHOOL = null;
    const state = { parents: [], videoUrlIdx: 0, parentIdx: 0 };

    // ---------- DOM helpers ----------
    function $(id) { return document.getElementById(id); }
    function el(tag, attrs, ...children) {
        const node = document.createElement(tag);
        if (attrs) {
            for (const k of Object.keys(attrs)) {
                if (k === 'className') node.className = attrs[k];
                else if (k === 'innerHTML') node.innerHTML = attrs[k];
                else if (k.startsWith('on') && typeof attrs[k] === 'function') node.addEventListener(k.slice(2).toLowerCase(), attrs[k]);
                else if (attrs[k] !== '' && attrs[k] != null) node.setAttribute(k, attrs[k]);
            }
        }
        for (const c of children.flat()) {
            if (c == null) continue;
            node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
        }
        return node;
    }
    function makeSection(title, hint) {
        const sec = el('section', { className: 'q-section' });
        sec.appendChild(el('h2', { className: 'q-section-title' }, title));
        if (hint) sec.appendChild(el('p', { className: 'q-section-hint' }, hint));
        return sec;
    }
    function makeInput(opts) {
        const wrap = el('div', { className: 'q-form-group' });
        const required = opts.required ? el('span', { className: 'q-required' }, ' *') : null;
        wrap.appendChild(el('label', { className: 'q-label', for: opts.id }, opts.label, required));
        const input = el('input', {
            className: 'q-input', type: opts.type || 'text', id: opts.id, name: opts.id,
            placeholder: opts.placeholder || '', maxlength: opts.maxLength || '',
            min: opts.min != null ? opts.min : '', max: opts.max != null ? opts.max : '',
            step: opts.step != null ? opts.step : ''
        });
        wrap.appendChild(input);
        if (opts.hint) wrap.appendChild(el('small', { className: 'q-hint' }, opts.hint));
        return wrap;
    }
    function makeSelect(opts) {
        const wrap = el('div', { className: 'q-form-group' });
        wrap.appendChild(el('label', { className: 'q-label', for: opts.id }, opts.label,
            opts.required ? el('span', { className: 'q-required' }, ' *') : null));
        const sel = el('select', { className: 'q-select', id: opts.id, name: opts.id });
        sel.appendChild(el('option', { value: '' }, opts.placeholder || 'Select...'));
        for (const o of opts.options) {
            const v = Array.isArray(o) ? o[0] : o;
            const l = Array.isArray(o) ? o[1] : o;
            sel.appendChild(el('option', { value: v }, String(l)));
        }
        wrap.appendChild(sel);
        return wrap;
    }
    function makeTextarea(opts) {
        const wrap = el('div', { className: 'q-form-group' });
        wrap.appendChild(el('label', { className: 'q-label', for: opts.id }, opts.label,
            opts.required ? el('span', { className: 'q-required' }, ' *') : null));
        wrap.appendChild(el('textarea', {
            className: 'q-textarea', id: opts.id, name: opts.id,
            placeholder: opts.placeholder || '', maxlength: opts.maxLength || '', rows: opts.rows || 3
        }));
        if (opts.hint) wrap.appendChild(el('small', { className: 'q-hint' }, opts.hint));
        return wrap;
    }
    function makeRow(...groups) {
        const row = el('div', { className: 'q-form-row' });
        for (const g of groups) row.appendChild(g);
        return row;
    }

    // Multi-select with pills
    function makeMultiSelect(opts) {
        const wrap = el('div', { className: 'q-form-group' });
        wrap.appendChild(el('label', { className: 'q-label' }, opts.label,
            opts.required ? el('span', { className: 'q-required' }, ' *') : null));
        const grid = el('div', { className: 'q-multi-select' });
        const pillsDiv = el('div', { className: 'q-pills', id: opts.pillsId });

        function renderPills() {
            pillsDiv.innerHTML = '';
            const inputs = grid.querySelectorAll('input[type="checkbox"]:checked');
            inputs.forEach(function(cb) {
                const pill = el('span', { className: 'q-pill' }, cb.dataset.label,
                    el('button', { type: 'button', className: 'q-pill-x', onclick: function() {
                        cb.checked = false;
                        renderPills();
                    }}, '×'));
                pillsDiv.appendChild(pill);
            });
        }

        for (const group of opts.groups) {
            const gDiv = el('div', { className: 'q-multi-group' });
            gDiv.appendChild(el('h4', null, group.label));
            for (const item of group.items) {
                const v = Array.isArray(item) ? item[0] : item;
                const l = Array.isArray(item) ? item[1] : item;
                const labelText = Array.isArray(item) && item[1] ? `${item[1]} (${item[0]})` : String(l);
                const cb = el('input', { type: 'checkbox', name: opts.name, value: v });
                cb.dataset.label = Array.isArray(item) && item[1] ? item[0] : String(l);
                cb.addEventListener('change', renderPills);
                gDiv.appendChild(el('label', null, cb, el('span', null, labelText)));
            }
            grid.appendChild(gDiv);
        }
        wrap.appendChild(grid);
        wrap.appendChild(pillsDiv);
        return wrap;
    }

    // ---------- Section 1: Personal Information ----------
    function buildPersonalSection() {
        const sec = makeSection('Personal Information');
        sec.appendChild(makeRow(
            makeInput({ id: 'first_name', label: 'First Name', required: true, maxLength: 50 }),
            makeInput({ id: 'last_name', label: 'Last Name', required: true, maxLength: 50 })
        ));
        sec.appendChild(makeInput({ id: 'email', label: 'Email', type: 'email', required: true, maxLength: 255, placeholder: 'you@example.com' }));
        sec.appendChild(makeRow(
            makeInput({ id: 'mobile_phone', label: 'Mobile Phone', optional: true, maxLength: 20, type: 'tel' }),
            makeInput({ id: 'birth_date', label: 'Birth Date', optional: true, type: 'date' })
        ));
        sec.appendChild(makeRow(
            makeInput({ id: 'facebook_username', label: 'Facebook Username', optional: true, maxLength: 100 }),
            makeInput({ id: 'twitter_username', label: 'Twitter / X Username', optional: true, maxLength: 100 })
        ));
        sec.appendChild(makeTextarea({ id: 'hobbies', label: 'Hobbies', optional: true, maxLength: 500, placeholder: 'Hobbies and interests outside of football.' }));
        return sec;
    }

    // ---------- Section 2: Address ----------
    function buildAddressSection() {
        const sec = makeSection('Address');
        sec.appendChild(makeInput({ id: 'addr_line_1', label: 'Address Line 1', optional: true, maxLength: 200 }));
        sec.appendChild(makeInput({ id: 'addr_line_2', label: 'Address Line 2', optional: true, maxLength: 200, placeholder: 'Apt, Suite, etc.' }));
        sec.appendChild(makeRow(
            makeInput({ id: 'addr_city', label: 'City', optional: true, maxLength: 100 }),
            makeSelect({ id: 'addr_state', label: 'State', optional: true, options: STATES_50, placeholder: 'Select State' })
        ));
        sec.appendChild(makeInput({ id: 'addr_zip', label: 'Zip / Postal Code', optional: true, maxLength: 10 }));
        return sec;
    }

    // ---------- Section 3: Parents/Guardians ----------
    function buildParentBlock(idx) {
        const block = el('div', { className: 'q-parent-block' });
        block.appendChild(el('button', { type: 'button', className: 'q-parent-remove', onclick: function() {
            block.remove();
            state.parents = state.parents.filter(function(b) { return b !== block; });
            const btn = $('parentAddBtn');
            if (btn) {
                btn.disabled = state.parents.length >= MAX_PARENTS;
                btn.textContent = state.parents.length >= MAX_PARENTS ? `+ Add Parent/Guardian (max ${MAX_PARENTS})` : '+ Add Parent/Guardian';
            }
        }}, 'Remove'));
        block.appendChild(makeRow(
            makeInput({ id: `parent_${idx}_first_name`, label: 'First Name', optional: true, maxLength: 50 }),
            makeInput({ id: `parent_${idx}_last_name`, label: 'Last Name', optional: true, maxLength: 50 })
        ));
        block.appendChild(makeRow(
            makeInput({ id: `parent_${idx}_email`, label: 'Email', type: 'email', optional: true, maxLength: 255 }),
            makeInput({ id: `parent_${idx}_phone`, label: 'Phone', type: 'tel', optional: true, maxLength: 20 })
        ));
        block.appendChild(makeRow(
            makeInput({ id: `parent_${idx}_employment`, label: 'Employment', optional: true, maxLength: 200 }),
            makeInput({ id: `parent_${idx}_college`, label: 'College Attended', optional: true, maxLength: 200 })
        ));
        return block;
    }
    function buildParentsSection() {
        const sec = makeSection('Parents / Guardians', 'Optional — add as many as you\'d like.');
        const list = el('div', { id: 'parentsList' });
        sec.appendChild(list);
        sec.appendChild(el('button', { type: 'button', id: 'parentAddBtn', className: 'q-add-btn', onclick: function() {
            if (state.parents.length >= MAX_PARENTS) return;
            const idx = state.parentIdx++;
            const block = buildParentBlock(idx);
            list.appendChild(block);
            state.parents.push(block);
            const btn = $('parentAddBtn');
            btn.disabled = state.parents.length >= MAX_PARENTS;
            btn.textContent = state.parents.length >= MAX_PARENTS ? `+ Add Parent/Guardian (max ${MAX_PARENTS})` : '+ Add Parent/Guardian';
        }}, '+ Add Parent/Guardian'));
        return sec;
    }

    // ---------- Section 4: Family ----------
    function buildFamilySection() {
        const sec = makeSection('Family');
        sec.appendChild(makeTextarea({
            id: 'siblings', label: 'Siblings', optional: true, maxLength: 1000, rows: 4,
            placeholder: 'Names, ages, sports they play, schools, etc.'
        }));
        return sec;
    }

    // ---------- Section 5: Academic ----------
    function buildAcademicSection() {
        const sec = makeSection('Academic');
        sec.appendChild(makeRow(
            makeInput({ id: 'high_school', label: 'High School Name', optional: true, maxLength: 200 }),
            makeSelect({ id: 'graduation_year', label: 'Graduation Year', optional: true, options: GRAD_YEARS.map(function(y) { return [y, y]; }), placeholder: 'Select Year' })
        ));
        sec.appendChild(makeRow(
            makeInput({ id: 'gpa', label: 'GPA', optional: true, type: 'number', min: 0, max: 5, step: 0.01, placeholder: 'e.g., 3.75' }),
            makeInput({ id: 'intended_major', label: 'Intended Major', optional: true, maxLength: 200 })
        ));

        // NCAA registration radio + conditional NCAA ID
        const ncaaGroup = el('div', { className: 'q-form-group' });
        ncaaGroup.appendChild(el('label', { className: 'q-label' }, 'Registered with the NCAA Eligibility Center?'));
        const radioRow = el('div', { className: 'q-radio-row' });
        radioRow.appendChild(el('label', { className: 'q-radio-label' },
            el('input', { type: 'radio', name: 'ncaa_registered', value: 'no', checked: 'checked' }), el('span', null, 'No')));
        radioRow.appendChild(el('label', { className: 'q-radio-label' },
            el('input', { type: 'radio', name: 'ncaa_registered', value: 'yes' }), el('span', null, 'Yes')));
        ncaaGroup.appendChild(radioRow);
        const conditional = el('div', { className: 'q-conditional', id: 'ncaaIdConditional' });
        conditional.appendChild(makeInput({ id: 'ncaa_id', label: 'NCAA ID', optional: true, maxLength: 20, placeholder: 'Your NCAA Eligibility Center ID' }));
        ncaaGroup.appendChild(conditional);
        sec.appendChild(ncaaGroup);

        sec.appendChild(makeRow(
            makeInput({ id: 'sat_score', label: 'SAT Score', optional: true, type: 'number', min: 400, max: 1600 }),
            makeInput({ id: 'act_score', label: 'ACT Score', optional: true, type: 'number', min: 1, max: 36 })
        ));
        sec.appendChild(makeTextarea({ id: 'academic_honors', label: 'Academic Honors', optional: true, maxLength: 500, placeholder: 'Honors, awards, GPA distinctions, etc.' }));
        return sec;
    }

    // ---------- Section 6: Athletic ----------
    function buildAthleticSection() {
        const sec = makeSection('Athletic');

        sec.appendChild(makeMultiSelect({
            name: 'position', pillsId: 'positionsPills', label: 'Position(s)', optional: true,
            groups: POSITION_GROUPS
        }));

        // Height ft/in + weight
        const heightWeight = el('div', { className: 'q-form-row' });

        const heightGroup = el('div', { className: 'q-form-group' });
        heightGroup.appendChild(el('label', { className: 'q-label' }, 'Height'));
        const heightRow = el('div', { className: 'q-height-row' });
        const ftCell = el('div', { className: 'q-height-cell' });
        ftCell.appendChild(el('input', { className: 'q-input', type: 'number', id: 'height_ft', name: 'height_ft', min: 0, max: 8, placeholder: 'Ft' }));
        ftCell.appendChild(el('span', { className: 'q-height-unit' }, 'ft'));
        const inCell = el('div', { className: 'q-height-cell' });
        inCell.appendChild(el('input', { className: 'q-input', type: 'number', id: 'height_in', name: 'height_in', min: 0, max: 11, placeholder: 'In' }));
        inCell.appendChild(el('span', { className: 'q-height-unit' }, 'in'));
        heightRow.appendChild(ftCell);
        heightRow.appendChild(inCell);
        heightGroup.appendChild(heightRow);
        heightWeight.appendChild(heightGroup);

        heightWeight.appendChild(makeInput({ id: 'weight_lbs', label: 'Weight (lbs)', optional: true, type: 'number', min: 50, max: 450 }));
        sec.appendChild(heightWeight);

        sec.appendChild(makeRow(
            makeInput({ id: 'track_100m', label: '100m Time (sec)', optional: true, type: 'number', min: 0, max: 30, step: 0.01 }),
            makeInput({ id: 'track_200m', label: '200m Time (sec)', optional: true, type: 'number', min: 0, max: 60, step: 0.01 })
        ));

        const liftRow = el('div', { className: 'q-form-row q-form-row-3' });
        liftRow.appendChild(makeInput({ id: 'power_clean_lbs', label: 'Power Clean (lbs)', optional: true, type: 'number', min: 0, max: 800 }));
        liftRow.appendChild(makeInput({ id: 'bench_lbs', label: 'Bench Press (lbs)', optional: true, type: 'number', min: 0, max: 800 }));
        liftRow.appendChild(makeInput({ id: 'squat_lbs', label: 'Squat (lbs)', optional: true, type: 'number', min: 0, max: 800 }));
        sec.appendChild(liftRow);

        sec.appendChild(makeTextarea({ id: 'athletic_honors', label: 'Athletic Honors', optional: true, maxLength: 500, placeholder: 'All-conference, MVP, awards, etc.' }));

        sec.appendChild(makeMultiSelect({
            name: 'other_sport', pillsId: 'sportsPills', label: 'Other Sports Played', optional: true,
            groups: [{ label: 'Select Sports', items: OTHER_SPORTS }]
        }));

        return sec;
    }

    // ---------- Section 7: Film & Videos ----------
    function buildFilmSection() {
        const sec = makeSection('Film & Recruiting Videos', 'Add Hudl, YouTube, or other links to your highlight film.');
        const list = el('div', { id: 'videoUrlsList' });
        sec.appendChild(list);

        function addUrlRow() {
            if (state.videoUrlIdx >= MAX_VIDEO_URLS) return;
            const idx = state.videoUrlIdx++;
            const row = el('div', { className: 'q-url-row' });
            row.appendChild(el('input', {
                className: 'q-input', type: 'url', id: `video_url_${idx}`, name: 'video_url',
                placeholder: 'https://hudl.com/...', maxlength: 500
            }));
            row.appendChild(el('button', { type: 'button', className: 'q-url-remove', onclick: function() {
                row.remove();
                state.videoUrlIdx--;
                const btn = $('addVideoUrlBtn');
                if (btn) btn.disabled = state.videoUrlIdx >= MAX_VIDEO_URLS;
            }}, 'Remove'));
            list.appendChild(row);
            const btn = $('addVideoUrlBtn');
            if (btn) btn.disabled = state.videoUrlIdx >= MAX_VIDEO_URLS;
        }

        sec.appendChild(el('button', { type: 'button', id: 'addVideoUrlBtn', className: 'q-add-btn', onclick: addUrlRow }, '+ Add Video Link'));
        // Pre-add one row for convenience
        addUrlRow();
        return sec;
    }

    // ---------- Collect form data into submission_data ----------
    function collectFormData() {
        function v(id) { const e = $(id); return e ? e.value.trim() : ''; }
        function n(id) { const e = $(id); if (!e || e.value === '') return null; const x = Number(e.value); return Number.isFinite(x) ? x : null; }

        const checkedRadio = document.querySelector('input[name="ncaa_registered"]:checked');
        const ncaaRegistered = checkedRadio ? checkedRadio.value === 'yes' : false;

        const positions = Array.from(document.querySelectorAll('input[name="position"]:checked')).map(function(c) { return c.value; });
        const otherSports = Array.from(document.querySelectorAll('input[name="other_sport"]:checked')).map(function(c) { return c.value; });

        // Parents
        const parents = state.parents.map(function(block) {
            function pv(field) { const e = block.querySelector(`[name^="parent_"][name$="_${field}"]`); return e ? e.value.trim() : ''; }
            return {
                first_name: pv('first_name'), last_name: pv('last_name'),
                email: pv('email'), phone: pv('phone'),
                employment: pv('employment'), college: pv('college')
            };
        });

        // Videos
        const videoUrls = Array.from(document.querySelectorAll('input[name="video_url"]'))
            .map(function(i) { return i.value.trim(); })
            .filter(function(u) { return u.length > 0; });

        // Height in inches
        const ft = n('height_ft');
        const inch = n('height_in');
        const heightInches = (ft != null || inch != null) ? ((ft || 0) * 12 + (inch || 0)) : null;

        return {
            personal: {
                first_name: v('first_name'),
                last_name: v('last_name'),
                email: v('email').toLowerCase(),
                mobile_phone: v('mobile_phone') || null,
                birth_date: v('birth_date') || null,
                facebook_username: v('facebook_username') || null,
                twitter_username: v('twitter_username') || null,
                hobbies: v('hobbies') || null
            },
            address: {
                line_1: v('addr_line_1') || null,
                line_2: v('addr_line_2') || null,
                city: v('addr_city') || null,
                state: v('addr_state') || null,
                zip: v('addr_zip') || null
            },
            parents: parents,
            family: { siblings: v('siblings') || null },
            academic: {
                high_school: v('high_school') || null,
                graduation_year: n('graduation_year'),
                gpa: n('gpa'),
                intended_major: v('intended_major') || null,
                ncaa_registered: ncaaRegistered,
                ncaa_id: ncaaRegistered ? (v('ncaa_id') || null) : null,
                sat_score: n('sat_score'),
                act_score: n('act_score'),
                honors: v('academic_honors') || null,
                transcript_s3_keys: [],
                test_score_s3_keys: []
            },
            athletic: {
                positions: positions.join('/') || null,
                height_inches: heightInches,
                weight_lbs: n('weight_lbs'),
                track_100m: n('track_100m'),
                track_200m: n('track_200m'),
                power_clean_lbs: n('power_clean_lbs'),
                bench_lbs: n('bench_lbs'),
                squat_lbs: n('squat_lbs'),
                honors: v('athletic_honors') || null,
                other_sports: otherSports
            },
            film: {
                video_urls: videoUrls,
                video_s3_keys: []
            }
        };
    }

    // ---------- Init / boot ----------
    function showError() {
        $('qLoading').style.display = 'none';
        $('qContainer').style.display = 'none';
        $('qErrorState').style.display = 'flex';
    }
    function showForm() {
        $('qLoading').style.display = 'none';
        $('qErrorState').style.display = 'none';
        $('qContainer').style.display = 'block';
    }

    async function renderHeader() {
        try {
            if (typeof ensureSchoolLogosLoaded === 'function') {
                await ensureSchoolLogosLoaded('../assets');
            }
        } catch (_) { /* logo lookup is best-effort */ }
        const logoWrap = $('qSchoolLogo');
        if (typeof getSchoolLogoHTML === 'function') {
            logoWrap.innerHTML = getSchoolLogoHTML(SCHOOL.team_name, '../assets', 140) || '';
        }
        $('qSchoolName').textContent = SCHOOL.team_name || 'This Program';
        $('qMicrocopy').textContent = `${SCHOOL.team_name || 'This program'} will receive your submission. Fields marked * are required.`;
    }

    function renderForm() {
        const body = $('qFormBody');
        body.innerHTML = '';
        body.appendChild(buildPersonalSection());
        body.appendChild(buildAddressSection());
        body.appendChild(buildParentsSection());
        body.appendChild(buildFamilySection());
        body.appendChild(buildAcademicSection());
        body.appendChild(buildAthleticSection());
        body.appendChild(buildFilmSection());

        // Wire conditional NCAA ID field
        document.querySelectorAll('input[name="ncaa_registered"]').forEach(function(r) {
            r.addEventListener('change', function() {
                $('ncaaIdConditional').classList.toggle('q-show', this.value === 'yes' && this.checked);
            });
        });
    }

    function wireSubmit() {
        const form = $('qForm');
        form.addEventListener('submit', async function(ev) {
            ev.preventDefault();
            const btn = $('qSubmitBtn');
            const submissionData = collectFormData();
            // Client-side required-field check
            if (!submissionData.personal.first_name || !submissionData.personal.last_name || !submissionData.personal.email) {
                if (typeof showToast === 'function') showToast('First name, last name, and email are required.', 'error');
                return;
            }
            const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRe.test(submissionData.personal.email)) {
                if (typeof showToast === 'function') showToast('Please enter a valid email address.', 'error');
                return;
            }

            btn.disabled = true;
            btn.textContent = 'Submitting...';
            try {
                const slug = getSlug();
                await API.questionnaire.submit(slug, { submission_data: submissionData });
                // Swap to thank-you state
                $('qForm').style.display = 'none';
                $('qThankYou').style.display = 'block';
                $('qThankYouMessage').textContent = `${SCHOOL.team_name}'s coaching staff has received your submission and will review it.`;
                $('qThankYouHeading').textContent = `Thanks for submitting your questionnaire to ${SCHOOL.team_name}!`;
                $('qSignupCta').href = `../landingpage/get-started.html?email=${encodeURIComponent(submissionData.personal.email)}`;
                window.scrollTo({ top: 0, behavior: 'smooth' });
            } catch (err) {
                btn.disabled = false;
                btn.textContent = 'Submit Questionnaire';
                if (typeof showToast === 'function') showToast(err.message || 'Submission failed. Please try again.', 'error');
            }
        });
    }

    function getSlug() {
        const params = new URLSearchParams(window.location.search);
        const s = (params.get('slug') || '').trim().toLowerCase();
        return s || null;
    }

    async function boot() {
        const slug = getSlug();
        if (!slug) { showError(); return; }
        try {
            const resp = await API.questionnaire.get(slug);
            SCHOOL = resp.school || { team_name: '' };
            await renderHeader();
            renderForm();
            wireSubmit();
            showForm();
        } catch (err) {
            showError();
        }
    }

    document.addEventListener('DOMContentLoaded', boot);
})();
