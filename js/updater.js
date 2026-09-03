/* ══════════════════════════════════════════════════════════════════════════
   DeepComp — silent auto-updater

   How it works
   ------------
   1. On launch the panel asks the hosted manifest what the latest version is.
   2. If it is newer than js/version.js, every file listed in the manifest is
      downloaded and written straight into the installed extension folder.
   3. localStorage's setup stamp is cleared, so the next launch re-runs the
      setup/compatibility wizard — new tools configure themselves.
   4. The user only ever sees a banner and a restart prompt.

   Everything degrades gracefully: no network, no Node, or a bad response just
   leaves the installed panel exactly as it was.
   ══════════════════════════════════════════════════════════════════════════ */
(function () {
    "use strict";

    var CHECK_EVERY_MS = 6 * 60 * 60 * 1000;  /* at most 4 checks a day */
    var LAST_CHECK_KEY = "dc_update_last_check";
    var PENDING_KEY    = "dc_update_pending";

    var state = { manifest: null, busy: false };

    function el(id) { return document.getElementById(id); }
    function read(k)    { try { return localStorage.getItem(k); } catch (e) { return null; } }
    function write(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
    function drop(k)     { try { localStorage.removeItem(k); } catch (e) {} }

    function toast(msg, type) {
        if (typeof showToast === "function") showToast(msg, type);
        else if (typeof dcToast === "function") dcToast(msg, type);
    }

    /* ── Node access (CEP runs with --enable-nodejs) ───────────────────── */
    function node(mod) {
        try { return typeof require === "function" ? require(mod) : null; }
        catch (e) { return null; }
    }

    function extensionRoot() {
        try {
            var cs = (window.DC && DC.cs) ? DC.cs : new CSInterface();
            return cs.getSystemPath("extension");
        } catch (e) { return null; }
    }

    /* ── version comparison (semver-ish, tolerant) ─────────────────────── */
    function isNewer(remote, local) {
        var a = String(remote || "").split(".").map(Number);
        var b = String(local  || "").split(".").map(Number);
        for (var i = 0; i < Math.max(a.length, b.length); i++) {
            var x = a[i] || 0, y = b[i] || 0;
            if (x > y) return true;
            if (x < y) return false;
        }
        return false;
    }

    /* ── tiny XHR helper (works in every CEF build AE has shipped) ─────── */
    function get(url, done) {
        var xhr = new XMLHttpRequest();
        var finished = false;
        function finish(err, body) {
            if (finished) return;
            finished = true;
            done(err, body);
        }
        try {
            xhr.open("GET", url + (url.indexOf("?") === -1 ? "?" : "&") + "t=" + Date.now(), true);
            xhr.timeout = 15000;
            xhr.onload = function () {
                if (xhr.status >= 200 && xhr.status < 300) finish(null, xhr.responseText);
                else finish(new Error("HTTP " + xhr.status));
            };
            xhr.onerror = function () { finish(new Error("network error")); };
            xhr.ontimeout = function () { finish(new Error("timed out")); };
            xhr.send();
        } catch (e) { finish(e); }
    }

    /* ── UI ────────────────────────────────────────────────────────────── */
    function showBanner(manifest) {
        var banner = el("dc-update-banner");
        if (!banner) return;
        var title = el("dc-update-title");
        var note  = el("dc-update-note");
        if (title) title.textContent = "DeepComp " + manifest.version + " is available";
        if (note)  note.textContent  = manifest.notes || "Installs in place — no reinstall needed.";
        banner.classList.add("active");

        var pill = el("dc-version-pill");
        if (pill) {
            pill.classList.add("dc-has-update");
            pill.textContent = "v" + manifest.version + " ↓";
        }
    }

    function hideBanner() {
        var banner = el("dc-update-banner");
        if (banner) banner.classList.remove("active");
    }

    function setBusy(busy, label) {
        state.busy = busy;
        var btn = el("dc-update-btn");
        if (!btn) return;
        btn.disabled = busy;
        btn.textContent = label || (busy ? "…" : "Update");
    }

    /* ── check ─────────────────────────────────────────────────────────── */
    function check(manual) {
        var url = window.DC_UPDATE_URL;
        if (!url) return;

        if (!manual) {
            var last = parseInt(read(LAST_CHECK_KEY) || "0", 10);
            if (last && Date.now() - last < CHECK_EVERY_MS) return;
        }
        write(LAST_CHECK_KEY, String(Date.now()));

        if (manual) toast("Checking for updates…");

        get(url, function (err, body) {
            if (err) {
                if (manual) toast("Couldn't reach the update server", "err");
                return;
            }
            var manifest;
            try { manifest = JSON.parse(body); } catch (e) { return; }
            if (!manifest || !manifest.version) return;

            state.manifest = manifest;

            if (isNewer(manifest.version, window.DC_VERSION)) {
                showBanner(manifest);
                if (manifest.required) install();     /* critical fix → silent */
            } else if (manual) {
                toast("You're on the latest version", "ok");
            }
        });
    }

    /* ── install ───────────────────────────────────────────────────────── */
    function install() {
        if (state.busy) return;

        var manifest = state.manifest;
        if (!manifest || !manifest.files || !manifest.files.length) {
            toast("Update manifest is empty", "err");
            return;
        }

        var fs = node("fs");
        var path = node("path");
        var root = extensionRoot();

        if (!fs || !path || !root) {
            toast("This build can't self-update — reinstall to update", "err");
            return;
        }

        setBusy(true, "0%");

        var files = manifest.files;
        var downloaded = [];
        var i = 0;

        function next() {
            if (i >= files.length) { commit(); return; }
            var f = files[i++];
            get(f.url, function (err, body) {
                if (err || body == null) {
                    setBusy(false);
                    toast("Update failed while downloading " + f.path, "err");
                    return;
                }
                downloaded.push({ path: f.path, body: body });
                setBusy(true, Math.round((i / files.length) * 90) + "%");
                next();
            });
        }

        /* Nothing is written until every file has arrived, so a dropped
           connection can never leave a half-updated panel behind. */
        function commit() {
            try {
                for (var n = 0; n < downloaded.length; n++) {
                    var target = path.join(root, downloaded[n].path);
                    var dir = path.dirname(target);
                    mkdirp(fs, path, dir);
                    fs.writeFileSync(target, downloaded[n].body, "utf8");
                }
            } catch (e) {
                setBusy(false);
                toast("Update couldn't be written: " + e.message, "err");
                return;
            }

            /* Force the setup/compatibility wizard to re-run for the new
               version so anything new configures itself. */
            drop("dc_setup_version");
            write(PENDING_KEY, manifest.version);

            setBusy(false, "Done");
            hideBanner();
            toast("Updated to " + manifest.version + " — restart After Effects", "ok");

            var note = el("dc-update-note");
            if (note) note.textContent = "Restart After Effects to load " + manifest.version + ".";
        }

        next();
    }

    function mkdirp(fs, path, dir) {
        if (!dir || fs.existsSync(dir)) return;
        mkdirp(fs, path, path.dirname(dir));
        try { fs.mkdirSync(dir); } catch (e) {}
    }

    /* ── boot ──────────────────────────────────────────────────────────── */
    document.addEventListener("DOMContentLoaded", function () {
        var pill = el("dc-version-pill");
        if (pill) {
            pill.textContent = "v" + window.DC_VERSION;
            pill.addEventListener("click", function () {
                if (state.manifest && isNewer(state.manifest.version, window.DC_VERSION)) install();
                else check(true);
            });
        }

        var btn = el("dc-update-btn");
        if (btn) btn.addEventListener("click", install);

        /* An update that was written but never loaded → confirm it landed. */
        var pending = read(PENDING_KEY);
        if (pending) {
            if (!isNewer(pending, window.DC_VERSION)) {
                drop(PENDING_KEY);
                toast("DeepComp updated to " + window.DC_VERSION, "ok");
            }
        }

        setTimeout(function () { check(false); }, 2500);
    });

    window.dcCheckForUpdates = function () { check(true); };
})();
