// ============================================================
// MATCH UI — shared multi-select renderer for AI Fit-Matching fields
// ============================================================
// Renders grouped or flat checkbox multi-selects from MATCH_CONSTANTS into
// the existing .multi-select-container / .checkbox-label / .selected-items
// chip pattern used by the position picker — so the new major / levels /
// regions pickers look and behave identically to what's already on the form.
//
// Data source: window.MATCH_CONSTANTS (frontend/shared/match-constants.js).
// Load order in HTML: api.js -> match-constants.js -> match-ui.js -> form JS.
//
// Used by the player create/edit forms (Plan 2/5) AND the coach form (Plan 3)
// — same renderer, so the 53-major list stays in sync from one source.
//
// PUBLIC API (all attached to window):
//   initMatchMultiSelect(opts) -> controller
//     opts.container   : selector or element for the checkbox area
//     opts.chips       : selector or element for the .selected-items chip area
//     opts.options     : flat array of string values  (use for levels/regions), OR
//     opts.groups      : [{group, majors:[...]}] grouped array (use for majors)
//     opts.max         : optional integer cap (e.g. 3 for majors); omit = unlimited
//     opts.capHintEl   : optional selector/element to show a "max reached" hint
//     opts.name        : input name attribute (default 'mms')
//     opts.preselected : optional array of values to pre-check (Plan 5 edit mode)
//   returns { getSelected(), setSelected(arr), clear() }
// ============================================================

(function () {
  function _el(ref) {
    if (!ref) return null;
    return typeof ref === 'string' ? document.querySelector(ref) : ref;
  }

  function initMatchMultiSelect(opts) {
    const container = _el(opts.container);
    const chips = _el(opts.chips);
    if (!container) {
      console.warn('[match-ui] container not found:', opts.container);
      return { getSelected: () => [], setSelected: () => {}, clear: () => {} };
    }

    const name = opts.name || 'mms';
    const max = Number.isInteger(opts.max) ? opts.max : null;
    const capHintEl = _el(opts.capHintEl);
    let selected = [];

    // ---- Build the checkbox DOM (grouped or flat) ----
    container.innerHTML = '';
    const groups = opts.groups
      ? opts.groups.map(g => ({ label: g.group, values: g.majors }))
      : [{ label: null, values: opts.options || [] }];

    groups.forEach(g => {
      const groupDiv = document.createElement('div');
      groupDiv.className = 'multi-select-group';
      if (g.label) {
        const h = document.createElement('h4');
        h.className = 'group-label';
        h.textContent = g.label; // textContent — never innerHTML on data (lesson #114)
        groupDiv.appendChild(h);
      }
      g.values.forEach(value => {
        const label = document.createElement('label');
        label.className = 'checkbox-label';
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.name = name;
        input.value = value;
        const span = document.createElement('span');
        span.textContent = value;
        label.appendChild(input);
        label.appendChild(span);
        groupDiv.appendChild(label);
        input.addEventListener('change', function () {
          if (this.checked) {
            if (max !== null && selected.length >= max) {
              this.checked = false; // enforce cap
              return;
            }
            selected.push(value);
          } else {
            selected = selected.filter(v => v !== value);
          }
          _refresh();
        });
      });
      container.appendChild(groupDiv);
    });

    function _checkboxes() {
      return Array.from(container.querySelectorAll(`input[name="${name}"]`));
    }

    function _refresh() {
      // Chips
      if (chips) {
        chips.innerHTML = '';
        selected.forEach(value => {
          const pill = document.createElement('div');
          pill.className = 'selected-item';
          pill.appendChild(document.createTextNode(value + ' '));
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'remove-item';
          btn.textContent = '×';
          btn.addEventListener('click', function () {
            selected = selected.filter(v => v !== value);
            const cb = container.querySelector(`input[name="${name}"][value="${CSS.escape(value)}"]`);
            if (cb) cb.checked = false;
            _refresh();
          });
          pill.appendChild(btn);
          chips.appendChild(pill);
        });
      }
      // Cap: disable unchecked boxes once max reached; toggle hint
      if (max !== null) {
        const atCap = selected.length >= max;
        _checkboxes().forEach(cb => { if (!cb.checked) cb.disabled = atCap; });
        if (capHintEl) capHintEl.style.display = atCap ? '' : 'none';
      }
    }

    function setSelected(arr) {
      selected = [];
      _checkboxes().forEach(cb => { cb.checked = false; });
      (arr || []).forEach(value => {
        if (max !== null && selected.length >= max) return;
        const cb = container.querySelector(`input[name="${name}"][value="${CSS.escape(value)}"]`);
        if (cb) { cb.checked = true; selected.push(value); }
      });
      _refresh();
    }

    if (opts.preselected) setSelected(opts.preselected);
    else _refresh();

    return {
      getSelected: () => selected.slice(),
      setSelected,
      clear: () => setSelected([])
    };
  }

  if (typeof window !== 'undefined') {
    window.initMatchMultiSelect = initMatchMultiSelect;
  }
})();
