/* ══════════════════════════════════════════════════════════════════════════
   DeepComp — first-launch welcome
   Shown once per machine, before the setup wizard runs. It greets the user,
   explains the three steps, and reports the exact After Effects build it
   detected so the panel never looks like it "did nothing".
   ══════════════════════════════════════════════════════════════════════════ */
(function () {
    "use strict";

    var SEEN_KEY = "dc_welcome_seen";

    function el(id) { return document.getElementById(id); }

    function read(key) {
        try { return localStorage.getItem(key); } catch (e) { return null; }
    }
    function write(key, value) {
        try { localStorage.setItem(key, value); } catch (e) {}
    }

    function greeting() {
        var h = new Date().getHours();
        if (h < 5)  return "Still up";
        if (h < 12) return "Good morning";
        if (h < 18) return "Good afternoon";
        return "Good evening";
    }

    /* Fill in the detected environment line as soon as the host answers. */
    function describeEnvironment() {
        var line = el("dc-welcome-env");
        if (!line) return;

        function paint(env) {
            if (!env) {
                line.textContent = "Couldn't reach After Effects yet — setup will retry.";
                return;
            }
            var name = env.year ? "After Effects " + env.year : "After Effects " + env.version;
            line.textContent = "Detected " + name + " · " + (env.isWin ? "Windows" : "macOS") +
                (env.supported ? " · fully supported" : " · limited support");
        }

        if (window.DC && DC.env) { paint(DC.env); return; }
        if (typeof dcBootHost === "function") {
            dcBootHost(function () { paint(window.DC ? DC.env : null); });
        } else {
            line.textContent = "Detecting your After Effects…";
        }
    }

    function open() {
        var w = el("dc-welcome");
        if (!w) return;

        var eyebrow = el("dc-welcome-eyebrow");
        if (eyebrow) eyebrow.textContent = greeting() + " — welcome to DeepComp";

        w.classList.add("active");
        describeEnvironment();
    }

    function close() {
        var w = el("dc-welcome");
        if (w) w.classList.remove("active");
        write(SEEN_KEY, "1");
    }

    /* compat.js calls this instead of jumping straight into the wizard when
       this is the very first launch on this machine. */
    window.dcFirstRunFlow = function () {
        if (read(SEEN_KEY) === "1") {
            if (typeof dcRunSetup === "function") dcRunSetup();
            return;
        }
        open();
    };

    window.dcShowWelcome = open;

    document.addEventListener("DOMContentLoaded", function () {
        var start = el("dc-welcome-start");
        if (start) start.addEventListener("click", function () {
            close();
            if (typeof dcRunSetup === "function") dcRunSetup();
        });

        var skip = el("dc-welcome-skip");
        if (skip) skip.addEventListener("click", function () {
            close();
            /* Even when the user skips the tour, configuration still has to
               happen — run it quietly in the background. */
            if (typeof dcRunSetup === "function") dcRunSetup();
        });
    });
})();
