/**
 * Save Pre-comp engine (ExtendScript host for CEP panel)
 * ------------------------------------------------------
 * Every public function returns a JSON string: {"ok":true,...} or {"ok":false,"error":"..."}
 * so the panel never has to parse ambiguous output.
 */

// ---------------------------------------------------------------- utilities

var PC = (function () {
    var api = {};

    function esc(s) {
        s = String(s);
        var out = "", i, c;
        for (i = 0; i < s.length; i++) {
            c = s.charAt(i);
            if (c === '"') out += '\\"';
            else if (c === "\\") out += "\\\\";
            else if (c === "\n") out += "\\n";
            else if (c === "\r") out += "\\r";
            else if (c === "\t") out += "\\t";
            else if (c.charCodeAt(0) < 32) out += " ";
            else out += c;
        }
        return out;
    }

    function jsonValue(v) {
        if (v === null || v === undefined) return "null";
        if (typeof v === "number") return isFinite(v) ? String(v) : "null";
        if (typeof v === "boolean") return v ? "true" : "false";
        if (v instanceof Array) {
            var parts = [];
            for (var i = 0; i < v.length; i++) parts.push(jsonValue(v[i]));
            return "[" + parts.join(",") + "]";
        }
        if (typeof v === "object") {
            var p = [];
            for (var k in v) {
                if (!v.hasOwnProperty(k)) continue;
                p.push('"' + esc(k) + '":' + jsonValue(v[k]));
            }
            return "{" + p.join(",") + "}";
        }
        return '"' + esc(v) + '"';
    }
    api.stringify = jsonValue;

    function ok(obj) {
        obj = obj || {};
        obj.ok = true;
        return jsonValue(obj);
    }
    function fail(msg) {
        return jsonValue({ ok: false, error: String(msg) });
    }
    api.ok = ok;
    api.fail = fail;

    function safeName(name) {
        return String(name).replace(/[^A-Za-z0-9 _\-\.]/g, "_").replace(/\s+/g, " ").replace(/^\s+|\s+$/g, "");
    }

    function stamp() {
        var d = new Date();
        function p(n) { return (n < 10 ? "0" : "") + n; }
        return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + "-" + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
    }

    function libraryRoot() {
        var base = (typeof getUserLibraryRoot === "function") ? getUserLibraryRoot() : "";
        if (!base) throw new Error("DeepComp user library path is unavailable.");
        var root = new Folder(base + (($.os.indexOf("Win") !== -1) ? "\\library\\Precomps" : "/library/Precomps"));
        if (!root.exists && !root.create()) throw new Error("Could not create the DeepComp Precomp library.");
        return root;
    }
    api.libraryRoot = libraryRoot;

    function readFile(f) {
        if (!f.exists) return null;
        f.encoding = "UTF-8";
        if (!f.open("r")) return null;
        var txt = f.read();
        f.close();
        return txt;
    }

    function writeFile(f, txt) {
        f.encoding = "UTF-8";
        if (!f.open("w")) throw new Error("Cannot write " + f.fsName);
        f.write(txt);
        f.close();
    }
    api.writeFile = writeFile;
    api.readFile = readFile;

    // -------------------------------------------------------- detection

    /**
     * Finds the single selected pre-comp layer in the active comp.
     * Returns { layer, source, comp } or throws a human readable error.
     */
    function detectSelectedPrecomp() {
        if (!app.project) throw new Error("No project is open.");
        var comp = app.project.activeItem;
        if (!(comp && comp instanceof CompItem)) {
            throw new Error("Open a composition and select a pre-comp layer in its timeline.");
        }
        var sel = comp.selectedLayers;
        if (!sel || sel.length === 0) {
            throw new Error("Nothing selected. Select the pre-comp layer you want to save.");
        }
        // Prefer pre-comp layers among the selection.
        var precomps = [];
        for (var i = 0; i < sel.length; i++) {
            var l = sel[i];
            if (l instanceof AVLayer && l.source && l.source instanceof CompItem) precomps.push(l);
        }
        if (precomps.length === 0) {
            throw new Error("The selected layer is not a pre-comp. Select a layer whose source is a composition.");
        }
        if (precomps.length > 1) {
            throw new Error("Select only one pre-comp layer (" + precomps.length + " are selected).");
        }
        return { layer: precomps[0], source: precomps[0].source, comp: comp };
    }
    api.detectSelectedPrecomp = detectSelectedPrecomp;

    // -------------------------------------------------------- thumbnail

    /**
     * Saves the first frame of a comp as PNG.
     * Primary: CompItem.saveFrameToPng. Fallback: render queue with PNG output.
     */
    function saveFirstFramePng(compItem, outFile) {
        var t = 0; // first frame of the pre-comp's own timeline
        try {
            compItem.saveFrameToPng(t, outFile);
            if (outFile.exists && outFile.length > 0) return true;
        } catch (e) { /* fall through */ }

        // Fallback: render queue single frame
        var rq = app.project.renderQueue;
        var item = null;
        try {
            item = rq.items.add(compItem);
            item.timeSpanStart = 0;
            item.timeSpanDuration = compItem.frameDuration;
            var om = item.outputModule(1);
            var applied = false;
            var templates = om.templates;
            for (var i = 0; i < templates.length; i++) {
                if (/png/i.test(templates[i])) { om.applyTemplate(templates[i]); applied = true; break; }
            }
            if (!applied) {
                for (var j = 0; j < templates.length; j++) {
                    if (/lossless/i.test(templates[j])) { om.applyTemplate(templates[j]); break; }
                }
            }
            om.file = outFile;
            item.render = true;
            // make sure nothing else renders
            for (var k = 1; k <= rq.numItems; k++) {
                if (rq.item(k) !== item) rq.item(k).render = false;
            }
            rq.render();
            item.remove();
            // PNG sequence appends a frame number
            if (outFile.exists) return true;
            var parent = outFile.parent;
            var base = outFile.name.replace(/\.[^\.]+$/, "");
            var files = parent.getFiles(base + "*");
            if (files && files.length) {
                files[0].rename(outFile.name);
                return true;
            }
        } catch (e2) {
            try { if (item) item.remove(); } catch (e3) {}
        }
        return false;
    }

    // -------------------------------------------------------- collection

    function collectItemsFor(compItem) {
        var seen = [];
        function has(it) {
            for (var i = 0; i < seen.length; i++) if (seen[i] === it) return true;
            return false;
        }
        function walk(c) {
            if (has(c)) return;
            seen.push(c);
            if (!(c instanceof CompItem)) return;
            for (var i = 1; i <= c.numLayers; i++) {
                var l = c.layer(i);
                if (l.source) walk(l.source);
            }
        }
        walk(compItem);
        return seen;
    }

    /** Copy every referenced footage file into destFolder and relink. */
    function collectFootage(compItem, destFolder) {
        if (!destFolder.exists) destFolder.create();
        var items = collectItemsFor(compItem), copied = [], missing = [];
        for (var i = 0; i < items.length; i++) {
            var it = items[i];
            if (!(it instanceof FootageItem)) continue;
            var src = it.mainSource;
            if (!src || !(src instanceof FileSource)) continue; // solids / placeholders
            var f;
            try { f = src.file; } catch (e) { f = null; }
            if (!f) continue;
            if (!f.exists) { missing.push(f.fsName); continue; }
            var target = new File(destFolder.fsName + "/" + f.name);
            if (!target.exists) {
                if (!f.copy(target)) { missing.push(f.fsName); continue; }
            }
            // Image sequences must keep their sequence flag
            try {
                if (src.isStill || !src.hasVideo || true) {
                    it.replaceWithSequence
                        ? (src.isStill ? it.replace(target) : it.replace(target))
                        : it.replace(target);
                }
            } catch (e2) {
                try { it.replace(target); } catch (e3) { missing.push(f.fsName); continue; }
            }
            copied.push(f.name);
        }
        return { copied: copied, missing: missing };
    }

    // -------------------------------------------------------- save

    api.savePrecomp = function (requestedName) {
        var originalFile = null, restored = false;
        try {
            var found = detectSelectedPrecomp();
            var precomp = found.source;

            if (!app.project.file) {
                return fail("Save your After Effects project once before saving pre-comps (the extractor needs a project file to return to).");
            }
            originalFile = app.project.file;

            var name = safeName(requestedName || precomp.name) || "Precomp";
            var slug = name + "_" + stamp();
            var root = libraryRoot();
            var entry = new Folder(root.fsName + "/" + slug);
            if (!entry.exists) entry.create();

            var thumb = new File(entry.fsName + "/thumbnail.png");
            var aep = new File(entry.fsName + (($.os.indexOf("Win") !== -1) ? "\\" : "/") + name + ".aep");
            var assets = new Folder(entry.fsName + (($.os.indexOf("Win") !== -1) ? "\\Assets" : "/Assets"));

            app.beginUndoGroup("Save Pre-comp: " + name);

            // 1. thumbnail from the pre-comp's own first frame
            var hasThumb = saveFirstFramePng(precomp, thumb);

            // 2. save a detached copy of the project, reduce it to the pre-comp,
            //    localise footage, save again.
            app.project.save(aep);
            var reduced = app.project;
            var target = null;
            // after save the item references are still valid
            reduced.reduceProject([precomp]);
            // find the comp again by name in the reduced project
            for (var i = 1; i <= reduced.numItems; i++) {
                var it = reduced.item(i);
                if (it instanceof CompItem && it.name === precomp.name) { target = it; break; }
            }
            if (!target) target = precomp;

            var foot = collectFootage(target, assets);
            reduced.save(aep);

            var meta = {
                id: slug,
                name: precomp.name,
                note: "",
                aep: aep.fsName,
                thumbnail: hasThumb ? thumb.fsName : "",
                width: target.width,
                height: target.height,
                duration: target.duration,
                frameRate: target.frameRate,
                layers: target.numLayers,
                assets: foot.copied,
                missingAssets: foot.missing,
                created: new Date().toString(),
                portableAssets: foot.missing.length === 0,
                assetFailures: foot.missing.length
            };
            writeFile(new File(entry.fsName + "/meta.json"), jsonValue(meta));

            app.endUndoGroup();

            // 3. reopen the original project so the artist loses nothing
            app.open(originalFile);
            restored = true;

            return ok({ entry: meta, warning: foot.missing.length ? (foot.missing.length + " source file(s) were offline and could not be collected.") : "" });
        } catch (err) {
            try { app.endUndoGroup(); } catch (e) {}
            if (originalFile && !restored) {
                try { app.open(originalFile); } catch (e2) {}
            }
            return fail(err.message || err);
        }
    };

    // -------------------------------------------------------- library list

    api.listLibrary = function () {
        try {
            var root = libraryRoot();
            var folders = root.getFiles(function (f) { return f instanceof Folder; });
            var out = [];
            for (var i = 0; i < folders.length; i++) {
                var m = new File(folders[i].fsName + "/meta.json");
                var txt = readFile(m);
                if (!txt) continue;
                try {
                    var obj = eval("(" + txt + ")");
                    if (obj && obj.aep) out.push(obj);
                } catch (e) {}
            }
            out.sort(function (a, b) { return a.id < b.id ? 1 : -1; });
            return ok({ items: out, root: root.fsName });
        } catch (err) {
            return fail(err.message || err);
        }
    };

    // -------------------------------------------------------- import back

    api.importPrecomp = function (aepPath) {
        try {
            var f = new File(aepPath);
            if (!f.exists) return fail("Saved project file is missing:\n" + aepPath);

            var host = app.project.activeItem;
            var hostIsComp = host && host instanceof CompItem;

            app.beginUndoGroup("Import Pre-comp");

            var before = [];
            for (var i = 1; i <= app.project.numItems; i++) before.push(app.project.item(i));

            var io = new ImportOptions(f);
            var imported = app.project.importFile(io); // FolderItem containing the comp

            // collect newly added comps
            var added = [];
            for (var j = 1; j <= app.project.numItems; j++) {
                var it = app.project.item(j);
                var isNew = true;
                for (var k = 0; k < before.length; k++) if (before[k] === it) { isNew = false; break; }
                if (isNew && it instanceof CompItem) added.push(it);
            }
            if (added.length === 0) {
                app.endUndoGroup();
                return fail("No composition was found inside the saved project.");
            }

            // The top level comp is the one no other new comp uses as a layer source.
            var used = {};
            for (var a = 0; a < added.length; a++) {
                var c = added[a];
                for (var l = 1; l <= c.numLayers; l++) {
                    var src = c.layer(l).source;
                    if (src) used[src.id] = true;
                }
            }
            var top = added[0];
            for (var b = 0; b < added.length; b++) {
                if (!used[added[b].id]) { top = added[b]; break; }
            }

            var placed = false, layerName = "";
            if (hostIsComp) {
                var layer = host.layers.add(top);      // <- lands in the timeline as a pre-comp
                layer.startTime = host.time;
                layer.selected = true;
                layerName = layer.name;
                placed = true;
            } else {
                top.openInViewer();
            }

            app.endUndoGroup();
            return ok({
                comp: top.name,
                placedInTimeline: placed,
                layerName: layerName,
                folder: imported && imported.name ? imported.name : ""
            });
        } catch (err) {
            try { app.endUndoGroup(); } catch (e) {}
            return fail(err.message || err);
        }
    };

    // -------------------------------------------------------- misc

    api.selectionInfo = function () {
        try {
            var found = detectSelectedPrecomp();
            return ok({
                name: found.source.name,
                width: found.source.width,
                height: found.source.height,
                layers: found.source.numLayers,
                duration: found.source.duration
            });
        } catch (err) {
            return fail(err.message || err);
        }
    };

    api.deleteEntry = function (id) {
        try {
            var folder = new Folder(libraryRoot().fsName + "/" + id);
            if (!folder.exists) return fail("Entry not found.");
            function purge(fo) {
                var files = fo.getFiles();
                for (var i = 0; i < files.length; i++) {
                    if (files[i] instanceof Folder) purge(files[i]);
                    else files[i].remove();
                }
                fo.remove();
            }
            purge(folder);
            return ok({ id: id });
        } catch (err) {
            return fail(err.message || err);
        }
    };

    api.revealLibrary = function () {
        try { libraryRoot().execute(); return ok({}); }
        catch (err) { return fail(err.message || err); }
    };

    return api;
})();

// Flat entry points for evalScript
function pcSelectionInfo() { return PC.selectionInfo(); }
function pcSavePrecomp(note) { return PC.savePrecomp(note); }
function pcListLibrary() { return PC.listLibrary(); }
function pcImportPrecomp(p) { return PC.importPrecomp(p); }
function pcDeleteEntry(id) { return PC.deleteEntry(id); }
function pcRevealLibrary() { return PC.revealLibrary(); }
