// ═══════════════════════════════════════════════════════════════════════════════
//  DeepComp — Preset & Visual Animation Engine (v2.0)
//  Dedicated isolated systems for:
//   1. Animation Enhancement (Video Previews)
//   2. Icon Presets (Image Previews)
//   3. Text Effects (Static Image Previews, including Devin Jatho Text)
//   4. Text Animations (Square Video Library in Exact Order)
// ═══════════════════════════════════════════════════════════════════════════════

const TextEffects = {
    animationEnhancements: [],
    iconPresets: [],
    textEffects: [],
    textAnimations: [],
    allPresets: [],
    activeCategory: 'all',
    observer: null,

    init() {
        this.loadPresetsFromDisk();
        this.bindEvents();
    },

    bindEvents() {
        document.querySelectorAll('.effect-filter-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.effect-filter-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                this.activeCategory = tab.dataset.filter || 'all';
                this.renderPresets();
            });
        });

        const filterInput = document.getElementById('effect-search-filter');
        if (filterInput) {
            filterInput.addEventListener('input', () => {
                this.renderPresets();
            });
        }
    },

    // Returns the exact label shown under each preview.
    // Video cards use the explicit displayName from the registry.
    // Text-effect image cards use imageLabel from the registry.
    getPresetDisplayLabel(preset) {
        if (!preset) return '';
        if (preset.type === 'video') {
            return preset.displayName || preset.name || '';
        }
        if (preset.category === 'text-effect' && preset.imageLabel) return preset.imageLabel;
        return preset.displayName || preset.name || '';
    },

    // The preview JPG filenames are not reliable names for these text effects.
    // Keep the card label tied to the text visibly written inside the preview.
    getTextEffectImageLabel(imagePath, fallback) {
        const normalized = String(imagePath || '').replace(/\\/g, '/').toLowerCase();
        const file = normalized.substring(normalized.lastIndexOf('/') + 1);
        const labels = {
            'devin jatho text effect.jpg': 'VSL TEXT',
            'gradient text fx.jpg': 'DEVIN JATHO',
            'vsl text fx.jpg': 'GRADIENT TEXT',
            'clean glow tect fx.jpg': 'CLEAN GLOW',
            'metalic text.jpg': 'METALIC TEXT'
        };
        return labels[file] || fallback || '';
    },

    loadPresetsFromDisk() {
        this.animationEnhancements = [];
        this.iconPresets = [];
        this.textEffects = [];
        this.textAnimations = [];
        this.allPresets = [];

        let root = '';
        if (typeof getExtensionRoot === 'function') {
            root = getExtensionRoot();
        }

        let fs = null;
        let path = null;
        if (typeof require !== 'undefined') {
            try {
                fs = require('fs');
                path = require('path');
            } catch (e) {}
        }

        // ── 1. Load from presetRegistry.json ─────────────────────────────────
        let registryLoaded = false;
        if (fs && path && root) {
            const regPath = path.join(root, 'presets', 'presetRegistry.json');
            if (fs.existsSync(regPath)) {
                try {
                    const raw = fs.readFileSync(regPath, 'utf8');
                    const reg = JSON.parse(raw);

                    if (Array.isArray(reg.animationEnhancements)) {
                        reg.animationEnhancements.forEach(item => {
                            const fullPreset = path.isAbsolute(item.preset) ? item.preset : path.join(root, item.preset);
                            const fullVideo = item.previewVideo ? (path.isAbsolute(item.previewVideo) ? item.previewVideo : path.join(root, item.previewVideo)) : null;
                            this.animationEnhancements.push({
                                id: item.id || ('anim_enh_' + item.name),
                                name: item.name,
                                displayName: item.displayName || item.name,
                                type: 'video',
                                category: 'animation-enhancement',
                                path: fullPreset,
                                video: (fullVideo && fs.existsSync(fullVideo)) ? fullVideo : (fs.existsSync(fullPreset.replace(/\.ffx$/i, '.mp4')) ? fullPreset.replace(/\.ffx$/i, '.mp4') : null)
                            });
                        });
                    }

                    if (Array.isArray(reg.iconPresets)) {
                        reg.iconPresets.forEach(item => {
                            const fullPreset = path.isAbsolute(item.preset) ? item.preset : path.join(root, item.preset);
                            const fullImg = item.previewImage ? (path.isAbsolute(item.previewImage) ? item.previewImage : path.join(root, item.previewImage)) : null;
                            this.iconPresets.push({
                                id: item.id || ('icon_preset_' + item.name),
                                name: item.name,
                                displayName: item.displayName || item.name,
                                type: 'image',
                                category: 'icon-preset',
                                path: fullPreset,
                                image: (fullImg && fs.existsSync(fullImg)) ? fullImg : (fs.existsSync(fullPreset.replace(/\.ffx$/i, '.png')) ? fullPreset.replace(/\.ffx$/i, '.png') : null)
                            });
                        });
                    }

                    if (Array.isArray(reg.textEffects)) {
                        reg.textEffects.forEach(item => {
                            const fullPreset = path.isAbsolute(item.preset) ? item.preset : path.join(root, item.preset);
                            const fullImg = item.imagePreview ? (path.isAbsolute(item.imagePreview) ? item.imagePreview : path.join(root, item.imagePreview)) : null;
                            this.textEffects.push({
                                id: item.id || ('effect_' + item.name),
                                name: item.name,
                                displayName: item.displayName || item.name,
                                imageLabel: this.getTextEffectImageLabel(item.imagePreview, item.imageLabel || item.displayName || item.name),
                                type: 'image',
                                category: 'text-effect',
                                path: fullPreset,
                                image: (fullImg && fs.existsSync(fullImg)) ? fullImg : (fs.existsSync(fullPreset.replace(/\.ffx$/i, '.jpg')) ? fullPreset.replace(/\.ffx$/i, '.jpg') : null)
                            });
                        });
                    }

                    if (Array.isArray(reg.textAnimations)) {
                        reg.textAnimations.forEach(item => {
                            const fullPreset = path.isAbsolute(item.preset) ? item.preset : path.join(root, item.preset);
                            const fullVideo = item.videoPreview ? (path.isAbsolute(item.videoPreview) ? item.videoPreview : path.join(root, item.videoPreview)) : null;
                            const resolvedVideo = (fullVideo && fs.existsSync(fullVideo))
                                ? fullVideo
                                : (fs.existsSync(fullPreset.replace(/\.ffx$/i, '.mp4')) ? fullPreset.replace(/\.ffx$/i, '.mp4') : null);

                            // IMPORTANT: keep the preview video exactly as supplied by the registry.
                            // The registry's preset path is authoritative because the visible label
                            // may intentionally differ from the preview filename.
                            const resolvedPreset = fullPreset;

                            this.textAnimations.push({
                                id: item.id || ('anim_' + item.name),
                                name: item.name,
                                displayName: item.displayName || item.name,
                                type: 'video',
                                category: 'text-animation',
                                path: resolvedPreset,
                                video: resolvedVideo
                            });
                        });
                    }

                    registryLoaded = true;
                } catch (e) {
                    console.error('Error loading presetRegistry.json:', e);
                }
            }
        }

        // ── 2. Fallback / Scanning if registry was not loaded ────────────────
        if (!registryLoaded && fs && path && root) {
            const basePresets = path.join(root, 'presets');

            // Scan text preset
            this.scanDirectory(path.join(basePresets, 'text preset'), 'text-effect', this.textEffects);

            // Scan text animation
            this.scanDirectory(path.join(basePresets, 'text animation'), 'text-animation', this.textAnimations);

            // Scan other preset
            const otherDir = path.join(basePresets, 'other preset');
            if (fs.existsSync(otherDir)) {
                if (fs.existsSync(path.join(otherDir, 'animation enhancement.ffx'))) {
                    this.animationEnhancements.push({
                        id: 'animation-enhancement-001',
                        name: 'animation enhancement',
                        displayName: 'Animation Enhancement 01',
                        type: 'video',
                        category: 'animation-enhancement',
                        path: path.join(otherDir, 'animation enhancement.ffx'),
                        video: fs.existsSync(path.join(otherDir, 'animation enhancement.mp4')) ? path.join(otherDir, 'animation enhancement.mp4') : null
                    });
                }
                if (fs.existsSync(path.join(otherDir, 'icon preset.ffx'))) {
                    this.iconPresets.push({
                        id: 'icon-preset-001',
                        name: 'icon preset',
                        displayName: 'Icon Preset 01',
                        type: 'image',
                        category: 'icon-preset',
                        path: path.join(otherDir, 'icon preset.ffx'),
                        image: fs.existsSync(path.join(otherDir, 'icon preset.png')) ? path.join(otherDir, 'icon preset.png') : null
                    });
                }
            }
        }

        // ── 3. Scan user library presets if any ─────────────────────────────
        if (typeof getUserLibraryRoot === 'function' && fs && path) {
            const userLib = getUserLibraryRoot();
            if (userLib) {
                const userEnhanceDir = path.join(userLib, 'presets', 'animation-enhancement');
                if (fs.existsSync(userEnhanceDir)) {
                    this.scanDirectory(userEnhanceDir, 'animation-enhancement', this.animationEnhancements);
                }
                const userIconDir = path.join(userLib, 'presets', 'icon-preset');
                if (fs.existsSync(userIconDir)) {
                    this.scanDirectory(userIconDir, 'icon-preset', this.iconPresets);
                }
            }
        }

        // ── 4. DeepComp text-animation mapping ───────────────────────────────
        // Preview videos stay in their original visual order/files. Only the
        // label shown under each preview and the preset applied on click change.
        // Matching is done by preview filename so it remains deterministic even
        // if the filesystem returns files in a different order.
        if (fs && path && root && this.textAnimations.length) {
            const animDir = path.join(root, 'presets', 'text animation');
            const desired = [
                ['Color Reveal.mp4', 'Jump', 'Text 01 Jump .ffx'],
                ['Text 01 Jump .mp4', 'Smooth Up', 'Text 11 Smooth Up .ffx'],
                ['Text 11 Smooth Up .mp4', 'Polished Down', 'Text 15 Polished Down .ffx'],
                ['Text 14 Polished Up .mp4', 'Bounce Down', 'TEXT BOUNCE DOWN.ffx'],
                ['Text 15 Polished Down .mp4', 'Bounce Up', 'TEXT BOUNCE UP.ffx'],
                ['TEXT BOUNCE DOWN.mp4', 'Wobble', 'Text 07 Wobble .ffx'],
                ['TEXT BOUNCE UP.mp4', 'Blur By Word', 'Blur By Word.ffx'],
                ['Text 07 Wobble .mp4', 'Polished Up', 'Text 14 Polished Up .ffx'],
                ['Blur By Word.mp4', 'Color Reveal', 'Color Reveal.ffx'],
                ['word ramp up + blur (1).mp4', 'word ramp up + blur (1)', 'word ramp up + blur (1).ffx']
            ];
            desired.forEach(([videoFile, label, presetFile]) => {
                const item = this.textAnimations.find(p => {
                    if (!p.video) return false;
                    const normalized = String(p.video).replace(/\\/g, '/');
                    return normalized.substring(normalized.lastIndexOf('/') + 1).toLowerCase() === videoFile.toLowerCase();
                });
                if (item) {
                    const exactPreset = path.join(animDir, presetFile);
                    item.displayName = label;
                    if (fs.existsSync(exactPreset)) item.path = exactPreset;
                }
            });
        }

        // Combine into allPresets for global search & favorites
        this.allPresets = [
            ...this.animationEnhancements,
            ...this.iconPresets,
            ...this.textEffects,
            ...this.textAnimations
        ];

        this.renderPresets();
    },

    scanDirectory(folderPath, category, targetArray) {
        if (typeof require === 'undefined') return;
        const fs = require('fs');
        const path = require('path');
        if (!fs.existsSync(folderPath)) return;

        try {
            const files = fs.readdirSync(folderPath);
            const map = {};
            files.forEach(file => {
                const ext = path.extname(file).toLowerCase();
                const base = path.basename(file, ext);
                if (base.toLowerCase().includes('untitled')) return;
                if (!map[base]) {
                    map[base] = { name: base, ffx: null, image: null, video: null };
                }
                if (ext === '.ffx') map[base].ffx = path.join(folderPath, file);
                else if (['.png', '.jpg', '.jpeg', '.webp'].includes(ext)) map[base].image = path.join(folderPath, file);
                else if (['.mp4', '.webm', '.mov'].includes(ext)) map[base].video = path.join(folderPath, file);
            });

            Object.keys(map).forEach(base => {
                const item = map[base];
                if (item.ffx && !targetArray.some(p => p.name.toLowerCase() === base.toLowerCase())) {
                    let displayName = base;
                    let imageLabel = null;
                    if (category === 'text-effect' && item.image) {
                        imageLabel = this.getTextEffectImageLabel(item.image, base);
                        displayName = imageLabel;
                    } else if (base.toLowerCase().includes('devin jatho') || base.toLowerCase().includes('cinematic')) {
                        displayName = 'Devin Jatho Text';
                    }
                    targetArray.push({
                        id: category + '_' + base.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
                        name: base,
                        displayName: displayName,
                        type: (category === 'icon-preset' || category === 'text-effect') ? 'image' : 'video',
                        category: category,
                        path: item.ffx,
                        image: item.image,
                        imageLabel: imageLabel,
                        video: item.video
                    });
                }
            });
        } catch (e) {
            console.error('Error scanning folder:', folderPath, e);
        }
    },

    setupVideoObserver() {
        if (typeof IntersectionObserver === 'undefined') return;
        if (this.observer) this.observer.disconnect();

        this.observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                const video = entry.target.querySelector('video');
                if (!video) return;
                if (entry.isIntersecting) {
                    video.play().catch(() => {});
                } else {
                    video.pause();
                }
            });
        }, { threshold: 0.2 });

        document.querySelectorAll('.video-preview-container, .animation-card-square, .anim-enhancement-card').forEach(card => {
            this.observer.observe(card);
        });
    },

    renderPresets() {
        const filterInput = document.getElementById('effect-search-filter');
        const query = filterInput ? filterInput.value.trim().toLowerCase() : '';

        // DOM elements
        const enhanceGrid = document.getElementById('animation-enhancement-grid');
        const iconGrid = document.getElementById('icon-presets-grid');
        const effectGrid = document.getElementById('text-effects-visual-grid');
        const animGrid = document.getElementById('text-anim-visual-grid');

        // Section wrappers
        const secEnhanceTools = document.getElementById('section-enhance-tools');
        const secEnhance = document.getElementById('section-anim-enhancement');
        const secIcon = document.getElementById('section-icon-presets');
        const secZoom = document.getElementById('section-quick-zooms');
        const secEffect = document.getElementById('section-text-effects');
        const secAnim = document.getElementById('section-text-animations');

        // Filter predicate
        const matchesQuery = (p) => {
            if (!query) return true;
            return (p.displayName && p.displayName.toLowerCase().includes(query)) ||
                   (p.name && p.name.toLowerCase().includes(query));
        };

        const matchesFav = (p) => {
            if (this.activeCategory !== 'favorites') return true;
            return SearchFavorites.isFavorite(p.id);
        };

        const filterItems = (list) => list.filter(p => matchesQuery(p) && matchesFav(p));

        const filteredEnhancements = filterItems(this.animationEnhancements);
        const filteredIcons = filterItems(this.iconPresets);
        const filteredEffects = filterItems(this.textEffects);
        const filteredAnimations = filterItems(this.textAnimations);

        // Section visibility based on activeCategory
        if (secEnhanceTools) {
            secEnhanceTools.style.display = (this.activeCategory === 'all' || this.activeCategory === 'enhance') ? 'block' : 'none';
        }
        if (secEnhance) {
            secEnhance.style.display = (this.activeCategory === 'all' || this.activeCategory === 'enhance' || this.activeCategory === 'animation-enhancement' || (this.activeCategory === 'favorites' && filteredEnhancements.length > 0)) ? 'block' : 'none';
        }
        if (secIcon) {
            secIcon.style.display = (this.activeCategory === 'all' || this.activeCategory === 'icon-preset' || (this.activeCategory === 'favorites' && filteredIcons.length > 0)) ? 'block' : 'none';
        }
        if (secZoom) {
            secZoom.style.display = (this.activeCategory === 'all') ? 'block' : 'none';
        }
        if (secEffect) {
            secEffect.style.display = (this.activeCategory === 'all' || this.activeCategory === 'text-effect' || (this.activeCategory === 'favorites' && filteredEffects.length > 0)) ? 'block' : 'none';
        }
        if (secAnim) {
            secAnim.style.display = (this.activeCategory === 'all' || this.activeCategory === 'text-animation' || (this.activeCategory === 'favorites' && filteredAnimations.length > 0)) ? 'block' : 'none';
        }

        // 1. Render Animation Enhancement (Video Previews Only)
        if (enhanceGrid) {
            enhanceGrid.innerHTML = '';
            if (filteredEnhancements.length === 0) {
                enhanceGrid.innerHTML = '<div class="grid-empty-hint">No animation enhancement presets found</div>';
            } else {
                filteredEnhancements.forEach(item => {
                    enhanceGrid.appendChild(this.createVideoPresetCard(item, 'anim-enhancement-card'));
                });
            }
        }

        // 2. Render Icon Presets (Image Previews Only)
        if (iconGrid) {
            iconGrid.innerHTML = '';
            if (filteredIcons.length === 0) {
                iconGrid.innerHTML = '<div class="grid-empty-hint">No icon presets found</div>';
            } else {
                filteredIcons.forEach(item => {
                    iconGrid.appendChild(this.createImagePresetCard(item, 'icon-preset-card'));
                });
            }
        }

        // 3. Render Text Effects (Static Image Previews)
        if (effectGrid) {
            effectGrid.innerHTML = '';
            if (filteredEffects.length === 0) {
                effectGrid.innerHTML = '<div class="grid-empty-hint">No text effects found</div>';
            } else {
                filteredEffects.forEach(item => {
                    effectGrid.appendChild(this.createImagePresetCard(item, 'effect-card-item'));
                });
            }
        }

        // 4. Render Text Animations (10 Square Video Cards in exact order)
        if (animGrid) {
            animGrid.innerHTML = '';
            if (filteredAnimations.length === 0) {
                animGrid.innerHTML = '<div class="grid-empty-hint">No text animations found</div>';
            } else {
                filteredAnimations.forEach(item => {
                    animGrid.appendChild(this.createVideoPresetCard(item, 'animation-card-square'));
                });
            }
        }

        this.setupVideoObserver();
    },

    createVideoPresetCard(preset, extraClass) {
        const card = document.createElement('div');
        card.className = `preset-visual-card video-card ${extraClass || ''}`;
        card.title = this.getPresetDisplayLabel(preset);
        card.dataset.presetId = preset.id;

        let mediaHtml = '';
        if (preset.video) {
            let cacheBust = '';
            try {
                if (typeof require !== 'undefined') {
                    const fs = require('fs');
                    const stat = fs.statSync(preset.video);
                    cacheBust = '?v=' + Math.floor(stat.mtimeMs || stat.mtime.getTime());
                }
            } catch (e) {}
            const src = 'file:///' + preset.video.replace(/\\/g, '/') + cacheBust;
            mediaHtml = `<video class="anim-square-video" src="${src}" loop muted playsinline preload="metadata"></video>`;
        } else {
            mediaHtml = `
                <div class="pvc-video-placeholder">
                    <span class="pvc-placeholder-icon">▶</span>
                    <span class="pvc-placeholder-label">${preset.displayName || 'VIDEO'}</span>
                </div>`;
        }

        const isFav = SearchFavorites.isFavorite(preset.id);

        card.innerHTML = `
            <div class="video-preview-container anim-square-box">
                ${mediaHtml}
                <button class="fav-btn anim-fav-btn ${isFav ? 'active' : ''}" data-fav-id="${preset.id}" title="Toggle Favorite">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="${isFav ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                    </svg>
                </button>
            </div>
            <div class="card-meta-row anim-card-footer">
                <span class="card-title anim-card-name" title="${this.getPresetDisplayLabel(preset)}">${this.getPresetDisplayLabel(preset)}</span>
                <button class="action-btn card-apply-btn anim-apply-btn" title="Apply to selected layer">Apply</button>
            </div>
        `;

        const applyBtn = card.querySelector('.card-apply-btn');
        if (applyBtn) {
            applyBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.applyPreset(preset.path, this.getPresetDisplayLabel(preset));
            });
        }

        card.addEventListener('click', () => {
            this.applyPreset(preset.path, this.getPresetDisplayLabel(preset));
        });

        const favBtn = card.querySelector('.fav-btn');
        if (favBtn) {
            favBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                SearchFavorites.toggleFavorite(preset.id, this.getPresetDisplayLabel(preset));
                const active = SearchFavorites.isFavorite(preset.id);
                favBtn.classList.toggle('active', active);
                const poly = favBtn.querySelector('polygon');
                if (poly) poly.setAttribute('fill', active ? 'currentColor' : 'none');
            });
        }

        return card;
    },

    createImagePresetCard(preset, extraClass) {
        const card = document.createElement('div');
        card.className = `preset-visual-card image-card ${extraClass || ''}`;
        card.title = this.getPresetDisplayLabel(preset);
        card.dataset.presetId = preset.id;

        let mediaHtml = '';
        if (preset.image) {
            const src = 'file:///' + preset.image.replace(/\\/g, '/');
            mediaHtml = `<img class="pvc-media" src="${src}" alt="${this.getPresetDisplayLabel(preset)}" loading="lazy"/>`;
        } else {
            mediaHtml = `
                <div class="pvc-image-placeholder">
                    <span class="pvc-sample-text">${(this.getPresetDisplayLabel(preset)).substring(0, 2).toUpperCase()}</span>
                </div>`;
        }

        const isFav = SearchFavorites.isFavorite(preset.id);

        card.innerHTML = `
            <div class="card-media-wrap">
                ${mediaHtml}
                <button class="fav-btn ${isFav ? 'active' : ''}" data-fav-id="${preset.id}" title="Toggle Favorite">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="${isFav ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                    </svg>
                </button>
            </div>
            <div class="card-meta-row">
                <span class="card-title" title="${this.getPresetDisplayLabel(preset)}">${this.getPresetDisplayLabel(preset)}</span>
                <button class="action-btn card-apply-btn" title="Apply to selected layer">Apply</button>
            </div>
        `;

        const applyBtn = card.querySelector('.card-apply-btn');
        if (applyBtn) {
            applyBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.applyPreset(preset.path, this.getPresetDisplayLabel(preset));
            });
        }

        card.addEventListener('click', () => {
            this.applyPreset(preset.path, this.getPresetDisplayLabel(preset));
        });

        const favBtn = card.querySelector('.fav-btn');
        if (favBtn) {
            favBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                SearchFavorites.toggleFavorite(preset.id, this.getPresetDisplayLabel(preset));
                const active = SearchFavorites.isFavorite(preset.id);
                favBtn.classList.toggle('active', active);
                const poly = favBtn.querySelector('polygon');
                if (poly) poly.setAttribute('fill', active ? 'currentColor' : 'none');
            });
        }

        return card;
    },

    applyPreset(presetPath, presetName) {
        if (!presetPath) {
            showToast('Preset file not found', 'err');
            return;
        }
        const safePath = presetPath.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        showToast('Applying ' + presetName + '…', 'ok');
        evalScript(`applyPresetWithKeyframeAdaptation('${safePath}')`, (result) => {
            if (result === 'ok') {
                showToast('✓ Applied: ' + presetName, 'ok');
            } else if (result !== '') {
                evalScript(`applyPreset('${safePath}')`);
            }
        });
    }
};

window.TextEffects = TextEffects;

