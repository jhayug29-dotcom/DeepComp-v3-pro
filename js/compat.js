// ═══════════════════════════════════════════════════════════════════════════
//  DeepComp — compatibility layer, auto-setup wizard & motion controller
//  Loaded BEFORE main.js. Exposes: dcSafeEval(), dcCap(), DC state.
// ═══════════════════════════════════════════════════════════════════════════

const DC = {
    env: null,
    caps: {},
    ready: false,
    setupDone: false,
    cs: null
};

try { DC.cs = new CSInterface(); } catch (e) { /* running outside AE */ }

/* ── Safe ExtendScript calls ──────────────────────────────────────────────
   Escapes every argument so file names / comp names containing quotes,
   backslashes or unicode never break the call. */
function dcArg(value) {
    return JSON.stringify(String(value === undefined || value === null ? "" : value));
}

function dcSafeEval(fnName, args, callback) {
    const list = (args || []).map(a => (typeof a === "number" || typeof a === "boolean")
        ? String(a) : dcArg(a)).join(", ");
    const script = `${fnName}(${list})`;
    if (!DC.cs) { console.log("mock evalScript:", script); if (callback) callback(""); return; }
    DC.cs.evalScript(script, (res) => {
        if (res === "EvalScript error.") {
            dcToast(`"${fnName}" is not available in this After Effects version`, "error");
            if (callback) callback("");
            return;
        }
        if (callback) callback(res);
    });
}

function dcParse(raw, fallback) {
    if (!raw || raw === "EvalScript error.") return fallback;
    try { return JSON.parse(raw); } catch (e) { return fallback; }
}

function dcToast(msg, type) {
    const el = document.getElementById("deepcomp-toast");
    if (!el) return;
    el.textContent = msg;
    el.className = "deepcomp-toast show " + (type || "");
    clearTimeout(el._t);
    el._t = setTimeout(() => { el.className = "deepcomp-toast " + (type || ""); }, 2800);
}

function dcCap(key) {
    // Unknown capability = allowed (never block a feature we did not probe).
    return DC.caps[key] === undefined ? true : !!DC.caps[key].ok;
}

/* ── Load the host-side compat script, then read the environment ───────── */
function dcBootHost(done) {
    if (!DC.cs) { done && done(); return; }
    const root = DC.cs.getSystemPath("extension");
    const jsx = root.replace(/\\/g, "/") + "/jsx/compat.jsx";
    DC.cs.evalScript(`$.evalFile(new File(${JSON.stringify(jsx)}))`, () => {
        DC.cs.evalScript("dcGetEnvironment()", (raw) => {
            DC.env = dcParse(raw, null);
            if (DC.env && DC.env.capabilities) {
                DC.env.capabilities.forEach(c => { DC.caps[c.key] = c; });
            }
            DC.ready = true;
            done && done();
        });
    });
}

/* ── Feature gating: dim & block anything this AE build cannot do ───────── */
const DC_FEATURE_MAP = [
    { sel: "[onclick*='applyPreset'], .preset-btn", cap: "presets" },
    { sel: "[onclick*='precompose'], [onclick*='unprecomp']", cap: "precompose" },
    { sel: "[onclick*='savePrecomp']", cap: "library" },
    { sel: "[onclick*='openAEEffectsPanel']", cap: "openFxPanel" },
    { sel: "[onclick*='setAnchor'], [onclick*='alignLayer']", cap: "sourceRect" }
];

function dcApplyFeatureGates() {
    DC_FEATURE_MAP.forEach(({ sel, cap }) => {
        if (dcCap(cap)) return;
        const note = (DC.caps[cap] && DC.caps[cap].note) || "Not supported by your After Effects version";
        document.querySelectorAll(sel).forEach(el => {
            el.classList.add("dc-unsupported");
            el.title = note;
            el.addEventListener("click", (e) => {
                e.stopImmediatePropagation();
                e.preventDefault();
                dcToast(note, "error");
            }, true);
        });
    });
}

/* ── Compatibility badge in the header ──────────────────────────────────── */
function dcRenderCompatBar() {
    const bar = document.getElementById("dc-compat-bar");
    if (!bar) return;
    const env = DC.env;
    const failing = Object.keys(DC.caps).filter(k => !DC.caps[k].ok);

    if (!env) {
        bar.className = "dc-compat-bar bad";
        bar.querySelector(".dc-compat-text").textContent = "After Effects not detected";
        return;
    }
    const label = env.year ? `After Effects ${env.year}` : `After Effects ${env.version}`;
    if (!env.supported) {
        bar.className = "dc-compat-bar bad";
        bar.querySelector(".dc-compat-text").textContent = `${label} — unsupported build`;
    } else if (failing.length) {
        bar.className = "dc-compat-bar limited";
        bar.querySelector(".dc-compat-text").textContent =
            `${label} — ${failing.length} feature${failing.length > 1 ? "s" : ""} need setup`;
    } else {
        bar.className = "dc-compat-bar";
        bar.querySelector(".dc-compat-text").textContent = `${label} — all tools verified`;
    }
}

/* ═══════════════════════════════════════════════════════════════════════════
   SETUP WIZARD
   ═════════════════════════════════════════════════════════════════════════ */
const DC_SETUP_STEPS = [
    { key: "detect",      label: "Detecting your After Effects version" },
    { key: "dataFolders", label: "Creating the DeepComp library folders" },
    { key: "fileAccess",  label: "Enabling script file access" },
    { key: "presets",     label: "Installing bundled presets" },
    { key: "writeTest",   label: "Verifying storage permissions" },
    { key: "selftest",    label: "Testing every tool on your build" }
];

function dcWizardEl() { return document.getElementById("dc-wizard"); }

function dcOpenWizard() {
    const w = dcWizardEl();
    if (!w) return;
    const list = document.getElementById("dc-checklist");
    list.innerHTML = DC_SETUP_STEPS.map((s, i) => `
        <div class="dc-check pending" id="dc-step-${s.key}" style="transition-delay:${i * 40}ms">
            <div class="dc-check-dot"></div>
            <div class="dc-check-body">
                <div class="dc-check-label"></div>
                <div class="dc-check-note"></div>
            </div>
        </div>`).join("");
    DC_SETUP_STEPS.forEach(s => {
        document.querySelector(`#dc-step-${s.key} .dc-check-label`).textContent = s.label;
    });
    document.getElementById("dc-progress-bar").style.width = "0%";
    document.getElementById("dc-wizard-finish").disabled = true;
    w.classList.add("active");
}

function dcCloseWizard() {
    const w = dcWizardEl();
    if (w) w.classList.remove("active");
}

function dcSetStep(key, state, note) {
    const el = document.getElementById(`dc-step-${key}`);
    if (!el) return;
    el.className = "dc-check " + state;
    if (note !== undefined) el.querySelector(".dc-check-note").textContent = note;
    const done = document.querySelectorAll(".dc-check.done, .dc-check.warn, .dc-check.fail").length;
    document.getElementById("dc-progress-bar").style.width =
        `${Math.round((done / DC_SETUP_STEPS.length) * 100)}%`;
}

function dcRunSetup() {
    dcOpenWizard();
    dcSetStep("detect", "running");

    dcBootHost(() => {
        if (!DC.env) {
            dcSetStep("detect", "fail", "Could not talk to After Effects");
            document.getElementById("dc-wizard-finish").disabled = false;
            return;
        }
        dcSetStep("detect", DC.env.supported ? "done" : "warn",
            `${DC.env.appName} ${DC.env.version}${DC.env.year ? ` (${DC.env.year})` : ""} · ${DC.env.isWin ? "Windows" : "macOS"}`);

        ["dataFolders", "fileAccess", "presets", "writeTest"].forEach(k => dcSetStep(k, "running"));

        const root = DC.cs ? DC.cs.getSystemPath("extension") : "";
        dcSafeEval("dcAutoSetup", [root], (raw) => {
            const report = dcParse(raw, null);
            if (!report) {
                ["dataFolders", "fileAccess", "presets", "writeTest"]
                    .forEach(k => dcSetStep(k, "fail", "Setup could not run"));
            } else {
                report.steps.forEach(s => dcSetStep(s.key, s.ok ? "done" : "warn", s.note));
                DC.caps = {};
                (report.capabilities || []).forEach(c => { DC.caps[c.key] = c; });
                if (report.env) DC.env = report.env;
            }

            dcSetStep("selftest", "running", "Running a sandboxed test comp…");
            dcSafeEval("dcSelfTest", [], (rawT) => {
                const tests = dcParse(rawT, []);
                const failed = tests.filter(t => !t.ok);
                dcSetStep("selftest", failed.length ? "warn" : "done",
                    failed.length
                        ? `${tests.length - failed.length}/${tests.length} passed · ${failed.map(f => f.key).join(", ")} unavailable`
                        : `All ${tests.length} core tools verified on this build`);
                failed.forEach(f => { DC.caps[f.key] = { key: f.key, ok: false, note: f.note || "Unavailable on this AE version" }; });

                document.getElementById("dc-progress-bar").style.width = "100%";
                document.getElementById("dc-wizard-finish").disabled = false;
                DC.setupDone = true;
                try { localStorage.setItem("dc_setup_version", window.DC_VERSION || "1.2.0"); } catch (e) {}
                dcApplyFeatureGates();
                dcRenderCompatBar();
            });
        });
    });
}

/* ═══════════════════════════════════════════════════════════════════════════
   WIZARD-STYLE STEP NAVIGATION (the panel's tabs, animated)
   ═════════════════════════════════════════════════════════════════════════ */
function dcMoveRail() {
    const rail  = document.querySelector(".dc-rail");
    const track = document.querySelector(".dc-rail-track");
    const active = document.querySelector(".tab-btn.active");
    if (!rail || !track || !active) return;
    const r = rail.getBoundingClientRect();
    const a = active.getBoundingClientRect();
    track.style.width = `${a.width}px`;
    track.style.transform = `translateX(${a.left - r.left - 4}px)`;
}

function dcGoToStep(index, direction) {
    const btns = [...document.querySelectorAll(".tab-btn")];
    const secs = [...document.querySelectorAll(".tab-content")];
    if (index < 0 || index >= btns.length) return;
    secs.forEach(s => s.classList.remove("active", "dc-back"));
    btns.forEach(b => b.classList.remove("active"));
    btns[index].classList.add("active");
    const target = document.getElementById(btns[index].getAttribute("data-tab"));
    if (direction === "back") target.classList.add("dc-back");
    target.classList.add("active");
    dcMoveRail();
    const t = btns[index].getAttribute("data-tab");
    if (t === "tab-effects" && window.TextEffects) window.TextEffects.renderPresets();
    if (t === "tab-sfx" && window.SFXLibrary) {
        window.SFXLibrary.renderFolders();
        window.SFXLibrary.renderSounds();
    }
    if (t === "tab-precomps" && typeof loadLibrary === "function") loadLibrary();
}

function dcStepBy(delta) {
    const btns = [...document.querySelectorAll(".tab-btn")];
    const cur = btns.findIndex(b => b.classList.contains("active"));
    dcGoToStep(cur + delta, delta < 0 ? "back" : "next");
}

/* ── Boot ────────────────────────────────────────────────────────────────── */
document.addEventListener("DOMContentLoaded", () => {
    dcMoveRail();
    window.addEventListener("resize", dcMoveRail);

    document.querySelectorAll(".tab-btn").forEach((btn, i) => {
        btn.addEventListener("click", () => {
            const btns = [...document.querySelectorAll(".tab-btn")];
            const cur = btns.findIndex(b => b.classList.contains("active"));
            dcGoToStep(i, i < cur ? "back" : "next");
        });
    });

    const bar = document.getElementById("dc-compat-bar");
    if (bar) bar.addEventListener("click", dcRunSetup);

    const finish = document.getElementById("dc-wizard-finish");
    if (finish) finish.addEventListener("click", () => { dcCloseWizard(); dcGoToStep(0); });
    const skip = document.getElementById("dc-wizard-skip");
    if (skip) skip.addEventListener("click", dcCloseWizard);

    let installed = null;
    try { installed = localStorage.getItem("dc_setup_version"); } catch (e) {}

    const current = window.DC_VERSION || "1.2.0";

    if (installed !== current) {
        // First run on this machine, or the panel just updated itself →
        // greet the user (once) and configure everything automatically.
        setTimeout(() => {
            if (typeof window.dcFirstRunFlow === "function") window.dcFirstRunFlow();
            else dcRunSetup();
        }, 350);
    } else {
        dcBootHost(() => { dcApplyFeatureGates(); dcRenderCompatBar(); });
    }
});
