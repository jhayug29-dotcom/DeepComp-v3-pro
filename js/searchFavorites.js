// ═══════════════════════════════════════════════════════════════════════════════
//  DeepComp — Global Search & Favorites Manager (v2.0)
// ═══════════════════════════════════════════════════════════════════════════════

const SearchFavorites = {
    favorites: new Set(),

    init() {
        this.loadFavorites();
        this.bindEvents();
    },

    loadFavorites() {
        try {
            const raw = localStorage.getItem('deepcomp_favorites');
            if (raw) {
                const arr = JSON.parse(raw);
                this.favorites = new Set(arr);
            }
        } catch (e) {
            this.favorites = new Set();
        }
    },

    saveFavorites() {
        try {
            localStorage.setItem('deepcomp_favorites', JSON.stringify(Array.from(this.favorites)));
        } catch (e) {}
    },

    isFavorite(id) {
        return this.favorites.has(id);
    },

    toggleFavorite(id, title) {
        if (this.favorites.has(id)) {
            this.favorites.delete(id);
            showToast('Removed from favorites', 'ok');
        } else {
            this.favorites.add(id);
            showToast('✓ Added to favorites', 'ok');
        }
        this.saveFavorites();
        this.updateFavoriteUI();
    },

    updateFavoriteUI() {
        document.querySelectorAll('.fav-btn').forEach(btn => {
            const id = btn.dataset.favId;
            if (id) {
                btn.classList.toggle('active', this.favorites.has(id));
            }
        });
    },

    bindEvents() {
        const searchInput = document.getElementById('dc-global-search-input');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.performGlobalSearch(e.target.value.trim());
            });
            searchInput.addEventListener('focus', () => {
                if (searchInput.value.trim().length > 0) {
                    this.openSearchOverlay();
                }
            });
            searchInput.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    this.closeSearchOverlay();
                    searchInput.blur();
                }
            });
        }

        const overlay = document.getElementById('dc-search-overlay');
        if (overlay) {
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) this.closeSearchOverlay();
            });
        }
    },

    openSearchOverlay() {
        const overlay = document.getElementById('dc-search-overlay');
        if (overlay) overlay.classList.add('active');
    },

    closeSearchOverlay() {
        const overlay = document.getElementById('dc-search-overlay');
        if (overlay) overlay.classList.remove('active');
    },

    getAllSearchableItems() {
        const items = [];

        // 1. Built-in AE Tools
        const tools = [
            { name: 'Solid Layer', category: 'Tools', action: () => evalScript('addSolid()'), icon: '■' },
            { name: 'Adjustment Layer', category: 'Tools', action: () => evalScript('addAdjustmentLayer()'), icon: '◐' },
            { name: 'Null Object', category: 'Tools', action: () => evalScript('addNull()'), icon: '⬡' },
            { name: 'Camera', category: 'Tools', action: () => evalScript('addCamera()'), icon: '📷' },
            { name: 'Text Layer', category: 'Tools', action: () => evalScript('addText()'), icon: 'T' },
            { name: 'Shape Layer', category: 'Tools', action: () => evalScript('addShape()'), icon: '◆' },
            { name: 'Duplicate Layer', category: 'Tools', action: () => evalScript('duplicateLayer()'), icon: '⧉' },
            { name: 'Trim In Point', category: 'Tools', action: () => evalScript('trimInPoint()'), icon: '⇤' },
            { name: 'Trim Out Point', category: 'Tools', action: () => evalScript('trimOutPoint()'), icon: '⇥' },
            { name: 'Split Layers', category: 'Tools', action: () => evalScript('splitLayers()'), icon: '✂' },
            { name: 'Precompose', category: 'Tools', action: () => evalScript('precompose()'), icon: '📁' },
            { name: 'Un-Precomp (Decompose)', category: 'Tools', action: () => evalScript('unprecomp()'), icon: '📂' },
            { name: 'Center in Comp', category: 'Tools', action: () => evalScript('centerInComp()'), icon: '🎯' },
            { name: 'Fit to Comp', category: 'Tools', action: () => evalScript('fitToComp(\'all\')'), icon: '⊡' },
            { name: 'Sequence Layers', category: 'Tools', action: () => evalScript('sequenceLayers(0)'), icon: '⇶' },
            { name: 'Remove All Effects', category: 'Tools', action: () => evalScript('removeAllEffects()'), icon: '⊘' },
            { name: 'Copy Properties', category: 'Tools', action: () => evalScript('copyProperties()'), icon: '📋' },
            { name: 'Paste Properties', category: 'Tools', action: () => evalScript('pasteProperties()'), icon: '📑' },
            { name: 'Organise Project Assets', category: 'Tools', action: () => evalScript('organiseProject()'), icon: '🗂' },
            { name: 'Smooth Zoom In', category: 'Tools', action: () => evalScript('applySmoothZoomIn()'), icon: '🔍' },
            { name: 'Smooth Zoom Out', category: 'Tools', action: () => evalScript('applySmoothZoomOut()'), icon: '🔎' }
        ];
        items.push(...tools);

        // 2. Presets from TextEffects module
        if (window.TextEffects && window.TextEffects.allPresets) {
            window.TextEffects.allPresets.forEach(p => {
                let catLabel = 'Preset';
                let iconChar = '✨';
                if (p.category === 'animation-enhancement') {
                    catLabel = 'Animation Enhancement';
                    iconChar = '⚡';
                } else if (p.category === 'icon-preset') {
                    catLabel = 'Icon Preset';
                    iconChar = '🖼️';
                } else if (p.category === 'text-animation') {
                    catLabel = 'Text Animation';
                    iconChar = '▶';
                } else if (p.category === 'text-effect') {
                    catLabel = 'Text Effect';
                    iconChar = '✦';
                }
                items.push({
                    name: p.displayName || p.name,
                    category: catLabel,
                    icon: iconChar,
                    action: () => TextEffects.applyPreset(p.path, p.displayName || p.name)
                });
            });
        }

        // 3. SFX Sounds from SFXLibrary
        if (window.SFXLibrary && window.SFXLibrary.db && window.SFXLibrary.db.sounds) {
            window.SFXLibrary.db.sounds.forEach(s => {
                items.push({
                    name: s.displayName,
                    category: 'SFX Sound',
                    icon: '🎵',
                    action: () => {
                        SFXLibrary.insertSFX(s.id);
                    }
                });
            });
        }

        return items;
    },

    performGlobalSearch(query) {
        if (!query) {
            this.closeSearchOverlay();
            return;
        }

        this.openSearchOverlay();
        const container = document.getElementById('dc-search-results');
        if (!container) return;

        const q = query.toLowerCase();
        const all = this.getAllSearchableItems();
        const matches = all.filter(item => item.name.toLowerCase().includes(q) || item.category.toLowerCase().includes(q));

        container.innerHTML = '';
        if (matches.length === 0) {
            container.innerHTML = `<div class="search-empty">No results found for "${query}"</div>`;
            return;
        }

        matches.slice(0, 25).forEach(item => {
            const row = document.createElement('div');
            row.className = 'search-result-row';
            row.innerHTML = `
                <span class="sr-icon">${item.icon || '•'}</span>
                <div class="sr-info">
                    <div class="sr-title">${this.highlight(item.name, query)}</div>
                    <div class="sr-cat">${item.category}</div>
                </div>
                <button class="sr-action-btn">Action</button>
            `;

            row.addEventListener('click', () => {
                item.action();
                this.closeSearchOverlay();
                const searchInput = document.getElementById('dc-global-search-input');
                if (searchInput) searchInput.value = '';
            });

            container.appendChild(row);
        });
    },

    highlight(text, query) {
        const idx = text.toLowerCase().indexOf(query.toLowerCase());
        if (idx === -1) return text;
        return text.substring(0, idx) + '<mark>' + text.substring(idx, idx + query.length) + '</mark>' + text.substring(idx + query.length);
    }
};

window.SearchFavorites = SearchFavorites;
