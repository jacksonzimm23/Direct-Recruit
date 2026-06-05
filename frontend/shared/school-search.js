/**
 * Shared School Search Module
 *
 * Provides fuzzy-search school lookup with logo preview and auto-division fill.
 * Includes "Can't find your school?" toggle to switch to manual text entry.
 * Uses frontend/assets/school-logos.json (828 schools with division + logo data).
 *
 * Usage:
 *   const search = initSchoolSearch({
 *       nameInput: '#collegeName',
 *       divisionSelect: '#division',
 *       assetBasePath: '../assets'
 *   });
 *   // For edit forms with existing data:
 *   search.preselectSchool('University of Alabama');
 */

// Module-level cache (shared across all instances on a page)
let _schoolLogosData = null;
let _schoolNamesList = [];
let _loadPromise = null;

async function _loadSchoolLogosData(basePath) {
    if (_schoolLogosData) return _schoolLogosData;
    if (_loadPromise) return _loadPromise;
    _loadPromise = (async () => {
        try {
            const response = await fetch(`${basePath}/school-logos.json`);
            _schoolLogosData = await response.json();
            _schoolNamesList = Object.keys(_schoolLogosData).sort((a, b) => a.localeCompare(b));
            return _schoolLogosData;
        } catch (error) {
            console.error('Error loading school logos data:', error);
            _loadPromise = null;
            return null;
        }
    })();
    return _loadPromise;
}

function _fuzzyMatchSchool(query, schoolName) {
    const queryLower = query.toLowerCase();
    const nameLower = schoolName.toLowerCase();

    if (nameLower.includes(queryLower)) return 3;

    const queryWords = queryLower.split(/\s+/).filter(Boolean);
    if (queryWords.every(w => nameLower.includes(w))) return 2;

    const matchCount = queryWords.filter(w => nameLower.includes(w)).length;
    if (matchCount > 0 && matchCount >= queryWords.length - 1) return 1;

    return 0;
}

function _getLogoPath(basePath, logoFile) {
    if (!logoFile) return null;
    return `${basePath}/logos/${logoFile}`;
}

/**
 * Ensure school logos JSON is loaded (call early on pages that display school logos).
 * Safe to call multiple times — data is cached after first load.
 */
async function ensureSchoolLogosLoaded(assetBasePath) {
    if (!_schoolLogosData) await _loadSchoolLogosData(assetBasePath);
}

/**
 * Get a small inline school logo <img> tag for a given school name.
 * Returns empty string if school not found in JSON or data not yet loaded.
 * @param {string} schoolName - The team_name / school name to look up
 * @param {string} assetBasePath - Relative path to assets/ from current page
 * @param {number} [size=18] - Logo size in pixels
 * @returns {string} HTML string — either an <img> tag or ''
 */
function getSchoolLogoHTML(schoolName, assetBasePath, size) {
    size = size || 18;
    if (!schoolName || !_schoolLogosData) return '';
    const school = _schoolLogosData[schoolName];
    if (!school || !school.logo) return '';
    const src = `${assetBasePath}/logos/${school.logo}`;
    // Solid white backing that hugs the logo's actual shape (not a square box).
    // Zero-offset drop-shadows respect the PNG alpha channel and radiate evenly
    // around the silhouette. Stacking the SAME zero-offset shadow several times
    // compounds opacity on the exact same halo — so the edge reads as crisp
    // white (not a dim, navy-tinted blur) with no overlapping/gray seams.
    const halo = 'filter:drop-shadow(0 0 1px #fff) drop-shadow(0 0 1px #fff) drop-shadow(0 0 1px #fff);';
    return `<img src="${src}" alt="" class="school-logo-icon" style="width:${size}px;height:${size}px;object-fit:contain;vertical-align:middle;margin-left:4px;border-radius:2px;${halo}">`;
}

const _fallbackSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 10v6M2 10l10-5 10 5-10 5z"></path><path d="M6 12v5c3 3 9 3 12 0v-5"></path></svg>';

const _clearSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';

/**
 * Initialize school search on an existing college name input.
 *
 * The module creates two modes:
 *   1. Search mode (default): fuzzy-search dropdown with logos, auto-fills division
 *   2. Manual mode: plain text input + the existing division <select> becomes visible
 *
 * A "Can't find your school?" link toggles between modes.
 *
 * @param {Object} config
 * @param {string|HTMLElement} config.nameInput - Selector or element for the college name text input
 * @param {string|HTMLElement|null} config.divisionSelect - Selector or element for the division <select> (auto-filled on selection, shown in manual mode)
 * @param {string} config.assetBasePath - Relative path to the assets/ folder from this page
 * @param {Function|null} config.onSelect - Callback when a school is selected: onSelect({ name, division, logo })
 * @param {Function|null} config.onClear - Callback when selection is cleared
 * @returns {{ preselectSchool: Function, clearSelection: Function, getSelectedSchool: Function, isManualMode: Function, destroy: Function }}
 */
function initSchoolSearch(config) {
    const { assetBasePath, onSelect, onClear } = config;

    const nameInput = typeof config.nameInput === 'string'
        ? document.querySelector(config.nameInput) : config.nameInput;
    const divisionSelect = config.divisionSelect
        ? (typeof config.divisionSelect === 'string'
            ? document.querySelector(config.divisionSelect) : config.divisionSelect)
        : null;

    if (!nameInput) {
        console.error('initSchoolSearch: nameInput not found', config.nameInput);
        return null;
    }

    // Instance state
    let selectedSchool = null;
    let manualMode = false;

    // --- Find the division select's parent .form-group for hiding/showing ---
    const divisionFormGroup = divisionSelect ? divisionSelect.closest('.form-group') : null;

    // --- Build DOM structure ---
    // Wrap the input in a .school-search-wrapper
    const wrapper = document.createElement('div');
    wrapper.className = 'school-search-wrapper';
    nameInput.parentNode.insertBefore(wrapper, nameInput);
    wrapper.appendChild(nameInput);

    // Add autocomplete="off" to prevent browser autocomplete interfering
    nameInput.setAttribute('autocomplete', 'off');

    // Create dropdown
    const dropdown = document.createElement('div');
    dropdown.className = 'school-search-dropdown';
    wrapper.appendChild(dropdown);

    // Create preview strip (hidden initially)
    const preview = document.createElement('div');
    preview.className = 'school-preview';
    preview.style.display = 'none';
    preview.innerHTML = `
        <div class="school-preview-logo"></div>
        <div class="school-preview-info">
            <div class="school-preview-name"></div>
            <div class="school-preview-division"></div>
        </div>
        <button type="button" class="school-preview-clear" title="Change school">${_clearSvg}</button>
    `;
    // Insert preview after the wrapper
    wrapper.parentNode.insertBefore(preview, wrapper.nextSibling);

    const previewLogo = preview.querySelector('.school-preview-logo');
    const previewName = preview.querySelector('.school-preview-name');
    const previewDivision = preview.querySelector('.school-preview-division');
    const previewClear = preview.querySelector('.school-preview-clear');

    // Create "Can't find your school?" button (shown in search mode)
    const cantFindBtn = document.createElement('button');
    cantFindBtn.type = 'button';
    cantFindBtn.className = 'school-cant-find-btn';
    cantFindBtn.textContent = "Can't find your school? Enter manually";
    preview.parentNode.insertBefore(cantFindBtn, preview.nextSibling);

    // Create "Back to school search" button (shown in manual mode, hidden initially)
    const backToSearchBtn = document.createElement('button');
    backToSearchBtn.type = 'button';
    backToSearchBtn.className = 'school-back-to-search-btn';
    backToSearchBtn.textContent = 'Back to school search';
    backToSearchBtn.style.display = 'none';
    cantFindBtn.parentNode.insertBefore(backToSearchBtn, cantFindBtn.nextSibling);

    // In search mode, hide the division select (it gets auto-filled)
    if (divisionFormGroup) {
        divisionFormGroup.style.display = 'none';
    }

    // --- Load data ---
    _loadSchoolLogosData(assetBasePath);

    // --- Render dropdown ---
    function renderDropdown(query) {
        if (!_schoolLogosData) return;

        let items;
        if (!query || query.length < 1) {
            items = _schoolNamesList.map(name => ({ name }));
        } else {
            items = [];
            for (const name of _schoolNamesList) {
                const score = _fuzzyMatchSchool(query, name);
                if (score > 0) items.push({ name, score });
            }
            items.sort((a, b) => (b.score - a.score) || a.name.localeCompare(b.name));
        }

        if (items.length === 0) {
            dropdown.innerHTML = '<div class="school-dropdown-empty">No schools found</div>';
            dropdown.classList.add('active');
            return;
        }

        dropdown.innerHTML = items.map(({ name }) => {
            const school = _schoolLogosData[name];
            const logoPath = _getLogoPath(assetBasePath, school.logo);
            const logoHTML = logoPath
                ? `<img src="${logoPath}" alt="" class="school-dropdown-logo">`
                : `<span class="school-dropdown-logo-svg">${_fallbackSvg}</span>`;
            return `<div class="school-dropdown-item" data-school-name="${name.replace(/"/g, '&quot;')}">
                ${logoHTML}
                <div class="school-dropdown-info">
                    <span class="school-dropdown-name">${name}</span>
                    <span class="school-dropdown-division">${school.division || ''}</span>
                </div>
            </div>`;
        }).join('');
        dropdown.classList.add('active');
    }

    // --- Select a school ---
    function doSelect(schoolName) {
        const school = _schoolLogosData[schoolName];
        if (!school) return;

        selectedSchool = {
            name: schoolName,
            division: school.division || '',
            logo: school.logo || null
        };

        // Set the input value
        nameInput.value = schoolName;

        // Auto-fill division select
        if (divisionSelect && selectedSchool.division) {
            divisionSelect.value = selectedSchool.division;
        }

        // Close dropdown
        dropdown.classList.remove('active');

        // Hide search input, show preview
        wrapper.style.display = 'none';
        cantFindBtn.style.display = 'none';

        const logoPath = _getLogoPath(assetBasePath, selectedSchool.logo);
        previewLogo.innerHTML = logoPath
            ? `<img src="${logoPath}" alt="${schoolName}">`
            : _fallbackSvg;
        previewName.textContent = schoolName;
        previewDivision.textContent = selectedSchool.division;
        preview.style.display = 'flex';

        // Keep division hidden — it's auto-filled
        if (divisionFormGroup) divisionFormGroup.style.display = 'none';

        if (onSelect) onSelect(selectedSchool);
    }

    // --- Clear selection (back to search mode) ---
    function doClear() {
        selectedSchool = null;
        preview.style.display = 'none';
        wrapper.style.display = '';
        cantFindBtn.style.display = '';
        backToSearchBtn.style.display = 'none';
        nameInput.value = '';
        nameInput.focus();
        if (divisionSelect) divisionSelect.value = '';
        // Keep division hidden in search mode
        if (divisionFormGroup) divisionFormGroup.style.display = 'none';
        manualMode = false;
        if (onClear) onClear();
    }

    // --- Switch to manual mode ---
    function switchToManual() {
        manualMode = true;
        selectedSchool = null;
        dropdown.classList.remove('active');
        preview.style.display = 'none';
        wrapper.style.display = 'none';
        cantFindBtn.style.display = 'none';
        backToSearchBtn.style.display = '';

        // Create a manual text input if it doesn't exist yet
        if (!wrapper.parentNode.querySelector('.school-manual-input')) {
            const manualInput = document.createElement('input');
            manualInput.type = 'text';
            manualInput.className = 'school-manual-input';
            manualInput.placeholder = nameInput.placeholder || 'Enter college or university name';
            manualInput.required = nameInput.required;
            // Copy over styling classes from original input
            if (nameInput.className) {
                manualInput.className = nameInput.className + ' school-manual-input';
            }
            wrapper.parentNode.insertBefore(manualInput, backToSearchBtn);

            // Sync manual input value to the real nameInput so form submission works
            manualInput.addEventListener('input', () => {
                nameInput.value = manualInput.value;
            });
        }

        const manualInput = wrapper.parentNode.querySelector('.school-manual-input');
        manualInput.style.display = '';
        manualInput.value = '';
        nameInput.value = '';
        if (divisionSelect) divisionSelect.value = '';

        // Show division select for manual selection
        if (divisionFormGroup) divisionFormGroup.style.display = '';

        manualInput.focus();
    }

    // --- Switch back to search mode ---
    function switchToSearch() {
        manualMode = false;
        selectedSchool = null;

        // Hide manual input
        const manualInput = wrapper.parentNode.querySelector('.school-manual-input');
        if (manualInput) manualInput.style.display = 'none';

        // Show search input
        wrapper.style.display = '';
        cantFindBtn.style.display = '';
        backToSearchBtn.style.display = 'none';

        // Hide division (auto-filled in search mode)
        if (divisionFormGroup) divisionFormGroup.style.display = 'none';

        nameInput.value = '';
        if (divisionSelect) divisionSelect.value = '';
        nameInput.focus();
    }

    // --- Event listeners ---
    function onInput() {
        if (selectedSchool && nameInput.value !== selectedSchool.name) {
            selectedSchool = null;
            preview.style.display = 'none';
            wrapper.style.display = '';
            cantFindBtn.style.display = '';
        }
        renderDropdown(nameInput.value.trim());
    }

    function onFocus() {
        if (_schoolLogosData && !selectedSchool) {
            renderDropdown(nameInput.value.trim());
        }
    }

    function onDropdownClick(e) {
        const item = e.target.closest('.school-dropdown-item');
        if (item) {
            doSelect(item.dataset.schoolName);
        }
    }

    function onDocumentClick(e) {
        if (!e.target.closest('.school-search-wrapper')) {
            dropdown.classList.remove('active');
        }
    }

    function onPreviewClearClick() {
        doClear();
    }

    nameInput.addEventListener('input', onInput);
    nameInput.addEventListener('focus', onFocus);
    dropdown.addEventListener('click', onDropdownClick);
    document.addEventListener('click', onDocumentClick);
    previewClear.addEventListener('click', onPreviewClearClick);
    cantFindBtn.addEventListener('click', switchToManual);
    backToSearchBtn.addEventListener('click', switchToSearch);

    // --- Public API ---
    return {
        /**
         * Pre-select a school by name (for edit forms with existing data).
         * Shows the logo preview if the school is in the JSON.
         * If not in JSON, switches to manual mode with the name pre-filled.
         */
        preselectSchool(schoolName) {
            if (!schoolName) return;
            _loadSchoolLogosData(assetBasePath).then(data => {
                if (data && data[schoolName]) {
                    doSelect(schoolName);
                } else if (schoolName) {
                    // School not in JSON — show in manual mode with value pre-filled
                    switchToManual();
                    const manualInput = wrapper.parentNode.querySelector('.school-manual-input');
                    if (manualInput) manualInput.value = schoolName;
                    nameInput.value = schoolName;
                }
            });
        },

        /** Clear the current selection and reset to search mode. */
        clearSelection() {
            doClear();
        },

        /** Get the currently selected school object, or null. */
        getSelectedSchool() {
            return selectedSchool;
        },

        /** Check if currently in manual entry mode. */
        isManualMode() {
            return manualMode;
        },

        /** Remove all event listeners and injected DOM. */
        destroy() {
            nameInput.removeEventListener('input', onInput);
            nameInput.removeEventListener('focus', onFocus);
            dropdown.removeEventListener('click', onDropdownClick);
            document.removeEventListener('click', onDocumentClick);
            previewClear.removeEventListener('click', onPreviewClearClick);
            cantFindBtn.removeEventListener('click', switchToManual);
            backToSearchBtn.removeEventListener('click', switchToSearch);

            // Unwrap the input
            if (wrapper.parentNode) {
                wrapper.parentNode.insertBefore(nameInput, wrapper);
                wrapper.remove();
            }
            preview.remove();
            cantFindBtn.remove();
            backToSearchBtn.remove();
            const manualInput = nameInput.parentNode?.querySelector('.school-manual-input');
            if (manualInput) manualInput.remove();

            // Restore division visibility
            if (divisionFormGroup) divisionFormGroup.style.display = '';
        }
    };
}
