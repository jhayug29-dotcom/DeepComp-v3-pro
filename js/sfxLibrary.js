// ═══════════════════════════════════════════════════════════════════════════════
//  DeepComp — SFX Sound Design Library (v2.0)
//  Local-first sound manager, waveform engine, sound stack builder & AE bridge
// ═══════════════════════════════════════════════════════════════════════════════

const SFXLibrary = {
    // ── State ─────────────────────────────────────────────────────────────────
    db: {
        folders: [],
        sounds: [],
        soundStacks: [],
        settings: {
            previewVolume: 0.8,
            defaultInsertMode: 'cti', // 'cti' | 'selected_start' | 'selected_end'
            defaultOffset: 0.0
        }
    },
    activeFolder: 'all', // 'all' | 'favorites' | 'recent' | 'most_used' | <folder_id>
    searchQuery: '',
    sortBy: 'name', // 'name' | 'date_added' | 'recent' | 'most_used' | 'duration'
    currentPlayingId: null,
    audioPlayer: null,
    audioContext: null,
    selectedSoundId: null,
    selectedSoundIds: new Set(),
    isMultiSelectMode: false,
    updateTimer: null,
    searchRenderTimer: null,
    waveformQueue: [],
    waveformWorkerRunning: false,
    folderOpenState: {},
    renderToken: 0,
    cardRenderVersion: 0,
    waveformObserver: null,
    waveformHydrationScheduled: new Set(),
    missingPathCache: Object.create(null),
    soundById: new Map(),
    soundByPath: new Map(),
    folderSoundCounts: Object.create(null),
    libraryStats: { favorites: 0, recent: 0, mostUsed: 0 },
    sortedCache: Object.create(null),
    virtualList: [],
    virtualScrollEl: null,
    virtualScrollHandler: null,
    virtualLastRange: '',
    virtualResizeObserver: null,
    virtualCardHeight: 112,
    virtualGap: 7,
    lastImportProgressAt: 0,
    lastImportProgressValue: '',

    // ── Supported Formats ─────────────────────────────────────────────────────
    SUPPORTED_EXTS: ['.wav', '.mp3', '.aiff', '.aif', '.m4a', '.aac'],

    // ── Initialization ────────────────────────────────────────────────────────
    init() {
        this.initAudioPlayer();
        this.loadDatabase();
        this.bindEvents();
        this.bindVirtualization();
        this.rebuildIndexes();
        this.renderFolders();
        this.renderSounds();
    },

    // ── Audio Player Setup (Singleton) ────────────────────────────────────────
    initAudioPlayer() {
        if (!this.audioPlayer) {
            this.audioPlayer = new Audio();
            this.audioPlayer.volume = this.db.settings.previewVolume || 0.8;

            this.audioPlayer.addEventListener('timeupdate', () => {
                if (this.currentPlayingId) {
                    this.updatePlayProgress();
                }
            });

            this.audioPlayer.addEventListener('ended', () => {
                this.stop();
            });

            this.audioPlayer.addEventListener('error', () => {
                this.stop();
                if (window.showToast) window.showToast('Audio playback error', 'err');
            });
        }
    },

    getAudioContext() {
        if (!this.audioContext && (window.AudioContext || window.webkitAudioContext)) {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            this.audioContext = new AudioCtx();
        }
        return this.audioContext;
    },

    // ── Storage Paths & Persistence ───────────────────────────────────────────
    getStoragePath() {
        if (typeof require === 'undefined') return null;
        const path = require('path');
        const userLibRoot = typeof getUserLibraryRoot === 'function' ? getUserLibraryRoot() : '';
        if (!userLibRoot) return null;
        return path.join(userLibRoot, 'library', 'SFX', 'sfx_library.json');
    },

    loadDatabase() {
        if (typeof require === 'undefined') {
            this.loadDefaultState();
            return;
        }

        const fs = require('fs');
        const path = require('path');
        const dbPath = this.getStoragePath();
        if (!dbPath) {
            this.loadDefaultState();
            return;
        }

        try {
            const dir = path.dirname(dbPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }

            if (fs.existsSync(dbPath)) {
                const raw = fs.readFileSync(dbPath, 'utf8');
                const parsed = JSON.parse(raw);
                this.db = {
                    folders: Array.isArray(parsed.folders) ? parsed.folders : [],
                    sounds: parsed.sounds || [],
                    soundStacks: parsed.soundStacks || [],
                    settings: Object.assign({
                        previewVolume: 0.8,
                        defaultInsertMode: 'cti',
                        defaultOffset: 0.0
                    }, parsed.settings || {})
                };
                this.migrateDatabase();
                this.rebuildIndexes();
                this.saveDatabase();
            } else {
                this.loadDefaultState();
                this.saveDatabase();
            }
        } catch (e) {
            console.error('Error loading SFX DB:', e);
            this.loadDefaultState();
        }
    },

    rebuildIndexes() {
        this.soundById = new Map();
        this.soundByPath = new Map();
        this.folderSoundCounts = Object.create(null);
        let favorites = 0, recent = 0, mostUsed = 0;
        (this.db.sounds || []).forEach(s => {
            this.soundById.set(s.id, s);
            if (s.filePath) this.soundByPath.set(String(s.filePath).toLowerCase(), s.id);
            if (s.folderId) this.folderSoundCounts[s.folderId] = (this.folderSoundCounts[s.folderId] || 0) + 1;
            if (s.isFavorite) favorites++;
            if ((s.lastUsed || 0) > 0) recent++;
            if ((s.useCount || 0) > 0) mostUsed++;
        });
        this.libraryStats = { favorites, recent, mostUsed };
        this.sortedCache = Object.create(null);
    },

    invalidateSortCache() {
        this.sortedCache = Object.create(null);
    },

    scheduleSaveDatabase() {
        clearTimeout(this._saveTimer);
        this._saveTimer = setTimeout(() => this.saveDatabase(), 250);
    },

    migrateDatabase() {
        // Backward compatible migration: older SFX entries did not have hierarchy/import metadata.
        // The SFX sidebar must contain only folders the user actually imported.
        // Older builds created fake category folders; remove those legacy entries.
        const legacyIds = new Set(['whooshes','impacts','ui','transitions','risers','hits','glitches','cinematic','my_sounds']);
        const legacyNames = new Set(['whooshes','impacts','ui & clicks','transitions','risers','hits & thuds','glitches','cinematic','my sounds']);
        this.db.folders = (this.db.folders || [])
            .map(f => Object.assign({ parentId: null, isImported: false }, f))
            .filter(f => f.isImported || (!legacyIds.has(f.id) && !legacyNames.has(String(f.name || '').toLowerCase())));

        // Keep old sounds visible in All SFX without inventing a fake folder for them.
        this.db.sounds = (this.db.sounds || []).map(s => Object.assign({ tags: [], waveform: [], folderId: null }, s));
        const validFolderIds = new Set(this.db.folders.map(f => f.id));
        this.db.sounds.forEach(s => {
            if (s.folderId && !validFolderIds.has(s.folderId)) s.folderId = null;
        });
    },

    loadDefaultState() {
        this.db = {
            // No fake/default SFX folders. Sidebar entries are created only by imports.
            folders: [],
            sounds: [],
            soundStacks: [],
            settings: {
                previewVolume: 0.8,
                defaultInsertMode: 'cti',
                defaultOffset: 0.0
            }
        };
    },

    getDefaultFolders() {
        // Deliberately empty: the SFX sidebar must never invent folders.
        return [];
    },

    saveDatabase() {
        if (typeof require === 'undefined') return;
        const fs = require('fs');
        const path = require('path');
        const dbPath = this.getStoragePath();
        if (!dbPath) return;
        try {
            const dir = path.dirname(dbPath);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            if (this._saveInFlight) {
                this._saveQueued = true;
                return;
            }
            this._saveInFlight = true;
            const doWrite = () => {
                let payload;
                try { payload = JSON.stringify(this.db); }
                catch (err) { this._saveInFlight = false; console.error('Error serializing SFX DB:', err); return; }
                fs.writeFile(dbPath, payload, 'utf8', () => {
                    this._saveInFlight = false;
                    if (this._saveQueued) {
                        this._saveQueued = false;
                        this.scheduleSaveDatabase();
                    }
                });
            };
            // Let active UI/input work happen first.
            const idle = window.requestIdleCallback || ((cb) => setTimeout(cb, 40));
            idle(doWrite, { timeout: 600 });
        } catch (e) {
            this._saveInFlight = false;
            console.error('Error saving SFX DB:', e);
        }
    },

    // ── Import SFX (Single, Multiple & Drag-and-Drop) ─────────────────────────
    openAddSFXDialog() {
        let input = document.getElementById('sfx-hidden-file-input');
        if (!input) {
            input = document.createElement('input');
            input.id = 'sfx-hidden-file-input';
            input.type = 'file';
            input.multiple = true;
            input.accept = this.SUPPORTED_EXTS.join(',');
            input.style.display = 'none';
            document.body.appendChild(input);

            input.addEventListener('change', (e) => {
                if (e.target.files && e.target.files.length > 0) {
                    const files = Array.from(e.target.files);
                    this.importFileList(files);
                    input.value = '';
                }
            });
        }
        input.click();
    },

    // ── Import Entire Folder ─────────────────────────────────────────────────
    openFolderDialog() {
        // In CEP / Node.js context we use the native folder picker via evalScript
        if (typeof evalScript === 'function' && typeof require !== 'undefined') {
            // Use After Effects ExtendScript to open a native folder picker
            evalScript('pickFolderForSFX()', (folderPath) => {
                if (folderPath && folderPath !== 'null' && folderPath !== '' && !folderPath.startsWith('EvalScript')) {
                    this.importFolderByPath(folderPath.trim());
                } else {
                    // Fallback: HTML5 directory picker
                    this._openFolderInputFallback();
                }
            });
        } else {
            this._openFolderInputFallback();
        }
    },

    _openFolderInputFallback() {
        let input = document.getElementById('sfx-hidden-folder-input');
        if (!input) {
            input = document.createElement('input');
            input.id = 'sfx-hidden-folder-input';
            input.type = 'file';
            input.webkitdirectory = true;
            input.multiple = true;
            input.style.display = 'none';
            document.body.appendChild(input);

            input.addEventListener('change', (e) => {
                if (e.target.files && e.target.files.length > 0) {
                    // Filter to audio files only
                    const audioFiles = Array.from(e.target.files).filter(f => {
                        const ext = ('.' + f.name.split('.').pop()).toLowerCase();
                        return this.SUPPORTED_EXTS.includes(ext);
                    });
                    if (audioFiles.length > 0) {
                        this.importDirectoryFileList(audioFiles);
                    } else {
                        if (window.showToast) window.showToast('No supported audio files found in folder.', 'err');
                    }
                    input.value = '';
                }
            });
        }
        input.click();
    },

    // Browser/CEP fallback for <input webkitdirectory>: preserve the complete
    // relative folder hierarchy instead of flattening every file into one folder.
    async importDirectoryFileList(fileList) {
        if (!fileList || !fileList.length) return;
        const files = Array.from(fileList);
        const rootPath = (files[0].webkitRelativePath || files[0].name || '').split('/')[0];
        const rootName = rootPath || 'Imported SFX';
        const stamp = Date.now();
        const rootId = 'imported_' + this.slug(rootName) + '_' + stamp;
        const folderMap = { '': rootId };
        const folders = [];

        files.forEach(file => {
            const rel = String(file.webkitRelativePath || file.name || '').replace(/\\/g, '/');
            const parts = rel.split('/');
            parts.pop();
            let parentRel = '';
            for (let i = 1; i < parts.length; i++) {
                const childRel = parts.slice(1, i + 1).join('/');
                if (!folderMap[childRel]) {
                    const parentId = folderMap[parentRel] || rootId;
                    const id = 'imported_' + this.slug(rootName + '_' + childRel) + '_' + stamp + '_' + i;
                    folderMap[childRel] = id;
                    folders.push({ id, name: parts[i], icon: '📁', parentId, isImported: true });
                }
                parentRel = childRel;
            }
        });

        this.db.folders.push({ id: rootId, name: rootName, icon: '📂', parentId: null, isImported: true, importedPath: rootName });
        folders.forEach(f => this.db.folders.push(f));

        const pseudoFiles = files.map(file => {
            const rel = String(file.webkitRelativePath || file.name || '').replace(/\\/g, '/');
            const parts = rel.split('/');
            parts.pop();
            const relDir = parts.slice(1).join('/');
            return { path: file.path || file.name, name: file.name, targetFolderId: folderMap[relDir] || rootId };
        });

        this.activeFolder = rootId;
        this.folderOpenState[rootId] = true;
        await this.importFileList(pseudoFiles, null, { importedRootId: rootId });
        this.saveDatabase();
        this.renderFolders();
        this.renderSounds();
        if (window.showToast) window.showToast(`✓ Imported folder “${rootName}” (${pseudoFiles.length} sounds)`, 'ok');
    },

    // Recursively scan a folder path using Node.js fs and import all audio files found
    async importFolderByPath(folderPath) {
        if (typeof require === 'undefined') return;
        const fs = require('fs');
        const path = require('path');

        if (!fs.existsSync(folderPath)) {
            if (window.showToast) window.showToast('Folder not found: ' + folderPath, 'err');
            return;
        }

        const rootName = path.basename(folderPath);
        const importStamp = Date.now();
        const rootId = 'imported_' + this.slug(rootName) + '_' + importStamp;
        const folderMap = { '': rootId };
        const discoveredFolders = [];
        const audioFilePaths = [];

        // Walk once and preserve the real folder hierarchy. Every imported folder gets its own library folder.
        const scanDir = (dir, relativeDir, depth) => {
            if (depth > 8) return;
            let entries = [];
            try { entries = fs.readdirSync(dir); } catch (e) { return; }
            entries.forEach(entryName => {
                const full = path.join(dir, entryName);
                const rel = relativeDir ? path.join(relativeDir, entryName) : entryName;
                let isDir = false;
                try { isDir = fs.statSync(full).isDirectory(); } catch (e) { return; }
                if (isDir) {
                    const childRel = rel;
                    const childId = 'imported_' + this.slug(rootName + '_' + childRel) + '_' + importStamp;
                    folderMap[childRel] = childId;
                    discoveredFolders.push({ id: childId, name: entryName, icon: '📁', parentRel: relativeDir, isImported: true });
                    scanDir(full, childRel, depth + 1);
                } else {
                    const ext = path.extname(entryName).toLowerCase();
                    if (this.SUPPORTED_EXTS.includes(ext)) {
                        audioFilePaths.push({ path: full, name: entryName, relativeDir: relativeDir || '' });
                    }
                }
            });
        };
        scanDir(folderPath, '', 0);

        if (audioFilePaths.length === 0) {
            if (window.showToast) window.showToast('No supported audio files found in folder.', 'err');
            return;
        }

        // Root folder first, then child folders. Never merge different imports just because names match.
        this.db.folders.push({ id: rootId, name: rootName, icon: '📂', parentId: null, isImported: true, importedPath: folderPath });
        discoveredFolders.forEach(f => {
            const parentId = folderMap[f.parentRel] || rootId;
            this.db.folders.push({ id: f.id, name: f.name, icon: f.icon, parentId, isImported: true, importedPath: path.join(folderPath, f.parentRel, f.name) });
        });

        const pseudoFiles = audioFilePaths.map(item => ({
            path: item.path,
            name: item.name,
            targetFolderId: folderMap[item.relativeDir] || rootId
        }));

        this.activeFolder = rootId;
        this.renderFolders();
        await this.importFileList(pseudoFiles, null, { importedRootId: rootId });
        this.folderOpenState[rootId] = true;
        this.saveDatabase();
        this.renderFolders();
        this.renderSounds();
        if (window.showToast) window.showToast(`✓ Imported folder “${rootName}” (${audioFilePaths.length} sounds)`, 'ok');
    },

    slug(str) {
        return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 70) || 'folder';
    },

    async importFileList(fileList, targetFolderIdOverride, options = {}) {
        if (!fileList || fileList.length === 0) return;
        const files = Array.from(fileList);
        const total = files.length;
        this.showImportProgress(0, total);

        let importedCount = 0;
        let skippedCount = 0;
        const importedIds = [];
        const defaultTarget = targetFolderIdOverride ||
            ((this.activeFolder && !['all', 'favorites', 'recent', 'most_used'].includes(this.activeFolder))
                ? this.activeFolder
                : (this.db.folders[0] ? this.db.folders[0].id : null));

        // Fast import: create lightweight records first. Waveforms/duration are hydrated in the background,
        // so importing 40+ sounds never waits for 40 full audio decodes before the UI becomes usable.
        for (let i = 0; i < total; i++) {
            const file = files[i];
            const filePath = file.path || file.name;
            const ext = (filePath.match(/\.[^.]+$/) || [''])[0].toLowerCase();
            if (!this.SUPPORTED_EXTS.includes(ext)) { skippedCount++; this.showImportProgress(i + 1, total); continue; }

            const existing = this.soundByPath.get(String(filePath).toLowerCase());
            if (existing) { skippedCount++; this.showImportProgress(i + 1, total); continue; }

            const folderId = file.targetFolderId || defaultTarget;
            const soundItem = this.createLightweightSoundItem(file, folderId);
            if (soundItem) {
                this.db.sounds.push(soundItem);
                this.soundById.set(soundItem.id, soundItem);
                this.soundByPath.set(String(filePath).toLowerCase(), soundItem.id);
                if (folderId) this.folderSoundCounts[folderId] = (this.folderSoundCounts[folderId] || 0) + 1;
                this.invalidateSortCache();
                importedIds.push(soundItem.id);
                importedCount++;
            }
            this.showImportProgress(i + 1, total);
            // Yield every few files to keep CEP's UI thread responsive.
            if (i % 6 === 5) await new Promise(r => setTimeout(r, 0));
        }

        this.hideImportProgress();
        this.scheduleSaveDatabase();
        this.renderFolders();
        this.renderSounds();

        if (importedCount > 0 && !options.importedRootId) {
            if (window.showToast) window.showToast(`✓ Imported ${importedCount} sound${importedCount > 1 ? 's' : ''}`, 'ok');
        } else if (importedCount === 0 && skippedCount > 0) {
            if (window.showToast) window.showToast('No new valid audio files imported.', 'err');
        }
    },

    createLightweightSoundItem(fileObj, folderId) {
        const filePath = fileObj.path || fileObj.name;
        const rawName = fileObj.name ? fileObj.name.replace(/\.[^.]+$/, '') : 'SFX Sound';
        return {
            id: 'sfx_' + Date.now() + '_' + Math.random().toString(36).substr(2, 7),
            filePath,
            displayName: this.formatDisplayName(rawName),
            folderId,
            tags: this.extractInitialTags(rawName),
            isFavorite: false,
            duration: 0,
            waveform: [],
            useCount: 0,
            lastUsed: 0,
            dateAdded: Date.now(),
            waveformReady: false
        };
    },

    queueWaveformHydration(ids) {
        if (!ids || !ids.length) return;
        const unique = ids.filter(id => !this.waveformHydrationScheduled.has(id));
        if (!unique.length) return;
        unique.forEach(id => this.waveformHydrationScheduled.add(id));
        this.waveformQueue.push(...unique);
        if (this.waveformWorkerRunning) return;
        this.waveformWorkerRunning = true;

        const runNext = async () => {
            const id = this.waveformQueue.shift();
            if (!id) {
                this.waveformWorkerRunning = false;
                return;
            }
            const sound = this.soundById.get(id);
            if (sound && !sound.waveformReady) {
                try {
                    const audioData = await this.readAudioBuffer({ path: sound.filePath, name: sound.displayName });
                    if (audioData) {
                        sound.duration = audioData.duration || 0;
                        // 28 bars are enough for a compact preview and are much cheaper than 48.
                        sound.waveform = this.generateWaveformPeaks(audioData, 28);
                        sound.waveformReady = true;
                        this.updateSoundCardVisuals(sound);
                    }
                } catch (e) {
                    console.warn('Deferred waveform decode:', sound ? sound.filePath : '', e);
                } finally {
                    this.waveformHydrationScheduled.delete(id);
                }
            } else {
                this.waveformHydrationScheduled.delete(id);
            }
            const schedule = window.requestIdleCallback || ((cb) => setTimeout(cb, 50));
            schedule(runNext, { timeout: 180 });
        };
        const schedule = window.requestIdleCallback || ((cb) => setTimeout(cb, 16));
        schedule(runNext, { timeout: 120 });
    },

    observeVisibleWaveforms() {
        if (this.waveformObserver) {
            try { this.waveformObserver.disconnect(); } catch (e) {}
        }
        const cards = document.querySelectorAll('#sfx-grid .sfx-card[data-id]');
        if (!cards.length) return;
        const hydrate = (card) => {
            const id = card.getAttribute('data-id');
            const sound = this.soundById.get(id);
            if (sound && !sound.waveformReady) this.queueWaveformHydration([id]);
        };
        if ('IntersectionObserver' in window) {
            this.waveformObserver = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        hydrate(entry.target);
                        try { this.waveformObserver.unobserve(entry.target); } catch (e) {}
                    }
                });
            }, { root: document.getElementById('sfx-scroll-area') || null, rootMargin: '220px 0px' });
            cards.forEach(card => this.waveformObserver.observe(card));
        } else {
            // CEP fallback: only hydrate the first viewport-sized batch.
            Array.prototype.slice.call(cards, 0, 12).forEach(hydrate);
        }
    },

    updateSoundCardVisuals(sound) {
        const card = document.querySelector(`.sfx-card[data-id="${sound.id}"]`);
        if (!card) return;
        const waveform = card.querySelector('.sfx-waveform-container');
        if (waveform) {
            const old = waveform.querySelector('.sfx-waveform-svg');
            if (old) old.outerHTML = this.generateWaveformSvg(sound.waveform || [], sound.id);
        }
        const duration = card.querySelector('.sfx-duration');
        if (duration) duration.textContent = this.formatTime(sound.duration);
    },

    async createSoundItem(fileObj, folderId) {
        const filePath = fileObj.path || fileObj.name;
        const rawName = fileObj.name ? fileObj.name.replace(/\.[^.]+$/, '') : 'SFX Sound';
        const displayName = this.formatDisplayName(rawName);

        let duration = 0;
        let waveform = [];

        try {
            const audioData = await this.readAudioBuffer(fileObj);
            if (audioData) {
                duration = audioData.duration || 0;
                waveform = this.generateWaveformPeaks(audioData, 48);
            }
        } catch (e) {
            console.warn('Waveform decode fallback for:', filePath, e);
            waveform = this.generateFallbackPeaks(48);
        }

        const tags = this.extractInitialTags(rawName);

        return {
            id: 'sfx_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
            filePath: filePath,
            displayName: displayName,
            folderId: folderId,
            tags: tags,
            isFavorite: false,
            duration: duration,
            waveform: waveform,
            useCount: 0,
            lastUsed: 0,
            dateAdded: Date.now()
        };
    },

    formatDisplayName(str) {
        return str
            .replace(/[_-]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    },

    extractInitialTags(name) {
        const words = name.toLowerCase().split(/[^a-z0-9]+/);
        return words.filter(w => w.length > 2 && !['audio', 'sound', 'sfx', 'final', 'v1', 'v2', 'wav', 'mp3'].includes(w));
    },

    async readAudioBuffer(fileObj) {
        const ctx = this.getAudioContext();
        if (!ctx) return null;

        let arrayBuffer = null;
        if ((typeof File !== 'undefined' && fileObj instanceof File) || (typeof Blob !== 'undefined' && fileObj instanceof Blob)) {
            arrayBuffer = await fileObj.arrayBuffer();
        } else if (typeof require !== 'undefined' && fileObj.path) {
            const fs = require('fs');
            const buffer = fs.readFileSync(fileObj.path);
            arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
        }

        if (!arrayBuffer) return null;
        return await ctx.decodeAudioData(arrayBuffer);
    },

    generateWaveformPeaks(audioBuffer, numBars) {
        const rawData = audioBuffer.getChannelData(0);
        const samplesPerBar = Math.floor(rawData.length / numBars);
        const peaks = [];

        let maxVal = 0.01;
        for (let i = 0; i < numBars; i++) {
            const start = i * samplesPerBar;
            let sum = 0;
            for (let j = 0; j < samplesPerBar; j++) {
                sum += Math.abs(rawData[start + j] || 0);
            }
            const avg = sum / samplesPerBar;
            peaks.push(avg);
            if (avg > maxVal) maxVal = avg;
        }

        // Normalize 0.1 .. 1.0
        return peaks.map(p => Math.max(0.12, Math.min(1.0, p / maxVal)));
    },

    generateFallbackPeaks(numBars) {
        const peaks = [];
        for (let i = 0; i < numBars; i++) {
            const factor = Math.sin((i / numBars) * Math.PI);
            peaks.push(Math.max(0.15, factor * (0.4 + Math.random() * 0.5)));
        }
        return peaks;
    },

    showImportProgress(cur, total) {
        const now = Date.now();
        const value = `IMPORTING... ${cur < 10 ? '0' + cur : cur} / ${total < 10 ? '0' + total : total}`;
        // Updating DOM 100,000 times is itself a source of lag. Paint at most ~10 FPS.
        if (cur !== total && now - this.lastImportProgressAt < 100 && value === this.lastImportProgressValue) return;
        this.lastImportProgressAt = now;
        this.lastImportProgressValue = value;
        const el = document.getElementById('sfx-import-indicator');
        if (el) {
            el.style.display = 'flex';
            const text = el.querySelector('.sfx-import-text');
            if (text) text.innerText = value;
        }
    },

    hideImportProgress() {
        const el = document.getElementById('sfx-import-indicator');
        if (el) el.style.display = 'none';
    },

    // ── Audio Preview & Scrubbing ─────────────────────────────────────────────
    togglePreview(soundId) {
        if (this.currentPlayingId === soundId) {
            this.pause();
        } else {
            this.play(soundId);
        }
    },

    play(soundId, seekTime = null) {
        const sound = this.soundById.get(soundId);
        if (!sound) return;

        if (this.currentPlayingId !== soundId) {
            this.stop();
            this.currentPlayingId = soundId;

            let fileSrc = sound.filePath;
            if (typeof require !== 'undefined') {
                const fs = require('fs');
                if (!fs.existsSync(fileSrc)) {
                    if (window.showToast) window.showToast('⚠ File not found on disk', 'err');
                    this.currentPlayingId = null;
                    this.renderSounds();
                    return;
                }
            }
            fileSrc = 'file:///' + sound.filePath.replace(/\\/g, '/');
            this.audioPlayer.src = fileSrc;
        }

        this.audioPlayer.volume = this.db.settings.previewVolume;

        if (seekTime !== null && seekTime >= 0) {
            this.audioPlayer.currentTime = seekTime;
        }

        this.audioPlayer.play().then(() => {
            this.updatePlayingCardState();
            this.updateTransportBar();
        }).catch(err => {
            console.error('Audio play error:', err);
            this.stop();
        });
    },

    pause() {
        if (this.audioPlayer) {
            this.audioPlayer.pause();
        }
        this.updatePlayingCardState(false);
        this.updateTransportBar();
    },

    stop() {
        if (this.audioPlayer) {
            this.audioPlayer.pause();
            this.audioPlayer.currentTime = 0;
        }
        const prevId = this.currentPlayingId;
        this.currentPlayingId = null;
        this.updatePlayingCardState(false, prevId);
        this.updateTransportBar();
    },

    seek(soundId, ratio) {
        const sound = this.soundById.get(soundId);
        if (!sound) return;
        const targetTime = (sound.duration || 1) * Math.max(0, Math.min(1, ratio));

        if (this.currentPlayingId === soundId) {
            this.audioPlayer.currentTime = targetTime;
        } else {
            this.play(soundId, targetTime);
        }
    },

    setVolume(vol) {
        const v = Math.max(0, Math.min(1, parseFloat(vol)));
        this.db.settings.previewVolume = v;
        if (this.audioPlayer) {
            this.audioPlayer.volume = v;
        }
        this.scheduleSaveDatabase();
    },

    updatePlayProgress() {
        if (!this.currentPlayingId || !this.audioPlayer) return;
        const cur = this.audioPlayer.currentTime || 0;
        const dur = this.audioPlayer.duration || 1;
        const ratio = Math.max(0, Math.min(1, cur / dur));

        // Update active card waveform playhead
        const card = document.querySelector(`.sfx-card[data-id="${this.currentPlayingId}"]`);
        if (card) {
            const playhead = card.querySelector('.sfx-waveform-playhead');
            if (playhead) playhead.style.width = (ratio * 100) + '%';
            const timeLabel = card.querySelector('.sfx-duration');
            if (timeLabel) timeLabel.innerText = this.formatTime(cur) + ' / ' + this.formatTime(dur);
        }

        // Update transport bar
        const transport = document.getElementById('sfx-transport-bar');
        if (transport && transport.style.display !== 'none') {
            const progress = transport.querySelector('.sfx-tb-progress');
            if (progress) progress.style.width = (ratio * 100) + '%';
            const timeCur = transport.querySelector('.sfx-tb-time-cur');
            if (timeCur) timeCur.innerText = this.formatTime(cur);
        }
    },

    updatePlayingCardState(isPlaying = true, specificId = null) {
        document.querySelectorAll('.sfx-card').forEach(c => {
            const isThis = c.dataset.id === (specificId || this.currentPlayingId);
            c.classList.toggle('playing', isThis && isPlaying && !this.audioPlayer.paused);
            const btn = c.querySelector('.sfx-play-btn');
            if (btn) {
                btn.innerHTML = (isThis && isPlaying && !this.audioPlayer.paused)
                    ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>'
                    : '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>';
            }
            if (!isThis) {
                const playhead = c.querySelector('.sfx-waveform-playhead');
                if (playhead) playhead.style.width = '0%';
                const s = this.soundById.get(c.dataset.id);
                if (s) {
                    const timeLabel = c.querySelector('.sfx-duration');
                    if (timeLabel) timeLabel.innerText = this.formatTime(s.duration);
                }
            }
        });
    },

    updateTransportBar() {
        const tb = document.getElementById('sfx-transport-bar');
        if (!tb) return;

        if (!this.currentPlayingId) {
            tb.style.display = 'none';
            return;
        }

        const sound = this.db.sounds.find(s => s.id === this.currentPlayingId);
        if (!sound) { tb.style.display = 'none'; return; }

        tb.style.display = 'flex';
        const title = tb.querySelector('.sfx-tb-title');
        if (title) title.innerText = sound.displayName;
        const total = tb.querySelector('.sfx-tb-time-total');
        if (total) total.innerText = this.formatTime(sound.duration);
        const playBtn = tb.querySelector('.sfx-tb-play-btn');
        if (playBtn) {
            playBtn.innerHTML = (!this.audioPlayer.paused)
                ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>'
                : '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>';
        }
    },

    // ── Insert into After Effects ─────────────────────────────────────────────
    insertSFX(soundId, options = {}) {
        const sound = this.soundById.get(soundId);
        if (!sound) return;

        if (typeof require !== 'undefined') {
            const fs = require('fs');
            if (!fs.existsSync(sound.filePath)) {
                this.showMissingFileDialog(sound);
                return;
            }
        }

        const mode = options.mode || this.db.settings.defaultInsertMode || 'cti';
        const offset = (typeof options.offset === 'number') ? options.offset : (this.db.settings.defaultOffset || 0);
        const trimIn = options.trimIn || 0;
        const trimOut = options.trimOut || 0;

        const safePath = sound.filePath.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        const safeName = sound.displayName.replace(/'/g, "\\'");

        if (typeof evalScript === 'function') {
            evalScript(`insertSFX('${safePath}', '${safeName}', '${mode}', ${offset}, ${trimIn}, ${trimOut})`, (res) => {
                if (!res || res === 'error') {
                    if (window.showToast) window.showToast('Insert failed — please check After Effects.', 'err');
                    return;
                }
                if (res === 'NO_ACTIVE_COMP') {
                    if (window.showToast) window.showToast('No active composition found. Open a comp first.', 'err');
                    return;
                }
                if (res === 'FILE_NOT_FOUND') {
                    this.showMissingFileDialog(sound);
                    return;
                }

                try {
                    const data = JSON.parse(res);
                    if (data.status === 'ok') {
                        // Track usage & stats
                        const wasRecent = (sound.lastUsed || 0) > 0;
                        const wasUsed = (sound.useCount || 0) > 0;
                        sound.useCount = (sound.useCount || 0) + 1;
                        sound.lastUsed = Date.now();
                        if (!wasRecent) this.libraryStats.recent++;
                        if (!wasUsed) this.libraryStats.mostUsed++;
                        this.scheduleSaveDatabase();
                        this.renderFolders();
                        this.renderSounds();

                        const msg = `✓ Inserted "${sound.displayName}" at ${data.formattedTime || 'CTI'}`;
                        if (window.showToast) window.showToast(msg, 'ok');
                    }
                } catch (e) {
                    if (window.showToast) window.showToast('✓ Inserted into active comp', 'ok');
                }
            });
        }
    },

    // ── Trim & Insert Modal Workflow ──────────────────────────────────────────
    openTrimModal(soundId) {
        const sound = this.soundById.get(soundId);
        if (!sound) return;

        const overlay = document.getElementById('sfx-trim-modal');
        if (!overlay) return;

        overlay.classList.add('active');
        const title = overlay.querySelector('.sfx-trim-title');
        if (title) title.innerText = sound.displayName;

        let trimStart = 0;
        let trimEnd = sound.duration || 1;

        const startInput = document.getElementById('sfx-trim-start');
        const endInput = document.getElementById('sfx-trim-end');
        const durInput = document.getElementById('sfx-trim-dur');

        const updateReadouts = () => {
            if (startInput) startInput.innerText = this.formatTime(trimStart);
            if (endInput) endInput.innerText = this.formatTime(trimEnd);
            if (durInput) durInput.innerText = this.formatTime(Math.max(0, trimEnd - trimStart));
        };
        updateReadouts();

        // Render High-Res Waveform in Modal Canvas
        const canvas = document.getElementById('sfx-trim-canvas');
        if (canvas) {
            this.renderTrimCanvas(canvas, sound.waveform || [], trimStart / (sound.duration || 1), trimEnd / (sound.duration || 1));
        }

        // Preview Selection button
        const previewBtn = document.getElementById('sfx-trim-preview-btn');
        if (previewBtn) {
            previewBtn.onclick = () => {
                this.play(sound.id, trimStart);
                setTimeout(() => {
                    if (this.currentPlayingId === sound.id) this.pause();
                }, (trimEnd - trimStart) * 1000);
            };
        }

        // Confirm Insert
        const confirmBtn = document.getElementById('sfx-trim-confirm-btn');
        if (confirmBtn) {
            confirmBtn.onclick = () => {
                overlay.classList.remove('active');
                this.insertSFX(sound.id, {
                    trimIn: trimStart,
                    trimOut: trimEnd
                });
            };
        }

        const closeBtn = document.getElementById('sfx-trim-close');
        if (closeBtn) closeBtn.onclick = () => overlay.classList.remove('active');
    },

    renderTrimCanvas(canvas, waveform, startRatio, endRatio) {
        const ctx = canvas.getContext('2d');
        const w = canvas.width = canvas.offsetWidth || 300;
        const h = canvas.height = canvas.offsetHeight || 80;
        ctx.clearRect(0, 0, w, h);

        const bars = waveform.length || 60;
        const barW = w / bars;

        for (let i = 0; i < bars; i++) {
            const ratio = i / bars;
            const isSelected = ratio >= startRatio && ratio <= endRatio;
            ctx.fillStyle = isSelected ? '#3b82f6' : 'rgba(255, 255, 255, 0.2)';
            const barH = (waveform[i] || 0.3) * (h * 0.85);
            const y = (h - barH) / 2;
            ctx.fillRect(i * barW + 1, y, Math.max(1, barW - 2), barH);
        }
    },

    // ── Sound Stack System ────────────────────────────────────────────────────
    openSoundStackModal() {
        const overlay = document.getElementById('sfx-stack-modal');
        if (!overlay) return;
        overlay.classList.add('active');
        this.renderStackList();

        const closeBtn = document.getElementById('sfx-stack-close');
        if (closeBtn) closeBtn.onclick = () => overlay.classList.remove('active');

        const insertBtn = document.getElementById('sfx-stack-insert-btn');
        if (insertBtn) {
            insertBtn.onclick = () => {
                this.insertActiveSoundStack();
                overlay.classList.remove('active');
            };
        }
    },

    renderStackList() {
        const container = document.getElementById('sfx-stack-items-list');
        if (!container) return;

        const selected = Array.from(this.selectedSoundIds).map(id => this.db.sounds.find(s => s.id === id)).filter(Boolean);
        if (selected.length === 0) {
            container.innerHTML = '<p class="desc" style="text-align:center;padding:16px;">Select 2 or more SFX cards first to build a Sound Stack.</p>';
            return;
        }

        container.innerHTML = selected.map((s, idx) => `
            <div class="sfx-stack-row" data-id="${s.id}">
                <span class="sfx-stack-name">${s.displayName}</span>
                <div class="sfx-stack-offset-wrap">
                    <label>Offset:</label>
                    <input type="number" step="0.05" value="${(idx * 0.05).toFixed(2)}" class="sfx-stack-offset-input mini-input"/>s
                </div>
            </div>
        `).join('');
    },

    insertActiveSoundStack() {
        const rows = document.querySelectorAll('.sfx-stack-row');
        if (rows.length === 0) return;

        const items = [];
        rows.forEach(r => {
            const id = r.dataset.id;
            const sound = this.db.sounds.find(s => s.id === id);
            const input = r.querySelector('.sfx-stack-offset-input');
            const offset = input ? parseFloat(input.value || 0) : 0;
            if (sound) {
                items.push({
                    filePath: sound.filePath.replace(/\\/g, '\\\\').replace(/'/g, "\\'"),
                    displayName: sound.displayName.replace(/'/g, "\\'"),
                    offset: offset
                });
            }
        });

        if (items.length === 0) return;
        const jsonStr = JSON.stringify({ items: items, insertMode: this.db.settings.defaultInsertMode });

        if (typeof evalScript === 'function') {
            evalScript(`insertSoundStack('${jsonStr.replace(/'/g, "\\'")}')`, (res) => {
                if (res && res !== 'error') {
                    if (window.showToast) window.showToast(`✓ Inserted Sound Stack (${items.length} layers)`, 'ok');
                }
            });
        }
    },

    // ── Missing File Detection & Reconnect ────────────────────────────────────
    showMissingFileDialog(sound) {
        const overlay = document.getElementById('sfx-reconnect-modal');
        if (!overlay) {
            if (window.showToast) window.showToast('⚠ File missing: ' + sound.filePath, 'err');
            return;
        }

        overlay.classList.add('active');
        const text = document.getElementById('sfx-reconnect-msg');
        if (text) text.innerText = `Original file not found:\n"${sound.filePath}"`;

        const locateBtn = document.getElementById('sfx-reconnect-single-btn');
        if (locateBtn) {
            locateBtn.onclick = () => {
                let input = document.createElement('input');
                input.type = 'file';
                input.accept = this.SUPPORTED_EXTS.join(',');
                input.onchange = (e) => {
                    if (e.target.files && e.target.files[0]) {
                        sound.filePath = e.target.files[0].path || e.target.files[0].name;
                        this.saveDatabase();
                        this.renderSounds();
                        overlay.classList.remove('active');
                        if (window.showToast) window.showToast('✓ File reconnected!', 'ok');
                    }
                };
                input.click();
            };
        }

        const bulkBtn = document.getElementById('sfx-reconnect-bulk-btn');
        if (bulkBtn) {
            bulkBtn.onclick = () => this.bulkReconnectFolder(overlay);
        }

        const closeBtn = document.getElementById('sfx-reconnect-close');
        if (closeBtn) closeBtn.onclick = () => overlay.classList.remove('active');
    },

    bulkReconnectFolder(modalOverlay) {
        if (typeof require === 'undefined') return;
        const fs = require('fs');
        const path = require('path');

        let input = document.createElement('input');
        input.type = 'file';
        input.webkitdirectory = true;
        input.onchange = (e) => {
            if (e.target.files && e.target.files.length > 0) {
                const folderPath = path.dirname(e.target.files[0].path || '');
                if (!folderPath || !fs.existsSync(folderPath)) return;

                let reconnected = 0;
                this.db.sounds.forEach(sound => {
                    if (!fs.existsSync(sound.filePath)) {
                        const base = path.basename(sound.filePath);
                        const candidate = path.join(folderPath, base);
                        if (fs.existsSync(candidate)) {
                            sound.filePath = candidate;
                            reconnected++;
                        }
                    }
                });

                this.saveDatabase();
                this.renderSounds();
                if (modalOverlay) modalOverlay.classList.remove('active');
                if (window.showToast) window.showToast(`✓ Reconnected ${reconnected} SFX files!`, 'ok');
            }
        };
        input.click();
    },

    // ── Folder Operations ─────────────────────────────────────────────────────
    createFolder(name, icon = '📁') {
        const trimmed = (name || '').trim();
        if (!trimmed) return;
        const id = 'fld_' + Date.now();
        this.db.folders.push({ id: id, name: trimmed, icon: icon, parentId: null, isImported: false });
        this.scheduleSaveDatabase();
        this.renderFolders();
        this.selectFolder(id);
    },

    renameFolder(folderId, newName) {
        const fld = this.db.folders.find(f => f.id === folderId);
        if (!fld) return;
        const trimmed = (newName || '').trim();
        if (!trimmed) return;
        fld.name = trimmed;
        this.scheduleSaveDatabase();
        this.renderFolders();
    },

    deleteFolder(folderId) {
        const fld = this.db.folders.find(f => f.id === folderId);
        if (!fld) return;
        const ids = this.getFolderDescendantIds(folderId);
        const soundCount = this.db.sounds.reduce((n, s) => n + (ids.has(s.folderId) ? 1 : 0), 0);
        const childCount = Math.max(0, ids.size - 1);
        const msg = `Delete folder "${fld.name}"${childCount ? ` and ${childCount} subfolder${childCount === 1 ? '' : 's'}` : ''}?\n\n${soundCount} SFX will be removed from the DeepComp SFX Library immediately.\n\nOriginal audio files on your computer will NOT be deleted.`;
        if (!confirm(msg)) return;

        // Deleting a folder also removes every SFX assigned to that folder or any
        // nested child folder from the DeepComp library. We intentionally do NOT
        // delete the user's original audio files from disk.
        this.db.sounds = this.db.sounds.filter(s => !ids.has(s.folderId));
        this.db.folders = this.db.folders.filter(f => !ids.has(f.id));
        ids.forEach(id => delete this.folderOpenState[id]);
        if (ids.has(this.activeFolder)) this.activeFolder = 'all';
        this.rebuildIndexes();
        this.invalidateSortCache();
        this.scheduleSaveDatabase();
        this.renderFolders();
        this.renderSounds();
    },

    selectFolder(folderId) {
        this.activeFolder = folderId;
        this.renderFolders();
        this.renderSounds();
    },

    // ── Tag System ────────────────────────────────────────────────────────────
    addTag(soundId, tag) {
        const sound = this.soundById.get(soundId);
        if (!sound) return;
        const clean = (tag || '').toLowerCase().trim();
        if (!clean) return;
        if (!sound.tags) sound.tags = [];
        if (!sound.tags.includes(clean)) {
            sound.tags.push(clean);
            this.saveDatabase();
            this.renderSounds();
        }
    },

    removeTag(soundId, tag) {
        const sound = this.soundById.get(soundId);
        if (!sound || !sound.tags) return;
        sound.tags = sound.tags.filter(t => t !== tag);
        this.scheduleSaveDatabase();
        this.renderSounds();
    },

    // ── Favorites Toggle ──────────────────────────────────────────────────────
    toggleFavorite(soundId) {
        const sound = this.soundById.get(soundId);
        if (!sound) return;
        sound.isFavorite = !sound.isFavorite;
        this.libraryStats.favorites += sound.isFavorite ? 1 : -1;
        this.scheduleSaveDatabase();
        this.renderFolders();
        this.renderSounds();
    },

    // ── Folder tree helpers ───────────────────────────────────────────────────
    getFolderDescendantIds(folderId) {
        const ids = new Set([folderId]);
        let changed = true;
        while (changed) {
            changed = false;
            this.db.folders.forEach(f => {
                if (f.parentId && ids.has(f.parentId) && !ids.has(f.id)) { ids.add(f.id); changed = true; }
            });
        }
        return ids;
    },

    getFolderSoundCount(folderId, includeChildren = true) {
        const ids = includeChildren ? this.getFolderDescendantIds(folderId) : new Set([folderId]);
        return this.db.sounds.filter(s => ids.has(s.folderId)).length;
    },

    updateCurrentFolderLabel() {
        const el = document.getElementById('sfx-current-folder-name');
        if (!el) return;
        const labels = { all: 'All SFX', favorites: 'Favorites', recent: 'Recent', most_used: 'Most Used' };
        el.textContent = labels[this.activeFolder] || ((this.db.folders.find(f => f.id === this.activeFolder) || {}).name || 'All SFX');
    },

    // ── Rendering: Folders Bar ────────────────────────────────────────────────
    renderFolders() {
        const container = document.getElementById('sfx-folder-list');
        if (!container) return;

        const folders = Array.isArray(this.db.folders) ? this.db.folders : [];
        const folderById = Object.create(null);
        const childrenByParent = Object.create(null);
        folders.forEach(f => {
            folderById[f.id] = f;
            const parent = f.parentId || '__root__';
            (childrenByParent[parent] || (childrenByParent[parent] = [])).push(f);
        });
        const soundCountByFolder = this.folderSoundCounts || Object.create(null);
        const descendantCount = Object.create(null);
        const getCount = (id) => {
            if (descendantCount[id] != null) return descendantCount[id];
            let count = soundCountByFolder[id] || 0;
            const kids = childrenByParent[id] || [];
            for (let i = 0; i < kids.length; i++) count += getCount(kids[i].id);
            descendantCount[id] = count;
            return count;
        };

        const systemFilters = [
            { id: 'all', name: 'All SFX', icon: '⚡', count: this.db.sounds.length },
            { id: 'favorites', name: 'Favorites', icon: '♥', count: this.libraryStats.favorites },
            { id: 'recent', name: 'Recent', icon: '🕒', count: this.libraryStats.recent },
            { id: 'most_used', name: 'Most Used', icon: '🔥', count: this.libraryStats.mostUsed }
        ];
        const esc = (v) => String(v == null ? '' : v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
        let html = '<div class="sfx-folder-sidebar-inner">';
        html += '<div class="sfx-folder-section-title">LIBRARY</div><div class="sfx-smart-list">';
        systemFilters.forEach(f => {
            const activeClass = this.activeFolder === f.id ? 'active' : '';
            html += `<button class="sfx-folder-row smart ${activeClass}" onclick="SFXLibrary.selectFolder('${f.id}')"><span class="sfx-folder-chevron ghost"></span><span class="sfx-fld-icon">${f.icon}</span><span class="sfx-folder-row-name">${esc(f.name)}</span><span class="sfx-fld-count">${f.count}</span></button>`;
        });
        html += '</div><div class="sfx-folder-section-title your-folders-title"><span>YOUR FOLDERS</span><span class="sfx-folder-total">' + folders.length + '</span></div><div class="sfx-folder-tree">';

        const roots = (childrenByParent.__root__ || []).filter(f => !f.parentId || !folderById[f.parentId]);
        const renderNode = (fld, depth = 0) => {
            const count = getCount(fld.id);
            const children = childrenByParent[fld.id] || [];
            const open = this.folderOpenState[fld.id] !== false;
            const active = this.activeFolder === fld.id;
            const hasChildren = children.length > 0;
            let out = `<div class="sfx-folder-node" data-folder-id="${esc(fld.id)}">`;
            out += `<button class="sfx-folder-row user-folder ${active ? 'active' : ''}" style="--folder-depth:${Math.min(depth,8)}" onclick="SFXLibrary.selectFolder('${esc(fld.id)}')" oncontextmenu="SFXLibrary.showFolderContextMenu(event, '${esc(fld.id)}')">`;
            out += `<span class="sfx-folder-chevron ${hasChildren ? (open ? 'open' : '') : 'empty'}" ${hasChildren ? `onclick="event.stopPropagation();SFXLibrary.toggleFolderOpen('${esc(fld.id)}')"` : ''}>${hasChildren ? '›' : ''}</span>`;
            out += `<span class="sfx-fld-icon">${fld.isImported ? '📂' : (fld.icon || '📁')}</span><span class="sfx-folder-row-name" title="${esc(fld.name)}">${esc(fld.name)}</span><span class="sfx-fld-count">${count}</span>`;
            if (fld.isImported) out += '<span class="sfx-imported-dot" title="Imported folder"></span>';
            out += `<span class="sfx-folder-delete" role="button" title="Delete folder" onclick="event.stopPropagation();SFXLibrary.deleteFolder('${esc(fld.id)}')">×</span>`;
            out += '</button>';
            if (hasChildren && open) out += '<div class="sfx-folder-children">' + children.map(c => renderNode(c, depth + 1)).join('') + '</div>';
            out += '</div>';
            return out;
        };
        html += roots.map(f => renderNode(f)).join('');
        html += '</div></div>';
        container.innerHTML = html;
    },

    toggleFolderOpen(folderId) {
        this.folderOpenState[folderId] = this.folderOpenState[folderId] === false;
        this.renderFolders();
    },

    promptNewFolder() {
        const name = prompt('Enter new folder name:');
        if (name) this.createFolder(name);
    },

    showFolderContextMenu(e, folderId) {
        e.preventDefault();
        const fld = this.db.folders.find(f => f.id === folderId);
        if (!fld) return;

        const choice = prompt(`Folder "${fld.name}" Actions:\n1. Rename Folder\n2. Delete Folder\nEnter 1 or 2:`);
        if (choice === '1') {
            const newName = prompt('Enter new name for folder:', fld.name);
            if (newName) this.renameFolder(folderId, newName);
        } else if (choice === '2') {
            this.deleteFolder(folderId);
        }
    },

    // ── Rendering: SFX Cards ──────────────────────────────────────────────────
    renderSounds() {
        const grid = document.getElementById('sfx-grid');
        if (!grid) return;
        this.updateCurrentFolderLabel();

        const q = this.searchQuery ? this.searchQuery.toLowerCase().trim() : '';
        const folderNames = Object.create(null);
        if (q) (this.db.folders || []).forEach(f => { folderNames[f.id] = String(f.name || '').toLowerCase(); });

        let list;
        if (this.activeFolder === 'favorites') {
            list = this.db.sounds.filter(s => s.isFavorite);
        } else if (this.activeFolder === 'recent') {
            list = this.db.sounds.filter(s => s.lastUsed > 0);
        } else if (this.activeFolder === 'most_used') {
            list = this.db.sounds.filter(s => s.useCount > 0);
        } else if (this.activeFolder !== 'all') {
            const folderIds = this.getFolderDescendantIds(this.activeFolder);
            list = this.db.sounds.filter(s => folderIds.has(s.folderId));
        } else {
            list = this.db.sounds.slice();
        }

        if (q) {
            list = list.filter(s => {
                const name = String(s.displayName || '').toLowerCase();
                const file = String(s.filePath || '').toLowerCase();
                const tagMatch = Array.isArray(s.tags) && s.tags.some(t => String(t).toLowerCase().includes(q));
                const folderMatch = !!(folderNames[s.folderId] && folderNames[s.folderId].includes(q));
                return name.includes(q) || file.includes(q) || tagMatch || folderMatch;
            });
        }

        // Sorting is cached so typing/searching a large library does not repeatedly sort 100k entries.
        if (this.sortBy === 'name' && !q && this.activeFolder === 'all' && this.sortedCache.name) {
            list = this.sortedCache.name.slice();
        } else {
            if (this.sortBy === 'name') list.sort((a,b) => String(a.displayName||'').localeCompare(String(b.displayName||'')));
            else if (this.sortBy === 'date_added') list.sort((a,b) => (b.dateAdded||0)-(a.dateAdded||0));
            else if (this.sortBy === 'duration') list.sort((a,b) => (b.duration||0)-(a.duration||0));
            else if (this.sortBy === 'recent') list.sort((a,b) => (b.lastUsed||0)-(a.lastUsed||0));
            else if (this.sortBy === 'most_used') list.sort((a,b) => (b.useCount||0)-(a.useCount||0));
            if (this.sortBy === 'name' && !q && this.activeFolder === 'all') this.sortedCache.name = list.slice();
        }

        if (list.length === 0) {
            this.virtualList = [];
            this.renderToken++;
            grid.classList.remove('sfx-virtual-grid');
            grid.style.height = '';
            grid.innerHTML = `
                <div class="sfx-empty-state">
                    <span class="sfx-empty-icon">🎵</span>
                    <h4>No Sound Effects Found</h4>
                    <p class="desc">Drag &amp; drop audio files (.wav, .mp3, .aif, .m4a) or click below to import.</p>
                    <button class="action-btn dc-btn-primary" onclick="SFXLibrary.openAddSFXDialog()">+ Add SFX</button>
                </div>`;
            return;
        }

        this.virtualList = list;
        this.renderToken++;
        this.virtualLastRange = '';
        this.renderVirtualWindow(true);
    },

    bindVirtualization() {
        const scroller = document.querySelector('.sfx-content-pane .sfx-scroll-area');
        if (!scroller) return;
        this.virtualScrollEl = scroller;
        if (this.virtualScrollHandler) scroller.removeEventListener('scroll', this.virtualScrollHandler);
        this.virtualScrollHandler = () => this.renderVirtualWindow(false);
        scroller.addEventListener('scroll', this.virtualScrollHandler, { passive: true });
        if ('ResizeObserver' in window) {
            this.virtualResizeObserver = new ResizeObserver(() => this.renderVirtualWindow(true));
            this.virtualResizeObserver.observe(scroller);
        }
    },

    renderVirtualWindow(force) {
        const grid = document.getElementById('sfx-grid');
        const scroller = this.virtualScrollEl || document.querySelector('.sfx-content-pane .sfx-scroll-area');
        const list = this.virtualList || [];
        if (!grid || !scroller || !list.length) return;

        const width = Math.max(132, grid.clientWidth || scroller.clientWidth || 132);
        const gap = this.virtualGap;
        const minCard = 132;
        const cols = Math.max(1, Math.floor((width + gap) / (minCard + gap)));
        const cardWidth = Math.max(100, (width - gap * (cols - 1)) / cols);
        const rowHeight = this.virtualCardHeight + gap;
        const totalRows = Math.ceil(list.length / cols);
        const viewportRows = Math.max(3, Math.ceil((scroller.clientHeight || 360) / rowHeight));
        const firstRow = Math.max(0, Math.floor((scroller.scrollTop || 0) / rowHeight) - 2);
        const lastRow = Math.min(totalRows - 1, firstRow + viewportRows + 4);
        const start = firstRow * cols;
        const end = Math.min(list.length, (lastRow + 1) * cols);
        const rangeKey = `${cols}:${start}:${end}:${Math.round(width)}`;
        grid.classList.add('sfx-virtual-grid');
        grid.style.position = 'relative';
        grid.style.display = 'block';
        grid.style.height = Math.max(0, totalRows * rowHeight - gap) + 'px';
        if (!force && rangeKey === this.virtualLastRange) return;
        this.virtualLastRange = rangeKey;

        let html = '';
        for (let i = start; i < end; i++) {
            const row = Math.floor(i / cols);
            const col = i % cols;
            const left = col * (cardWidth + gap);
            const top = row * rowHeight;
            html += this.renderSFXCard(list[i], `position:absolute;left:${left.toFixed(1)}px;top:${top.toFixed(1)}px;width:${cardWidth.toFixed(1)}px;height:${this.virtualCardHeight}px;box-sizing:border-box;`);
        }
        grid.innerHTML = html;
        this.observeVisibleWaveforms();
    },

    renderSFXCard(sound, inlineStyle = '') {
        const isPlaying = this.currentPlayingId === sound.id && this.audioPlayer && !this.audioPlayer.paused;
        const isSelected = this.selectedSoundId === sound.id || this.selectedSoundIds.has(sound.id);
        const favClass = sound.isFavorite ? 'active' : '';

        // Do not hit the filesystem while painting every card. Missing-file checks are
        // cached and only performed when needed (insert/reconnect/import), preventing
        // hundreds of synchronous fs calls from stalling CEP.
        const isMissing = sound.isMissing === true;

        const durationStr = this.formatTime(sound.duration);
        const waveformSvg = this.generateWaveformSvg(sound.waveform || [], sound.id);

        return `
            <div style="${inlineStyle}" class="sfx-card ${isPlaying ? 'playing' : ''} ${isSelected ? 'selected' : ''} ${isMissing ? 'missing-file' : ''}"
                 data-id="${sound.id}"
                 onclick="SFXLibrary.handleCardClick(event, '${sound.id}')"
                 ondblclick="SFXLibrary.togglePreview('${sound.id}')"
                 oncontextmenu="SFXLibrary.showCardContextMenu(event, '${sound.id}')">

                <div class="sfx-card-top">
                    <button class="sfx-play-btn" onclick="event.stopPropagation(); SFXLibrary.togglePreview('${sound.id}')" title="Play / Pause">
                        ${isPlaying
                            ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>'
                            : '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>'}
                    </button>

                    <div class="sfx-waveform-container" onclick="event.stopPropagation(); SFXLibrary.handleWaveformClick(event, '${sound.id}')">
                        ${waveformSvg}
                        <div class="sfx-waveform-playhead"></div>
                    </div>
                </div>

                <div class="sfx-card-mid">
                    <div class="sfx-card-title-wrap">
                        <span class="sfx-card-title" title="${this.escapeHtml(sound.displayName)}">${this.escapeHtml(sound.displayName)}</span>
                        ${isMissing ? '<span class="sfx-missing-badge" title="File not found on disk">⚠ Missing</span>' : ''}
                    </div>
                    <span class="sfx-duration">${durationStr}</span>
                </div>

                <div class="sfx-card-bottom">
                    <button class="sfx-fav-btn ${favClass}" onclick="event.stopPropagation(); SFXLibrary.toggleFavorite('${sound.id}')" title="Favorite">
                        ${sound.isFavorite ? '♥' : '♡'}
                    </button>

                    <div class="sfx-card-actions">
                        <button class="action-btn sfx-trim-btn" onclick="event.stopPropagation(); SFXLibrary.openTrimModal('${sound.id}')" title="Trim &amp; Insert">
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/></svg>
                        </button>
                        <button class="action-btn dc-btn-primary sfx-insert-btn" onclick="event.stopPropagation(); SFXLibrary.insertSFX('${sound.id}')">
                            <span>Insert</span>
                        </button>
                    </div>
                </div>
            </div>
        `;
    },

    generateWaveformSvg(waveform, soundId) {
        const bars = waveform.length > 0 ? waveform : this.generateFallbackPeaks(28);
        const count = bars.length;
        let rects = '';
        for (let i = 0; i < count; i++) {
            const h = Math.max(12, Math.round(bars[i] * 100));
            const y = Math.round((100 - h) / 2);
            rects += `<rect x="${(i / count) * 100}%" y="${y}%" width="${Math.max(1.5, 100 / count - 0.8)}%" height="${h}%" rx="1"/>`;
        }
        return `<svg class="sfx-waveform-svg" viewBox="0 0 100 100" preserveAspectRatio="none">${rects}</svg>`;
    },

    handleWaveformClick(e, soundId) {
        const rect = e.currentTarget.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const ratio = Math.max(0, Math.min(1, clickX / rect.width));
        this.seek(soundId, ratio);
    },

    handleCardClick(e, soundId) {
        if (e.shiftKey || e.ctrlKey || e.metaKey) {
            if (this.selectedSoundIds.has(soundId)) {
                this.selectedSoundIds.delete(soundId);
            } else {
                this.selectedSoundIds.add(soundId);
            }
            this.selectedSoundId = soundId;
        } else {
            this.selectedSoundIds.clear();
            this.selectedSoundIds.add(soundId);
            this.selectedSoundId = soundId;
        }
        this.renderSounds();
    },

    showCardContextMenu(e, soundId) {
        e.preventDefault();
        const sound = this.soundById.get(soundId);
        if (!sound) return;

        const options = [
            '1. Preview / Stop',
            '2. Insert at CTI',
            '3. Trim & Insert',
            '4. Rename SFX',
            '5. Edit Tags',
            '6. Move to Folder',
            '7. Reveal in Explorer',
            '8. Remove from Library'
        ];

        const choice = prompt(`SFX: "${sound.displayName}"\n${options.join('\n')}\nEnter number (1-8):`);
        if (!choice) return;

        switch (choice.trim()) {
            case '1': this.togglePreview(soundId); break;
            case '2': this.insertSFX(soundId); break;
            case '3': this.openTrimModal(soundId); break;
            case '4': {
                const newName = prompt('Enter new display name:', sound.displayName);
                if (newName && newName.trim()) {
                    sound.displayName = newName.trim();
                    this.scheduleSaveDatabase();
                    this.renderSounds();
                }
                break;
            }
            case '5': {
                const curTags = (sound.tags || []).join(', ');
                const newTags = prompt('Enter tags (comma-separated):', curTags);
                if (newTags !== null) {
                    sound.tags = newTags.split(',').map(t => t.trim().toLowerCase()).filter(Boolean);
                    this.scheduleSaveDatabase();
                    this.renderSounds();
                }
                break;
            }
            case '6': {
                const fldNames = this.db.folders.map((f, i) => `${i + 1}. ${f.name}`).join('\n');
                const fIndex = prompt(`Select Folder:\n${fldNames}\nEnter number:`);
                const idx = parseInt(fIndex, 10) - 1;
                if (!isNaN(idx) && this.db.folders[idx]) {
                    if (sound.folderId) this.folderSoundCounts[sound.folderId] = Math.max(0, (this.folderSoundCounts[sound.folderId] || 1) - 1);
                    sound.folderId = this.db.folders[idx].id;
                    this.folderSoundCounts[sound.folderId] = (this.folderSoundCounts[sound.folderId] || 0) + 1;
                    this.scheduleSaveDatabase();
                    this.renderFolders();
                    this.renderSounds();
                }
                break;
            }
            case '7': {
                if (typeof require !== 'undefined') {
                    const cp = require('child_process');
                    if (process.platform === 'win32') {
                        cp.exec(`explorer.exe /select,"${sound.filePath}"`);
                    } else {
                        cp.exec(`open -R "${sound.filePath}"`);
                    }
                }
                break;
            }
            case '8': {
                if (confirm(`Remove "${sound.displayName}" from DeepComp library? (Original file will NOT be deleted)`)) {
                    const removed = this.soundById.get(soundId);
                    this.db.sounds = this.db.sounds.filter(s => s.id !== soundId);
                    this.selectedSoundIds.delete(soundId);
                    if (this.currentPlayingId === soundId) this.stop();
                    this.rebuildIndexes();
                    this.invalidateSortCache();
                    this.scheduleSaveDatabase();
                    this.renderFolders();
                    this.renderSounds();
                }
                break;
            }
        }
    },

    // ── Helper Formatting ─────────────────────────────────────────────────────
    escapeHtml(value) {
        return String(value == null ? '' : value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    },

    formatTime(sec) {
        if (!sec || isNaN(sec) || sec <= 0) return '00:00';
        const m = Math.floor(sec / 60);
        const s = Math.floor(sec % 60);
        const ms = Math.floor((sec % 1) * 100);
        return (m < 10 ? '0' + m : m) + ':' + (s < 10 ? '0' + s : s) + (sec < 60 ? '.' + (ms < 10 ? '0' + ms : ms) : '');
    },

    // ── Event Binding (Drag/Drop & Shortcuts) ──────────────────────────────────
    bindEvents() {
        // Drag and Drop support on panel
        const sfxTab = document.getElementById('tab-sfx');
        if (sfxTab) {
            ['dragenter', 'dragover'].forEach(evt => {
                sfxTab.addEventListener(evt, (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    sfxTab.classList.add('sfx-drag-over');
                });
            });

            ['dragleave', 'drop'].forEach(evt => {
                sfxTab.addEventListener(evt, (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    sfxTab.classList.remove('sfx-drag-over');
                });
            });

            sfxTab.addEventListener('drop', async (e) => {
                if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                    const files = Array.from(e.dataTransfer.files);
                    if (typeof require !== 'undefined') {
                        try {
                            const fs = require('fs');
                            const normalFiles = [];
                            for (const f of files) {
                                const p = f.path;
                                if (p && fs.existsSync(p) && fs.statSync(p).isDirectory()) {
                                    await this.importFolderByPath(p);
                                } else {
                                    normalFiles.push(f);
                                }
                            }
                            if (normalFiles.length > 0) {
                                await this.importFileList(normalFiles);
                            }
                            return;
                        } catch (err) {
                            console.warn('Drop folder detection fallback:', err);
                        }
                    }
                    this.importFileList(files);
                }
            });
        }

        // Global Search Input
        const searchInput = document.getElementById('sfx-search-input');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.searchQuery = e.target.value;
                clearTimeout(this.searchRenderTimer);
                this.searchRenderTimer = setTimeout(() => this.renderSounds(), 70);
            });
        }

        // Volume Slider in Transport Bar
        const volSlider = document.getElementById('sfx-volume-slider');
        if (volSlider) {
            volSlider.value = this.db.settings.previewVolume;
            volSlider.addEventListener('input', (e) => {
                this.setVolume(e.target.value);
            });
        }

        // Keyboard Shortcuts (Space to play/pause, Enter to insert, Arrows to navigate)
        window.addEventListener('keydown', (e) => {
            const activeTab = document.querySelector('.tab-btn.active');
            if (activeTab && activeTab.getAttribute('data-tab') !== 'tab-sfx') return;
            if (['input', 'textarea', 'select'].includes(document.activeElement && document.activeElement.tagName ? document.activeElement.tagName.toLowerCase() : '')) return;

            if (e.code === 'Space') {
                e.preventDefault();
                if (this.selectedSoundId) {
                    this.togglePreview(this.selectedSoundId);
                }
            } else if (e.code === 'Enter') {
                e.preventDefault();
                if (this.selectedSoundId) {
                    this.insertSFX(this.selectedSoundId);
                }
            }
        });
    }
};

window.SFXLibrary = SFXLibrary;
