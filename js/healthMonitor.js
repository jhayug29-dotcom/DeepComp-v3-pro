// ═══════════════════════════════════════════════════════════════════════════════
//  DeepComp — Health Monitor & Smart Notification System (v2.0)
// ═══════════════════════════════════════════════════════════════════════════════

const HealthMonitor = {
    timer: null,
    lastWarningTime: 0,
    warningCooldownMs: 120000, // 2 minutes between repeat warnings
    lastState: 'healthy', // 'healthy' | 'warning' | 'critical'
    lastMemoryPercent: 0,
    stats: {
        aeStatus: 'Connected',
        ramPercent: 0,
        ramUsedGB: '0',
        ramTotalGB: '0',
        cacheStatus: 'Normal',
        panelStatus: 'Healthy'
    },

    init() {
        this.updateStats();
        // Poll every 10 seconds (lightweight)
        this.timer = setInterval(() => this.updateStats(), 10000);
        this.bindEvents();
    },

    bindEvents() {
        const pill = document.getElementById('dc-health-indicator');
        if (pill) {
            pill.addEventListener('click', () => this.openHealthModal());
        }
        const purgeBtn = document.getElementById('dc-purge-cache-btn');
        if (purgeBtn) {
            purgeBtn.addEventListener('click', () => this.clearCache());
        }
    },

    getOSMemory() {
        if (typeof require !== 'undefined') {
            try {
                const os = require('os');
                const total = os.totalmem();
                const free = os.freemem();
                const used = total - free;
                const percent = Math.round((used / total) * 100);
                return {
                    totalGB: (total / (1024 * 1024 * 1024)).toFixed(1),
                    usedGB: (used / (1024 * 1024 * 1024)).toFixed(1),
                    percent: percent
                };
            } catch (e) {}
        }
        return null;
    },

    updateStats() {
        const osMem = this.getOSMemory();
        if (osMem) {
            this.stats.ramPercent = osMem.percent;
            this.stats.ramUsedGB = osMem.usedGB;
            this.stats.ramTotalGB = osMem.totalGB;
            this.lastMemoryPercent = osMem.percent;
        }

        // Query AE ExtendScript memory stats
        evalScript('getAEHealthStats()', (raw) => {
            if (raw && raw !== 'UNAVAILABLE' && raw !== '') {
                try {
                    const aeData = JSON.parse(raw);
                    if (aeData.usedMemory && aeData.appMemory) {
                        this.stats.aeStatus = 'Running (' + (aeData.comps || 0) + ' comps)';
                    }
                } catch (e) {}
            }

            this.evaluateHealth();
        });
    },

    evaluateHealth() {
        let state = 'healthy';
        const ram = this.stats.ramPercent;

        if (ram >= 90) {
            state = 'critical';
        } else if (ram >= 80) {
            state = 'warning';
        } else {
            state = 'healthy';
        }

        this.updateHeaderPill(state, ram);

        // Smart Notification with Cooldown & Hysteresis
        const now = Date.now();
        if (state !== 'healthy' && (state !== this.lastState || (now - this.lastWarningTime > this.warningCooldownMs))) {
            this.lastWarningTime = now;
            if (state === 'critical') {
                showHealthBanner('🔴 Low Available Memory (' + ram + '%)', 'After Effects may experience performance or stability issues.', 'critical');
            } else if (state === 'warning') {
                showHealthBanner('⚠️ High Memory Usage (' + ram + '%)', 'System memory usage is elevated. Consider purging cache.', 'warning');
            }
        } else if (state === 'healthy' && this.lastState !== 'healthy') {
            showToast('✓ Memory Usage Normal (' + ram + '%)', 'ok');
            hideHealthBanner();
        }

        this.lastState = state;
    },

    updateHeaderPill(state, ram) {
        const pill = document.getElementById('dc-health-indicator');
        if (!pill) return;

        pill.className = 'dc-health-pill ' + state;
        const text = ram ? (ram + '%') : 'Healthy';
        pill.innerHTML = `<span class="health-dot"></span><span class="health-text">${text}</span>`;
        pill.title = `AE & System Health: ${state.toUpperCase()} (${ram}% RAM)\nClick for System Health details`;
    },

    openHealthModal() {
        const modal = document.getElementById('dc-health-modal');
        if (!modal) return;

        const aeEl = document.getElementById('dc-hm-ae-status');
        if (aeEl) aeEl.textContent = this.stats.aeStatus;
        const ramEl = document.getElementById('dc-hm-ram-val');
        if (ramEl) ramEl.textContent = this.stats.ramPercent + '% (' + this.stats.ramUsedGB + ' / ' + this.stats.ramTotalGB + ' GB)';
        const barEl = document.getElementById('dc-hm-ram-bar');
        if (barEl) barEl.style.width = this.stats.ramPercent + '%';
        
        const ramStatus = this.stats.ramPercent >= 90 ? 'Critical' : (this.stats.ramPercent >= 80 ? 'High' : 'Normal');
        const statEl = document.getElementById('dc-hm-ram-status');
        if (statEl) {
            statEl.textContent = ramStatus;
            statEl.className = 'health-tag ' + (this.stats.ramPercent >= 90 ? 'tag-crit' : (this.stats.ramPercent >= 80 ? 'tag-warn' : 'tag-ok'));
        }

        modal.classList.add('active');
    },

    clearCache() {
        evalScript('purgeAECache()', () => {
            showToast('✓ After Effects Cache Purged', 'ok');
            this.updateStats();
            hideHealthBanner();
        });
    }
};

function closeHealthModal() {
    const modal = document.getElementById('dc-health-modal');
    if (modal) modal.classList.remove('active');
}

function showHealthBanner(title, desc, type) {
    const banner = document.getElementById('dc-health-banner');
    if (!banner) return;
    const t = document.getElementById('dc-hb-title');
    const d = document.getElementById('dc-hb-desc');
    if (t) t.textContent = title;
    if (d) d.textContent = desc;
    banner.className = 'dc-health-banner active ' + (type || 'warning');
}

function hideHealthBanner() {
    const banner = document.getElementById('dc-health-banner');
    if (banner) banner.classList.remove('active');
}

window.HealthMonitor = HealthMonitor;
