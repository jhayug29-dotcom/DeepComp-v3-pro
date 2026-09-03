// ═══════════════════════════════════════════════════════════════════════════════
//  DeepComp – main.js
// ═══════════════════════════════════════════════════════════════════════════════

// ─── CEP SETUP ────────────────────────────────────────────────────────────────
let csInterface;
try { csInterface = new CSInterface(); } catch(e) { console.log("Not in CEP environment"); }

function getExtensionRoot() {
    return csInterface ? csInterface.getSystemPath("extension") : "";
}

// Returns the user-writable library path (AppData on Windows, ~/Library on Mac).
// Must match getUserLibraryRoot() in hostscript.jsx exactly.
function getUserLibraryRoot() {
    // Use the real OS application-data location instead of relying on the
    // ambiguous CEP userData path. This keeps JS and ExtendScript in lockstep.
    try {
        const isWin = (typeof process !== 'undefined') && process.platform === 'win32';
        if (isWin) {
            const appData = process.env.APPDATA || process.env.LOCALAPPDATA || '';
            if (appData) return appData.replace(/[\\\/]+$/, '') + '\\DeepComp\\yugz.fx';
        } else {
            const home = process.env.HOME || '';
            if (home) return home.replace(/[\\\/]+$/, '') + '/Library/Application Support/DeepComp/yugz.fx';
        }
    } catch (e) {}
    return '';
}

function evalScript(script, callback) {
    if (csInterface) {
        csInterface.evalScript(script, callback);
    } else {
        console.log("Mock evalScript:", script);
        if (callback) callback("");
    }
}


// The ExtendScript side is the source of truth for the library path. CEP and
// ExtendScript can expose different environment values, so all library reads
// use the same path returned by AE itself.
function getLibraryRootFromHost(done) {
    evalScript('getDeepCompLibraryRoot()', raw => {
        const hostPath = (raw || '').trim();
        done(hostPath || getUserLibraryRoot() || '');
    });
}

// ─── EFFECT CATALOGUE ────────────────────────────────────────────────────────
// Single source of truth — populated by querying AE directly at startup.
// Each entry: { name, category, matchName, isPreset, presetPath }
let effectCatalogue = [];
let catalogueReady  = false;

function buildCatalogue() {
    effectCatalogue = [];
    catalogueReady  = false;

    // 1. Ask AE for every installed effect (built-ins + plugins)
    evalScript('getAllInstalledEffects()', (raw) => {
        if (raw && raw !== 'UNAVAILABLE' && raw !== '') {
            try {
                const list = JSON.parse(raw);
                list.forEach(item => {
                    if (!item.n) return;
                    effectCatalogue.push({
                        name:      item.n,
                        category:  item.c || 'Effect',
                        matchName: item.m || item.n,
                        isPreset:  false,
                        presetPath: null
                    });
                });
            } catch(e) { console.error('catalogue parse error', e); }
        }

        // 2. Ask AE for user presets (.ffx files from AE's own preset folders)
        evalScript('getUserPresetsFromAE()', (rawP) => {
            if (rawP && rawP !== '') {
                try {
                    const list = JSON.parse(rawP);
                    list.forEach(item => {
                        if (!item.n) return;
                        // Only add if not already in catalogue by same name
                        if (!effectCatalogue.find(e => e.name.toLowerCase() === item.n.toLowerCase())) {
                            effectCatalogue.push({
                                name:      item.n,
                                category:  item.f || 'User Preset',
                                matchName: item.p,   // for presets the "match name" is the file path
                                isPreset:  true,
                                presetPath: item.p
                            });
                        }
                    });
                } catch(e) {}
            }

            // 3. Add this extension's own presets folder
            loadExtensionPresets();

            catalogueReady = true;
        });
    });
}

function loadExtensionPresets() {
    if (typeof require === 'undefined') return;
    const fs   = require('fs');
    const path = require('path');
    const baseDir = path.join(getExtensionRoot(), 'presets');

    const folders = [
        { dir: path.join(baseDir, 'text preset'),    label: 'Text Preset'    },
        { dir: path.join(baseDir, 'text animation'), label: 'Text Animation' },
        { dir: path.join(baseDir, 'other preset'),   label: 'Other Preset'   }
    ];

    folders.forEach(({ dir, label }) => {
        if (!fs.existsSync(dir)) return;
        try {
            fs.readdirSync(dir)
                .filter(f => f.toLowerCase().endsWith('.ffx') && !f.toLowerCase().includes('untitled'))
                .forEach(file => {
                    const displayName = file.replace(/\.ffx$/i, '');
                    const fullPath    = path.join(dir, file);
                    if (!effectCatalogue.find(e => e.name.toLowerCase() === displayName.toLowerCase())) {
                        effectCatalogue.push({
                            name:       displayName,
                            category:   label,
                            matchName:  fullPath,
                            isPreset:   true,
                            presetPath: fullPath
                        });
                    }
                });
        } catch(e) {}
    });
}

// ─── DOM READY ────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
    // Close add-effect modal when clicking backdrop
    const overlay = document.getElementById('add-effect-modal');
    if (overlay) overlay.addEventListener('click', e => {
        if (e.target === overlay) closeAddEffectModal();
    });

    // Initialise v2 Services & Systems
    buildCatalogue();
    if (window.HealthMonitor) window.HealthMonitor.init();
    if (window.SearchFavorites) window.SearchFavorites.init();
    if (window.TextEffects) window.TextEffects.init();
    if (window.SFXLibrary) window.SFXLibrary.init();
    initEnhanceTools();
    loadMostUsedChips();
    loadLibrary();
    startPrecompSelectionWatcher();
});

// ═══════════════════════════════════════════════════════════════════════════════
//  ENHANCE TOOLS
// ═══════════════════════════════════════════════════════════════════════════════
function initEnhanceTools() {
    const bindPair = (rangeId, numberId, onChange) => {
        const range = document.getElementById(rangeId);
        const number = document.getElementById(numberId);
        if (!range || !number) return;

        const sync = (value, source) => {
            let v = Number(value);
            const min = Number(source === range ? range.min : number.min);
            const max = Number(source === range ? range.max : number.max);
            if (!Number.isFinite(v)) v = Number(range.value);
            v = Math.min(max, Math.max(min, v));
            range.value = String(v);
            number.value = String(v);
            if (onChange) onChange(v);
        };

        range.addEventListener('input', () => sync(range.value, range));
        number.addEventListener('input', () => sync(number.value, number));
        sync(range.value, range);
    };

    const radiusUpdate = (radius) => {
        // User-specified mapping: radius 10 => border 40; each +1 radius => +10 border.
        // Clamp at zero so values below the useful threshold never send negatives to AE.
        const border = Math.max(0, 40 + (radius - 10) * 10);
        const readout = document.getElementById('enhance-border-readout');
        if (readout) readout.textContent = border.toFixed(2);
    };

    bindPair('enhance-radius-range', 'enhance-radius-number', radiusUpdate);
    bindPair('bounce-amplitude-range', 'bounce-amplitude-number');
    bindPair('bounce-frequency-range', 'bounce-frequency-number');
    bindPair('bounce-decay-range', 'bounce-decay-number');

    const roundedBtn = document.getElementById('enhance-rounded-btn');
    if (roundedBtn) {
        roundedBtn.addEventListener('click', () => {
            const input = document.getElementById('enhance-radius-number');
            const radius = Math.min(100, Math.max(0, Number(input && input.value) || 0));
            const border = Math.max(0, 40 + (radius - 10) * 10);
            evalScript(`applyDeepCompRoundedCorners(${radius},${border})`, result => {
                if (result === 'ok') showToast(`✓ Rounded Corners applied · Radius ${radius} · Border ${border.toFixed(2)}`, 'ok');
                else showToast(result || 'Rounded Corners could not be applied.', 'err');
            });
        });
    }

    const bounceBtn = document.getElementById('enhance-bounce-btn');
    if (bounceBtn) {
        bounceBtn.addEventListener('click', () => {
            const amplitude = Number((document.getElementById('bounce-amplitude-number') || {}).value || 250);
            const frequency = Number((document.getElementById('bounce-frequency-number') || {}).value || 3);
            const decay = Number((document.getElementById('bounce-decay-number') || {}).value || 5);
            const floor = !!((document.getElementById('bounce-floor') || {}).checked);
            const safe = (n, fallback, min, max) => {
                const v = Number.isFinite(n) ? n : fallback;
                return Math.min(max, Math.max(min, v));
            };
            const a = safe(amplitude, 250, 0, 2000);
            const f = safe(frequency, 3, 0.1, 20);
            const d = safe(decay, 5, 0.1, 20);
            const escaped = [a, f, d, floor ? 'true' : 'false'];
            evalScript(`applyDeepCompBounce(${escaped.join(',')})`, result => {
                if (result === 'ok') showToast(`✓ Bounce applied · A ${a} · F ${f} · D ${d}${floor ? ' · Floor' : ''}`, 'ok');
                else showToast(result || 'Bounce could not be applied.', 'err');
            });
        });
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  ADD-EFFECT MODAL  (the "+" button popup)
// ═══════════════════════════════════════════════════════════════════════════════

let modalSearchResults = [];
let modalSelectedIndex = -1;

function openAddEffectModal() {
    const modal = document.getElementById('add-effect-modal');
    if (!modal) return;
    modal.classList.add('active');

    const input = document.getElementById('modal-search-input');
    if (input) {
        input.value = '';
        input.focus();
    }
    clearModalResults();
}

function closeAddEffectModal() {
    const modal = document.getElementById('add-effect-modal');
    if (modal) modal.classList.remove('active');
    clearModalResults();
}

function clearModalResults() {
    const list = document.getElementById('modal-results-list');
    if (list) list.innerHTML = '';
    modalSearchResults = [];
    modalSelectedIndex = -1;
}

// Wire up the search input inside the modal
document.addEventListener('DOMContentLoaded', () => {
    const input = document.getElementById('modal-search-input');
    if (!input) return;

    input.addEventListener('input', () => {
        const q = input.value.trim();
        if (q.length === 0) { clearModalResults(); return; }
        runModalSearch(q);
    });

    input.addEventListener('keydown', (e) => {
        const items = document.querySelectorAll('.modal-result-item');
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            modalSelectedIndex = Math.min(modalSelectedIndex + 1, items.length - 1);
            updateModalHighlight(items);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            modalSelectedIndex = Math.max(modalSelectedIndex - 1, 0);
            updateModalHighlight(items);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (modalSelectedIndex >= 0 && modalSearchResults[modalSelectedIndex]) {
                confirmAddEffect(modalSearchResults[modalSelectedIndex]);
            }
        } else if (e.key === 'Escape') {
            closeAddEffectModal();
        }
    });
});

function runModalSearch(query) {
    const q = query.toLowerCase();

    modalSearchResults = effectCatalogue
        .map(entry => {
            const n = entry.name.toLowerCase();
            const c = entry.category.toLowerCase();
            let score = 0;
            if (n === q)            score = 100;
            else if (n.startsWith(q)) score = 80;
            else if (n.includes(q)) score = 60;
            else if (c.includes(q)) score = 30;
            else {
                // simple fuzzy: all query chars appear in order
                let qi = 0;
                for (let i = 0; i < n.length && qi < q.length; i++) {
                    if (n[i] === q[qi]) qi++;
                }
                if (qi === q.length) score = 15;
            }
            return { entry, score };
        })
        .filter(r => r.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 30)
        .map(r => r.entry);

    renderModalResults(query);
}

function renderModalResults(query) {
    const list = document.getElementById('modal-results-list');
    if (!list) return;
    list.innerHTML = '';
    modalSelectedIndex = modalSearchResults.length > 0 ? 0 : -1;

    if (modalSearchResults.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'modal-no-result';
        empty.textContent = catalogueReady
            ? 'No matching effects found in your After Effects.'
            : 'Loading effects… please try again in a moment.';
        list.appendChild(empty);
        return;
    }

    modalSearchResults.forEach((entry, idx) => {
        const item = document.createElement('div');
        item.className = 'modal-result-item' + (idx === 0 ? ' selected' : '');

        const nameEl = document.createElement('span');
        nameEl.className = 'modal-result-name';
        nameEl.innerHTML = highlightMatch(entry.name, query);

        const catEl = document.createElement('span');
        catEl.className = 'modal-result-cat' + (entry.isPreset ? ' modal-preset-tag' : '');
        catEl.textContent = entry.isPreset ? '📄 ' + entry.category : entry.category;

        item.appendChild(nameEl);
        item.appendChild(catEl);

        item.addEventListener('mousedown', e => {
            e.preventDefault();
            confirmAddEffect(entry);
        });
        item.addEventListener('mouseover', () => {
            modalSelectedIndex = idx;
            updateModalHighlight(list.querySelectorAll('.modal-result-item'));
        });

        list.appendChild(item);
    });
}

function updateModalHighlight(items) {
    items.forEach((item, i) => {
        item.classList.toggle('selected', i === modalSelectedIndex);
        if (i === modalSelectedIndex) item.scrollIntoView({ block: 'nearest' });
    });
}

function confirmAddEffect(entry) {
    if (!entry) return;
    addToMostUsed(entry);
    closeAddEffectModal();
    showToast('✓ Added "' + entry.name + '" to Most Used', 'ok');
}

function highlightMatch(text, query) {
    const idx = text.toLowerCase().indexOf(query.toLowerCase());
    if (idx === -1) return escapeHtml(text);
    return escapeHtml(text.slice(0, idx)) +
           '<mark>' + escapeHtml(text.slice(idx, idx + query.length)) + '</mark>' +
           escapeHtml(text.slice(idx + query.length));
}

function escapeHtml(s) {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ═══════════════════════════════════════════════════════════════════════════════
//  MOST USED EFFECTS LIST
// ═══════════════════════════════════════════════════════════════════════════════

// Storage schema:
//   deepcomp_most_used  →  [ { name, category, matchName, isPreset, presetPath }, … ]

function getMostUsed() {
    try {
        return JSON.parse(localStorage.getItem('deepcomp_most_used') || '[]');
    } catch(e) { return []; }
}

function saveMostUsed(list) {
    localStorage.setItem('deepcomp_most_used', JSON.stringify(list));
}

function addToMostUsed(entry) {
    const list = getMostUsed();
    if (list.find(e => e.name.toLowerCase() === entry.name.toLowerCase())) return; // already there
    list.push({
        name:       entry.name,
        category:   entry.category,
        matchName:  entry.matchName,
        isPreset:   entry.isPreset,
        presetPath: entry.presetPath || null
    });
    saveMostUsed(list);
    renderChip(entry, true);  // append immediately without full reload
}

function loadMostUsedChips() {
    const container = document.getElementById('custom-effects-list');
    if (!container) return;
    // Remove any existing chips (but keep the + button)
    container.querySelectorAll('.effect-chip:not(.add-effect-btn)').forEach(c => c.remove());
    const addBtn = container.querySelector('.add-effect-btn');
    getMostUsed().forEach(entry => renderChip(entry, false));
}

function renderChip(entry, isNew) {
    const container = document.getElementById('custom-effects-list');
    if (!container) return;
    const addBtn = container.querySelector('.add-effect-btn');

    // Avoid duplicates
    if (container.querySelector('.effect-chip[data-name="' + CSS.escape(entry.name) + '"]')) return;

    const chip = document.createElement('button');
    chip.className = 'effect-chip';
    chip.textContent = entry.name;
    chip.dataset.name = entry.name;
    chip.title = 'Click: Apply to selected layer\nRight-click: Remove from list';

    chip.onclick = () => applyChip(entry, chip);

    chip.oncontextmenu = (e) => {
        e.preventDefault();
        if (confirm('Remove "' + entry.name + '" from Most Used?')) {
            let list = getMostUsed().filter(x => x.name.toLowerCase() !== entry.name.toLowerCase());
            saveMostUsed(list);
            chip.remove();
        }
    };

    if (addBtn) container.insertBefore(chip, addBtn);
    else container.appendChild(chip);

    if (isNew) {
        chip.classList.add('chip-flash');
        setTimeout(() => chip.classList.remove('chip-flash'), 600);
    }
}

function applyChip(entry, chip) {
    let script;
    if (entry.isPreset && entry.presetPath) {
        const safePath = entry.presetPath.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        script = `applyPreset('${safePath}')`;
    } else {
        const safeMatch   = (entry.matchName || entry.name).replace(/\\/g,'\\\\').replace(/'/g,"\\'");
        const safeName    = entry.name.replace(/\\/g,'\\\\').replace(/'/g,"\\'");
        script = `applyEffectByMatchName('${safeMatch}','${safeName}')`;
    }
    evalScript(script, () => {
        chip.classList.add('chip-applied');
        setTimeout(() => chip.classList.remove('chip-applied'), 700);
    });
}

// ─── CAPTURE LAST EFFECT ──────────────────────────────────────────────────────
function captureLastEffect() {
    evalScript('getLastAppliedEffect()', result => {
        if (!result || result === 'NO_COMP')   { showToast('❌ No comp open!',         'err'); return; }
        if (result === 'NO_LAYER')             { showToast('❌ Select a layer first!',  'err'); return; }
        if (result === 'NO_EFFECTS')           { showToast('❌ No effects on layer!',  'err'); return; }
        const name = result.trim();
        // Build a minimal entry — category unknown at this point
        const entry = { name, category: 'Captured', matchName: name, isPreset: false, presetPath: null };
        addToMostUsed(entry);
        showToast('✓ Saved: ' + name, 'ok');
    });
}

function openAEEffectsPanel() { evalScript('openEffectsPresetsPanel()'); }

// ─── TOAST ────────────────────────────────────────────────────────────────────
function showToast(msg, type) {
    const toast = document.getElementById('deepcomp-toast');
    if (!toast) return;
    toast.textContent = msg;
    toast.className = 'deepcomp-toast active ' + (type === 'ok' ? 'toast-ok' : 'toast-err');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => toast.classList.remove('active'), 2500);
}

// ═══════════════════════════════════════════════════════════════════════════════
//  EFFECT & ANIMATION TAB  (presets)
// ═══════════════════════════════════════════════════════════════════════════════

function loadPresets() {
    if (typeof require === 'undefined') return;
    const fs   = require('fs');
    const path = require('path');
    const baseDir = path.join(getExtensionRoot(), 'presets');

    const folders = [
        { id: 'text-preset-list', dir: path.join(baseDir, 'text preset') },
        { id: 'text-anim-list',   dir: path.join(baseDir, 'text animation') },
        { id: 'other-anim-list',  dir: path.join(baseDir, 'other preset') }
    ];

    folders.forEach(({ id, dir }) => {
        const container = document.getElementById(id);
        if (!container) return;

        container.innerHTML = id === 'other-anim-list'
            ? '<button class="action-btn preset-btn special-btn" onclick="evalScript(\'applySmoothZoomIn()\')">Zoom In</button>' +
              '<button class="action-btn preset-btn special-btn" onclick="evalScript(\'applySmoothZoomOut()\')">Zoom Out</button>'
            : '';

        try {
            if (fs.existsSync(dir)) {
                fs.readdirSync(dir)
                    .filter(f => f.endsWith('.ffx') && !f.toLowerCase().includes('untitled'))
                    .forEach(file => {
                        const presetPath = path.join(dir, file).replace(/\\/g, '\\\\');
                        const btn = document.createElement('button');
                        btn.className = 'action-btn preset-btn';
                        btn.innerText = file.replace('.ffx', '').toUpperCase();
                        btn.onclick = () => evalScript(`applyPreset('${presetPath}')`);
                        container.appendChild(btn);
                    });
            }
        } catch(e) { console.error(e); }
    });
}

// ═══════════════════════════════════════════════════════════════════════════════
//  LIBRARY / PRECOMPS
// ═══════════════════════════════════════════════════════════════════════════════

// ─── SAVE PRECOMP with JS-side name modal ────────────────────────────────────
let dcSelectedPrecomp = { ok: false, name: '', sourceName: '', message: 'Select a pre-comp layer in the timeline.' };

function dcRefreshSelectedPrecompStatus(done) {
    evalScript('pcSelectionInfo()', raw => {
        let info = { ok:false, name:'', sourceName:'', message:'Could not inspect the timeline selection.' };
        try {
            info = JSON.parse(raw || '{}');
        } catch(e) {}
        dcSelectedPrecomp = info;
        const btn = document.querySelector('[data-dc-save-precomp]');
        if (btn) {
            const label = btn.querySelector('[data-dc-save-label]');
            if (label) label.textContent = info.ok ? `Save “${info.sourceName || info.name}”` : 'Save Selected Precomp';
            btn.title = info.message || '';
            btn.classList.toggle('dc-ready', !!info.ok);
        }
        if (typeof done === 'function') done(info);
    });
}

function startPrecompSelectionWatcher() {
    dcRefreshSelectedPrecompStatus();
    if (window.__dcPrecompWatcher) clearInterval(window.__dcPrecompWatcher);
    window.__dcPrecompWatcher = setInterval(dcRefreshSelectedPrecompStatus, 700);
}

function savePrecompAndRefresh() {
    // IMPORTANT: the previous implementation opened the modal before the
    // asynchronous AE selection query completed, causing intermittent
    // "no pre-comp selected" states. Always open the modal from fresh data.
    dcRefreshSelectedPrecompStatus(info => {
        showPrecompNameModal(info);
    });
}

function showPrecompNameModal(freshInfo) {
    const existing = document.getElementById('precomp-name-modal');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'precomp-name-modal';
    overlay.className = 'add-effect-overlay active';

    const selectionInfo = freshInfo || dcSelectedPrecomp;
    const detectedName = selectionInfo.ok ? (selectionInfo.sourceName || selectionInfo.name || '') : '';
    const desc = selectionInfo.ok
        ? `Detected pre-comp: <strong>${escapeHtml(detectedName)}</strong>`
        : 'Select exactly one pre-comp layer in the active timeline.';

    overlay.innerHTML = `
        <div class="add-effect-dialog" style="max-width:320px;">
            <div class="add-effect-header">
                <div class="add-effect-title">
                    <span class="add-effect-icon">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
                    </span>
                    <span>Save Precomp</span>
                </div>
                <button class="add-effect-close" id="precomp-modal-close">&times;</button>
            </div>
            <div style="padding:12px 16px 14px;">
                <p class="desc" id="precomp-selection-desc" style="margin-bottom:8px;">${desc}</p>
                <input id="precomp-name-input" class="add-effect-search" type="text"
                    placeholder="e.g. Lower Third Animation"
                    autocomplete="off" spellcheck="false"
                    value="${escapeHtml(detectedName)}"
                    style="margin-bottom:12px;"/>
                <button class="action-btn full-btn dc-btn-primary" id="precomp-name-confirm">Save Precomp</button>
            </div>
        </div>`;

    document.body.appendChild(overlay);

    const input = document.getElementById('precomp-name-input');
    const confirm = document.getElementById('precomp-name-confirm');
    const closeBtn = document.getElementById('precomp-modal-close');

    setTimeout(() => input && input.focus(), 50);

    function doSave() {
        const name = (input.value || '').trim();
        if (!name) {
            input.focus();
            input.classList.add('input-error');
            return;
        }
        if (!selectionInfo.ok) {
            showToast('Select exactly one pre-comp layer in the timeline.', 'err');
            dcRefreshSelectedPrecompStatus();
            return;
        }

        overlay.remove();
        showToast('Saving “' + name + '”…', 'ok');

        const safeName = name.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        evalScript(`pcSavePrecomp('${safeName}')`, result => {
            let parsed = null;
            try { parsed = JSON.parse(result || '{}'); } catch(e) {}
            if (parsed && parsed.ok) {
                showToast('✓ Saved “' + parsed.entry.name + '”', 'ok');
                loadLibrary();
                dcRefreshSelectedPrecompStatus();
            } else {
                const msg = parsed && parsed.error ? parsed.error : (result || 'Save failed.');
                showToast(msg, 'err');
                loadLibrary();
                dcRefreshSelectedPrecompStatus();
            }
        });
    }

    confirm.addEventListener('click', doSave);
    input.addEventListener('keydown', e => {
        if (e.key === 'Enter') doSave();
        else if (e.key === 'Escape') overlay.remove();
        else input.classList.remove('input-error');
    });
    closeBtn.addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
}

// ─── SAVE IMAGE then refresh ──────────────────────────────────────────────────
// ─── ADD PLACEHOLDER PRECOMP CARD (shown instantly before JSX finishes) ────────
function addPlaceholderPrecompCard(name) {
    const precompsList = document.getElementById('saved-precomps-list');
    if (!precompsList) return;

    // Remove empty-state message if present
    const empty = precompsList.querySelector('.library-empty');
    if (empty) empty.remove();

    // Don't add duplicate
    if (precompsList.querySelector(`.saved-card[data-name="${CSS.escape(name)}"]`)) return;

    const initials = name.substring(0, 2).toUpperCase();
    const card = document.createElement('div');
    card.className = 'saved-card saving-placeholder';
    card.dataset.name = name;
    card.innerHTML = `
        <div class="saved-card-thumb-container">
            <img class="saved-card-thumb" src="" style="display:none">
            <div class="saved-card-initials" style="display:flex">${initials}</div>
        </div>
        <button class="saved-card-delete" title="Delete">&times;</button>
        <div class="saved-card-info">
            <div class="saved-card-title saving-title" title="${name}">${name}</div>
        </div>`;
    // Placeholder is not clickable yet (saving in progress)
    card.style.opacity = '0.6';
    card.style.pointerEvents = 'none';
    precompsList.appendChild(card);
}

function saveImageAndRefresh() {
    // Pass empty string — JSX will use getUserLibraryRoot() internally (AppData)
    evalScript(`saveImage('')`, result => {
        if (result && result !== 'error' && result !== 'no_selection') {
            showToast('✓ Image saved: ' + result, 'ok');
            loadLibrary();
        } else if (result === 'no_selection') {
            showToast('❌ Select an image in the Project panel first.', 'err');
        }
    });
}

// ─── LOAD LIBRARY (precomps + images) ────────────────────────────────────────
function loadLibrary() {
    if (typeof require === 'undefined') return;
    const fs   = require('fs');
    const path = require('path');

    getLibraryRootFromHost(userLibRoot => {
        if (!userLibRoot) {
            const precompsList = document.getElementById('saved-precomps-list');
            if (precompsList) precompsList.innerHTML = '<p class="library-empty">Library location unavailable.</p>';
            return;
        }

        const libraryDir  = path.join(userLibRoot, 'library');
        const precompsDir = path.join(libraryDir, 'Precomps');
        const imagesDir   = path.join(libraryDir, 'Images');

        // ── PRECOMPS ────────────────────────────────────────────────────────
        const precompsList = document.getElementById('saved-precomps-list');
        if (precompsList) {
            precompsList.innerHTML = '';

            const folders = fs.existsSync(precompsDir)
                ? fs.readdirSync(precompsDir)
                    .filter(f => {
                        try { return fs.lstatSync(path.join(precompsDir, f)).isDirectory(); }
                        catch(e) { return false; }
                    })
                    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
                : [];

            if (folders.length === 0) {
                precompsList.innerHTML = '<p class="library-empty">No precomps saved yet.</p>';
            } else {
                folders.forEach(folder => {
                    const folderPath = path.join(precompsDir, folder);
                    const thumbPath  = path.join(folderPath, 'thumbnail.png');
                    const metaPath   = path.join(folderPath, 'meta.json');
                    const aepPathRaw = path.join(folderPath, folder + '.aep');
                    const hasAep     = fs.existsSync(aepPathRaw) && (() => {
                        try { return fs.statSync(aepPathRaw).size > 1024; } catch(e) { return false; }
                    })();

                    // Load the image into a data URL instead of file://. CEP's
                    // file URL security differs between machines/AE versions;
                    // base64 makes the Library thumbnail deterministic.
                    let thumbSrc = '';
                    if (fs.existsSync(thumbPath)) {
                        try {
                            const b64 = fs.readFileSync(thumbPath).toString('base64');
                            if (b64 && b64.length > 32) thumbSrc = 'data:image/png;base64,' + b64;
                        } catch(eThumbRead) {}
                    }
                    const usableThumb = !!thumbSrc;

                    let meta = {};
                    let durationBadge = '';
                    let assetHealth = 'ok';
                    try {
                        if (fs.existsSync(metaPath)) {
                            meta = JSON.parse(fs.readFileSync(metaPath, 'utf8')) || {};
                            if (meta.portableAssets === false || Number(meta.assetFailures || 0) > 0) assetHealth = 'warning';
                            if (meta.thumbnail === null || !usableThumb) assetHealth = assetHealth === 'warning' ? 'warning' : 'thumbnail';
                            const d = Number(meta.duration || 0);
                            if (Number.isFinite(d) && d > 0) {
                                const totalFrames = meta.frameRate ? Math.max(1, Math.round(d * Number(meta.frameRate))) : 0;
                                if (totalFrames > 0 && meta.frameRate) {
                                    const mins = Math.floor(d / 60);
                                    const secs = Math.floor(d % 60);
                                    durationBadge = `<span class="precomp-dur-badge">${mins < 10 ? '0' + mins : mins}:${secs < 10 ? '0' + secs : secs}</span>`;
                                }
                            }
                        }
                    } catch(eMeta) {}

                    const initials = folder.substring(0, 2).toUpperCase();
                    const card = document.createElement('div');
                    card.className = 'saved-card saved-precomp-visual-card' + (hasAep ? '' : ' saved-precomp-invalid');
                    card.dataset.name = folder;
                    card.dataset.aep = hasAep ? '1' : '0';

                    const title = escapeHtml(folder);
                    const imageMarkup = usableThumb
                        ? `<img class="saved-card-thumb" src="${thumbSrc}" alt="${title}" loading="lazy">`
                        : '';

                    card.innerHTML = `
                        <div class="saved-card-thumb-container">
                            ${imageMarkup}
                            <div class="saved-card-initials" style="${usableThumb ? 'display:none' : 'display:grid'}">${escapeHtml(initials)}</div>
                            ${durationBadge}
                            ${hasAep ? '' : '<span class="precomp-invalid-badge">Incomplete</span>'}
                            ${hasAep && assetHealth === 'warning' ? '<span class="precomp-invalid-badge precomp-health-badge">External assets</span>' : ''}
                            ${hasAep && assetHealth === 'thumbnail' ? '<span class="precomp-invalid-badge precomp-health-badge">No preview</span>' : ''}
                            <button class="saved-card-delete" title="Delete">&times;</button>
                        </div>
                        <div class="saved-card-info">
                            <div class="saved-card-title" title="${title}">${title}</div>
                            <div class="saved-card-actions">
                                <button class="action-btn precomp-import-btn" title="Import into Active Comp" ${hasAep ? '' : 'disabled'}>Import</button>
                            </div>
                        </div>`;

                    const aepPath = aepPathRaw.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
                    const importPrecomp = () => {
                        if (!hasAep) {
                            showToast('This pre-comp asset is incomplete. Delete it and save again.', 'err');
                            return;
                        }
                        showToast('Importing pre-comp: ' + folder + '…', 'ok');
                        evalScript(`pcImportPrecomp('${aepPath}')`, raw => {
                            let r = null;
                            try { r = JSON.parse(raw || '{}'); } catch(e) {}
                            if (!r || !r.ok) { showToast('Import failed for “' + folder + '”: ' + ((r && r.error) || raw || 'Unknown error'), 'err'); }
                            else { showToast('✓ Imported pre-comp: ' + (r.comp || folder), 'ok'); }
                        });
                    };

                    const importBtn = card.querySelector('.precomp-import-btn');
                    if (importBtn) importBtn.onclick = e => { e.stopPropagation(); importPrecomp(); };

                    card.onclick = e => {
                        if (e.target.closest('.saved-card-delete') || e.target.closest('.precomp-import-btn')) return;
                        importPrecomp();
                    };

                    const delBtn = card.querySelector('.saved-card-delete');
                    if (delBtn) {
                        delBtn.onclick = e => {
                            e.stopPropagation();
                            if (confirm(`Delete "${folder}" from library?`)) {
                                try {
                                    deleteFolderRecursive(folderPath);
                                    loadLibrary();
                                } catch(err) {
                                    showToast('Error: ' + err, 'err');
                                }
                            }
                        };
                    }

                    precompsList.appendChild(card);
                });
            }
        }

        // ── IMAGES ──────────────────────────────────────────────────────────
        const imagesList = document.getElementById('saved-images-list');
        if (imagesList) {
            imagesList.innerHTML = '';
            const IMAGE_EXTS = /\.(png|jpg|jpeg|gif|webp|bmp|tiff?|svg|psd|ai|eps)$/i;
            const files = fs.existsSync(imagesDir)
                ? fs.readdirSync(imagesDir).filter(f => {
                    try { return fs.lstatSync(path.join(imagesDir, f)).isFile(); }
                    catch(e) { return false; }
                })
                : [];

            if (files.length === 0) {
                imagesList.innerHTML = '<p class="library-empty">No images saved yet.</p>';
            } else {
                files.forEach(file => {
                    const card = document.createElement('div');
                    card.className = 'saved-image-card';
                    const filePath = path.join(imagesDir, file);
                    const isImage  = IMAGE_EXTS.test(file);
                    let imgSrc = '';
                    if (isImage) {
                        try {
                            const ext = file.split('.').pop().toLowerCase();
                            const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : (ext === 'svg' ? 'image/svg+xml' : 'image/' + ext);
                            const b64 = fs.readFileSync(filePath).toString('base64');
                            imgSrc = 'data:' + mime + ';base64,' + b64;
                        } catch(eImgRead) {}
                    }
                    const usableImage = !!imgSrc;
                    const ext = file.split('.').pop().toUpperCase();
                    const baseName = file.replace(/\.[^.]+$/, '');
                    card.innerHTML = `
                        <div class="saved-image-thumb-container">
                            ${usableImage ? `<img class="saved-image-thumb" src="${imgSrc}" alt="${escapeHtml(baseName)}">` : ''}
                            <div class="saved-image-ext-badge" style="${usableImage ? 'display:none' : ''}">${escapeHtml(ext)}</div>
                            <button class="saved-img-del-btn" title="Delete">
                                <svg width="8" height="8" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg" style="pointer-events:none">
                                    <line x1="1" y1="1" x2="9" y2="9" stroke="white" stroke-width="2.5" stroke-linecap="round"/>
                                    <line x1="9" y1="1" x2="1" y2="9" stroke="white" stroke-width="2.5" stroke-linecap="round"/>
                                </svg>
                            </button>
                        </div>
                        <div class="saved-card-info"><div class="saved-card-title" title="${escapeHtml(file)}">${escapeHtml(baseName)}</div></div>`;

                    card.onclick = e => {
                        if (e.target.closest('.saved-img-del-btn')) return;
                        const safe = filePath.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
                        evalScript(`importSavedAsset('${safe}')`);
                    };

                    card.querySelector('.saved-img-del-btn').onclick = e => {
                        e.stopPropagation();
                        if (confirm(`Remove "${file}" from library?`)) {
                            try { fs.unlinkSync(filePath); loadLibrary(); }
                            catch(err) { showToast('Error: ' + err, 'err'); }
                        }
                    };
                    imagesList.appendChild(card);
                });
            }
        }
    });
}

function deleteFolderRecursive(folderPath) {
    const fs   = require('fs');
    const path = require('path');
    if (fs.existsSync(folderPath)) {
        fs.readdirSync(folderPath).forEach(f => {
            const cur = path.join(folderPath, f);
            fs.lstatSync(cur).isDirectory() ? deleteFolderRecursive(cur) : fs.unlinkSync(cur);
        });
        fs.rmdirSync(folderPath);
    }
}
