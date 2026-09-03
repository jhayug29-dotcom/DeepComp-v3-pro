// ═══════════════════════════════════════════════════════════════════════════
//  DeepComp — Compatibility & Auto-Setup layer (ExtendScript / ES3 safe)
//  Appended to hostscript.jsx. No JSON object is assumed to exist.
// ═══════════════════════════════════════════════════════════════════════════

function _dcEsc(s) {
    s = String(s === undefined || s === null ? "" : s);
    var out = "", i, c;
    for (i = 0; i < s.length; i++) {
        c = s.charAt(i);
        if (c === '"')       out += '\\"';
        else if (c === '\\') out += '\\\\';
        else if (c === '\n') out += '\\n';
        else if (c === '\r') out += '\\r';
        else if (c === '\t') out += '\\t';
        else if (c < ' ')    out += ' ';
        else                 out += c;
    }
    return out;
}
function _dcKV(k, v)     { return '"' + _dcEsc(k) + '":"' + _dcEsc(v) + '"'; }
function _dcKVRaw(k, v)  { return '"' + _dcEsc(k) + '":' + v; }
function _dcBool(b)      { return b ? "true" : "false"; }

// ── AE version -------------------------------------------------------------
function dcAeMajor() {
    var v = parseFloat(app.version);      // "24.6x35" -> 24.6
    return isNaN(v) ? 0 : Math.floor(v);
}

// AE marketing year for a given internal major version.
function dcAeYear() {
    var m = dcAeMajor();
    var map = { 13: 2015, 14: 2017, 15: 2018, 16: 2019, 17: 2020, 18: 2021,
                22: 2022, 23: 2023, 24: 2024, 25: 2025, 26: 2026 };
    if (map[m]) return map[m];
    if (m >= 26) return 2000 + m;         // future builds keep the offset
    return 0;
}

function dcIsWin() {
    return $.os.toLowerCase().indexOf("win") !== -1;
}

// Does this AE build allow scripts to write files / access the network?
function dcScriptFileAccess() {
    try { return app.preferences.getPrefAsLong(
        "Main Pref Section", "Pref_SCRIPTING_FILE_NETWORK_SECURITY") === 1; }
    catch (e) { return false; }
}

// ── Capability probe --------------------------------------------------------
// Feature keys must match the ones used by js/compat.js.
function dcCapabilities() {
    var m = dcAeMajor();
    var caps = [];

    function cap(key, ok, note) {
        caps.push("{" + _dcKV("key", key) + "," + _dcKVRaw("ok", _dcBool(ok)) +
                  "," + _dcKV("note", note || "") + "}");
    }

    // Core layer APIs — present in every supported build
    cap("layers",    m >= 13, m >= 13 ? "" : "Requires After Effects CC 2015 or newer");
    cap("anchor",    typeof LayerCollection !== "undefined");
    cap("align",     true);
    cap("labels",    true);

    // sourceRectAtTime exists since CS6 but "extents" arg behaviour differs
    var srOk = false;
    try { srOk = (typeof AVLayer !== "undefined"); } catch (e) {}
    cap("sourceRect", srOk, srOk ? "" : "Align/anchor fall back to comp centre");

    // Pre-compose / un-precompose
    cap("precompose", m >= 13);

    // Preset application (.ffx) needs file access
    var fa = dcScriptFileAccess();
    cap("presets", fa, fa ? "" : "Enable Preferences > Scripting & Expressions > Allow Scripts to Write Files");
    cap("library",  fa, fa ? "" : "Saving precomps needs script file access");

    // Effect enumeration
    var fx = false;
    try { fx = (app.effects && app.effects.length > 0); } catch (e) {}
    cap("effectSearch", fx, fx ? "" : "Effect list unavailable on this build");

    // Panel command that opens Effects & Presets
    var menu = false;
    try { menu = (typeof app.executeCommand === "function"); } catch (e) {}
    cap("openFxPanel", menu, menu ? "" : "Open the Effects & Presets panel manually");

    return caps;
}

// Full environment report consumed by the panel wizard.
function dcGetEnvironment() {
    var caps = dcCapabilities();
    var parts = [];
    parts.push(_dcKV("appName", app.appName || "After Effects"));
    parts.push(_dcKV("version", app.version));
    parts.push(_dcKVRaw("major", dcAeMajor()));
    parts.push(_dcKVRaw("year", dcAeYear()));
    parts.push(_dcKV("os", $.os));
    parts.push(_dcKVRaw("isWin", _dcBool(dcIsWin())));
    parts.push(_dcKVRaw("fileAccess", _dcBool(dcScriptFileAccess())));
    parts.push(_dcKVRaw("supported", _dcBool(dcAeMajor() >= 13)));
    parts.push(_dcKV("userPresetsDir", dcUserPresetsDir()));
    parts.push(_dcKV("dataDir", dcDataDir()));
    parts.push(_dcKVRaw("capabilities", "[" + caps.join(",") + "]"));
    return "{" + parts.join(",") + "}";
}

// ── Paths -------------------------------------------------------------------
function dcDataDir() {
    var base = dcIsWin()
        ? Folder.userData.fsName + "\\DeepComp\\yugz.fx"
        : Folder.userData.fsName + "/DeepComp/yugz.fx";
    return base;
}

// AE's own "User Presets" folder, version-aware. Works on every AE year.
function dcUserPresetsDir() {
    var docs = Folder.myDocuments.fsName;
    var sep  = dcIsWin() ? "\\" : "/";
    var year = dcAeYear();
    var name = year ? ("Adobe" + sep + "After Effects " + year + sep + "User Presets")
                    : ("Adobe" + sep + "After Effects" + sep + "User Presets");
    return docs + sep + name;
}

function dcEnsureFolder(pathStr) {
    var f = new Folder(pathStr);
    if (!f.exists) {
        // create parents recursively
        var parent = f.parent;
        if (parent && !parent.exists) dcEnsureFolder(parent.fsName);
        try { f.create(); } catch (e) { return false; }
    }
    return f.exists;
}

function dcCopyFile(srcPath, dstPath) {
    var src = new File(srcPath);
    if (!src.exists) return false;
    var dst = new File(dstPath);
    if (dst.exists) return true;               // already installed, keep user's copy
    try { return src.copy(dst.fsName); } catch (e) { return false; }
}

// ── Auto setup ---------------------------------------------------------------
// Installs every component the panel needs so it works out of the box:
//   1. data folders,  2. bundled .ffx presets into AE's User Presets,
//   3. write test,    4. file-access preference (auto-enabled when possible).
function dcAutoSetup(extRoot) {
    var results = [];
    function step(key, ok, note) {
        results.push("{" + _dcKV("key", key) + "," + _dcKVRaw("ok", _dcBool(ok)) +
                     "," + _dcKV("note", note || "") + "}");
    }

    var sep = dcIsWin() ? "\\" : "/";

    // 1 — data folders
    var data = dcDataDir();
    var okData = dcEnsureFolder(data) &&
                 dcEnsureFolder(data + sep + "precomps") &&
                 dcEnsureFolder(data + sep + "images");
    step("dataFolders", okData, okData ? data : "Could not create " + data);

    // 2 — file access preference
    var fa = dcScriptFileAccess();
    if (!fa) {
        try {
            app.preferences.savePrefAsLong(
                "Main Pref Section", "Pref_SCRIPTING_FILE_NETWORK_SECURITY", 1);
            app.preferences.saveToDisk();
            fa = dcScriptFileAccess();
        } catch (e) {}
    }
    step("fileAccess", fa, fa ? "Scripts may read & write files"
        : "Turn on Preferences > Scripting & Expressions > Allow Scripts to Write Files and Access Network");

    // 3 — install bundled presets into AE's User Presets folder
    var presetRoot = new Folder(extRoot + sep + "presets");
    var installed = 0, failed = 0, target = dcUserPresetsDir() + sep + "DeepComp";
    if (presetRoot.exists && dcEnsureFolder(target)) {
        var groups = presetRoot.getFiles(function (f) { return f instanceof Folder; });
        for (var g = 0; g < groups.length; g++) {
            var groupTarget = target + sep + groups[g].name;
            dcEnsureFolder(groupTarget);
            var files = groups[g].getFiles("*.ffx");
            for (var i = 0; i < files.length; i++) {
                if (files[i].name.toLowerCase().indexOf("untitled") === 0) continue;
                if (dcCopyFile(files[i].fsName, groupTarget + sep + files[i].name)) installed++;
                else failed++;
            }
        }
        step("presets", failed === 0,
             installed + " preset(s) available in " + target +
             (failed ? " — " + failed + " could not be copied" : ""));
    } else {
        step("presets", false, "Preset folder not found next to the panel");
    }

    // 4 — write test
    var okWrite = false, note = "";
    try {
        var probe = new File(data + sep + ".dc_write_test");
        probe.open("w"); probe.write("ok"); probe.close();
        okWrite = probe.exists;
        probe.remove();
    } catch (e) { note = e.toString(); }
    step("writeTest", okWrite, okWrite ? "Library storage ready" : ("Storage not writable " + note));

    // 5 — capability re-check
    var caps = dcCapabilities();

    return "{" + _dcKVRaw("steps", "[" + results.join(",") + "]") + "," +
                 _dcKVRaw("capabilities", "[" + caps.join(",") + "]") + "," +
                 _dcKVRaw("env", dcGetEnvironment()) + "}";
}

// ── Self test ----------------------------------------------------------------
// Non-destructive: creates a temp comp, exercises the panel's core functions,
// then removes everything in a single undo group so the user's project is safe.
function dcSelfTest() {
    var out = [];
    function res(key, ok, note) {
        out.push("{" + _dcKV("key", key) + "," + _dcKVRaw("ok", _dcBool(ok)) +
                 "," + _dcKV("note", note || "") + "}");
    }

    app.beginUndoGroup("DeepComp Self Test");
    var comp = null;
    try {
        comp = app.project.items.addComp("__deepcomp_selftest__", 640, 360, 1, 5, 30);

        try { var s = comp.layers.addSolid([1, 1, 1], "t", 640, 360, 1, 5);
              res("layers", true); } catch (e) { res("layers", false, e.toString()); }

        try { var a = comp.layers.addSolid([1, 1, 1], "a", 640, 360, 1, 5);
              a.adjustmentLayer = true; res("adjustment", true); }
        catch (e) { res("adjustment", false, e.toString()); }

        try { comp.layers.addNull(5); res("null", true); } catch (e) { res("null", false, e.toString()); }
        try { comp.layers.addCamera("c", [320, 180]); res("camera", true); } catch (e) { res("camera", false, e.toString()); }

        try {
            var tl = comp.layers.addText("DeepComp");
            var r = tl.sourceRectAtTime(0, false);
            res("sourceRect", r && typeof r.width === "number");
        } catch (e) { res("sourceRect", false, e.toString()); }

        try {
            var l = comp.layer(1);
            l.property("Position").setValue([100, 100, 0]);
            res("transform", true);
        } catch (e) { res("transform", false, e.toString()); }

        try { comp.layer(1).label = 4; res("labels", true); } catch (e) { res("labels", false, e.toString()); }

        try {
            comp.layer(1).selected = true;
            var pc = comp.layers.precompose([1], "__dc_pre__", true);
            res("precompose", pc instanceof CompItem);
            try { pc.remove(); } catch (e2) {}
        } catch (e) { res("precompose", false, e.toString()); }

        try { res("effects", app.effects && app.effects.length > 0,
                  (app.effects ? app.effects.length : 0) + " effects found"); }
        catch (e) { res("effects", false, e.toString()); }

    } catch (err) {
        res("fatal", false, err.toString());
    }
    try { if (comp) comp.remove(); } catch (e) {}
    app.endUndoGroup();
    try { app.executeCommand(app.findMenuCommandId("Undo")); } catch (e) {}

    return "[" + out.join(",") + "]";
}
