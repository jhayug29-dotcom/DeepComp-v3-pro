// Utility: Wrap everything in an undo group
function undoWrapper(name, func) {
    app.beginUndoGroup(name);
    try {
        func();
    } catch(e) {
        alert(e.toString());
    }
    app.endUndoGroup();
}

function getActiveComp() {
    var comp = app.project.activeItem;
    if (!comp || !(comp instanceof CompItem)) {
        alert("Please select a composition.");
        return null;
    }
    return comp;
}

// ─── HELPER: Move new layer just ABOVE the selected layer ────────────────────
// AE mein lower index = upar. moveBefore(refLayer) = refLayer se upar aa jao.
function moveAboveSelected(newLayer, selectedLayers) {
    if (selectedLayers && selectedLayers.length > 0) {
        try { newLayer.moveBefore(selectedLayers[0]); } catch(e) {}
    }
}

function addSolid() {
    undoWrapper("Add Solid", function() {
        var comp = getActiveComp();
        if (!comp) return;
        var selected = comp.selectedLayers;
        var layer = comp.layers.addSolid([1,1,1], "Solid", comp.width, comp.height, comp.pixelAspect, comp.duration);
        layer.Effects.addProperty("ADBE Fill");
        // ── Match selected layer's time range ──────────────────────────────
        if (selected && selected.length > 0) {
            layer.inPoint  = selected[0].inPoint;
            layer.outPoint = selected[0].outPoint;
            // ── Selected layer ke just UPAR rakho ──────────────────────────
            moveAboveSelected(layer, selected);
        }
        // If nothing selected, layer already spans full comp duration (default)
    });
}

function addAdjustmentLayer() {
    undoWrapper("Add Adjustment Layer", function() {
        var comp = getActiveComp();
        if (!comp) return;
        var selected = comp.selectedLayers;
        var layer = comp.layers.addSolid([1,1,1], "Adjustment Layer", comp.width, comp.height, comp.pixelAspect, comp.duration);
        layer.adjustmentLayer = true;
        // ── Match selected layer's time range ──────────────────────────────
        if (selected && selected.length > 0) {
            layer.inPoint  = selected[0].inPoint;
            layer.outPoint = selected[0].outPoint;
            // ── Selected layer ke just UPAR rakho ──────────────────────────
            moveAboveSelected(layer, selected);
        }
    });
}

function addNull() {
    undoWrapper("Add Null", function() {
        var comp = getActiveComp();
        if (!comp) return;
        var selected = comp.selectedLayers;
        var nullLayer = comp.layers.addNull(comp.duration);
        // ── Match selected layer's time range + auto-parent ────────────────
        if (selected && selected.length > 0) {
            nullLayer.inPoint  = selected[0].inPoint;
            nullLayer.outPoint = selected[0].outPoint;
            // Auto-parent: null becomes parent of selected layer
            nullLayer.parent = null; // null itself has no parent
            selected[0].parent = nullLayer;
            // ── Selected layer ke just UPAR rakho ──────────────────────────
            moveAboveSelected(nullLayer, selected);
        }
        // If nothing selected, null spans full comp duration (default)
    });
}

function addCamera() {
    undoWrapper("Add Camera", function() {
        var comp = getActiveComp();
        if (!comp) return;
        var selected = comp.selectedLayers;
        var camera = comp.layers.addCamera("Camera", [comp.width/2, comp.height/2]);
        // ── Match selected layer's time range ──────────────────────────────
        if (selected && selected.length > 0) {
            try {
                camera.inPoint  = selected[0].inPoint;
                camera.outPoint = selected[0].outPoint;
            } catch(e) {} // camera duration set karna optional hai
            // ── Selected layer ke just UPAR rakho ──────────────────────────
            moveAboveSelected(camera, selected);
        }
    });
}

function setAnchor(xMultiplier, yMultiplier) {
    undoWrapper("Set Anchor Point", function() {
        var comp = getActiveComp();
        if (!comp) return;
        var layers = comp.selectedLayers;
        if (layers.length === 0) return alert("Select a layer.");
        
        for (var i = 0; i < layers.length; i++) {
            var layer = layers[i];
            if (layer.source instanceof CompItem || layer.source instanceof FootageItem || layer instanceof TextLayer || layer instanceof ShapeLayer) {
                var rect = layer.sourceRectAtTime(comp.time, false);
                var x = rect.left + (rect.width * xMultiplier);
                var y = rect.top + (rect.height * yMultiplier);
                
                var curAnchor = layer.property("Anchor Point").value;
                var curPos = layer.property("Position").value;
                var xDiff = x - curAnchor[0];
                var yDiff = y - curAnchor[1];
                
                layer.property("Anchor Point").setValue([x, y, 0]);
                layer.property("Position").setValue([curPos[0] + xDiff, curPos[1] + yDiff, curPos[2]]);
            }
        }
    });
}

function alignLayer(mode) {
    undoWrapper("Align Layer", function() {
        var comp = getActiveComp();
        if (!comp) return;
        var layers = comp.selectedLayers;
        if (layers.length === 0) return alert("Select a layer.");
        
        for (var i = 0; i < layers.length; i++) {
            var layer = layers[i];
            var pos = layer.property("Position").value;
            var w = comp.width;
            var h = comp.height;
            var rect = layer.sourceRectAtTime(comp.time, false);
            var anchor = layer.property("Anchor Point").value;
            
            switch(mode) {
                case 'left':
                    layer.property("Position").setValue([anchor[0] - rect.left, pos[1], pos[2]]);
                    break;
                case 'right':
                    layer.property("Position").setValue([w - (rect.width - (anchor[0] - rect.left)), pos[1], pos[2]]);
                    break;
                case 'center_horiz':
                    layer.property("Position").setValue([w/2, pos[1], pos[2]]);
                    break;
                case 'top':
                    layer.property("Position").setValue([pos[0], anchor[1] - rect.top, pos[2]]);
                    break;
                case 'bottom':
                    layer.property("Position").setValue([pos[0], h - (rect.height - (anchor[1] - rect.top)), pos[2]]);
                    break;
                case 'center_vert':
                    layer.property("Position").setValue([pos[0], h/2, pos[2]]);
                    break;
            }
        }
    });
}

function precompose() {
    undoWrapper("Pre-compose", function() {
        var comp = getActiveComp();
        if (!comp) return;
        var layers = comp.selectedLayers;
        if (layers.length === 0) return alert("Select layers to pre-compose.");
        
        var earliestIn = 999999;
        var latestOut = -999999;
        for (var i = 0; i < layers.length; i++) {
            var l = layers[i];
            if (l.inPoint < earliestIn) earliestIn = l.inPoint;
            if (l.outPoint > latestOut) latestOut = l.outPoint;
        }
        
        var indices = [];
        for (var i = 0; i < layers.length; i++) indices.push(layers[i].index);
        
        var newComp = comp.layers.precompose(indices, "Precomp", true);
        
        if (earliestIn < latestOut && earliestIn !== 999999) {
            var durationSpan = latestOut - earliestIn;
            newComp.duration = durationSpan;
            
            for (var j = 1; j <= newComp.numLayers; j++) {
                newComp.layer(j).startTime -= earliestIn;
            }
            
            for (var k = 1; k <= comp.numLayers; k++) {
                var parentLayer = comp.layer(k);
                if (parentLayer.source === newComp) {
                    parentLayer.startTime = earliestIn;
                    parentLayer.inPoint = earliestIn;
                    parentLayer.outPoint = latestOut;
                    break;
                }
            }
        }
    });
}



function decompose() { unprecomp(); }

// ╔════════════════════════════════════════════════════════════════════════════╗
// ║  DEEPCOMP — ULTRA PRECISION UNPRECOMP AI SYSTEM  v3.0                    ║
// ║                                                                            ║
// ║  GUARANTEES:                                                               ║
// ║  • Koi bhi selected non-precomp layer KABHI touch nahi hogi               ║
// ║  • Har layer exact usi position pe aayegi jahan precomp thi               ║
// ║  • 1 layer ho ya 100000 — same accuracy, same speed                       ║
// ║  • Ek layer fail ho to baaki sab safe rahenge                              ║
// ║  • Koi bhi existing layer ki timing/name kabhi disturb nahi hogi           ║
// ║  • AE ka koi bhi version — consistent behavior                             ║
// ╚════════════════════════════════════════════════════════════════════════════╝

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// LAYER 0: VALIDATION SHIELD
// Har value ko use karne se pehle check karo — kabhi assume mat karo
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// Check: kya yeh layer abhi bhi AE mein valid hai?
// Layers remove hone ke baad invalid ho jaati hain — access = crash
function _v_isLayerAlive(layer) {
    if (!layer) return false;
    try {
        // .index access karna = AE internally validity check karta hai
        // Agar layer dead hai toh yeh throw karega
        var idx = layer.index;
        return (typeof idx === "number" && idx > 0);
    } catch(e) { return false; }
}

// Check: kya yeh CompItem valid hai aur accessible hai?
function _v_isCompAlive(comp) {
    if (!comp) return false;
    try {
        var n = comp.numLayers;
        return (typeof n === "number");
    } catch(e) { return false; }
}

// Check: kya layer ek precomp hai? (source CompItem hona chahiye)
function _v_isPrecomp(layer) {
    if (!_v_isLayerAlive(layer)) return false;
    try {
        return (layer.source instanceof CompItem);
    } catch(e) { return false; }
}

// Safe number read — agar property exist na kare to fallback return karo
function _v_safeNum(getter, fallback) {
    try {
        var val = getter();
        if (typeof val === "number" && isFinite(val)) return val;
        return fallback;
    } catch(e) { return fallback; }
}

// Safe string read
function _v_safeStr(getter, fallback) {
    try {
        var val = getter();
        if (typeof val === "string") return val;
        return fallback;
    } catch(e) { return fallback; }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// LAYER 1: SELECTION DETECTOR
// Sirf selected layers scan karo — koi aur layer touch nahi
// Non-precomp layers silently skip, precomps collect karo
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function _det_getSelectedPrecomps(comp) {
    var out = { precomps: [], skipped: 0, total: 0, error: null };

    if (!_v_isCompAlive(comp)) {
        out.error = "Comp not valid";
        return out;
    }

    var sel;
    try {
        sel = comp.selectedLayers;
        out.total = sel.length;
    } catch(e) {
        out.error = "Cannot read selectedLayers: " + e.toString();
        return out;
    }

    for (var i = 0; i < sel.length; i++) {
        try {
            var lyr = sel[i];
            if (_v_isPrecomp(lyr)) {
                // Ek aur check: kya source comp accessible hai?
                if (_v_isCompAlive(lyr.source)) {
                    out.precomps.push(lyr);
                } else {
                    out.skipped++;  // source comp corrupted — skip
                }
            } else {
                out.skipped++;
            }
        } catch(e) {
            out.skipped++;
        }
    }

    return out;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// LAYER 2: POSITION FREEZER
// Precomp layer ki parent-comp position ko ek immutable snapshot mein freeze karo
// Yeh snapshot remove se PEHLE liya jata hai — ground truth hai
//
// AE TIMING MODEL (har developer ko samajhna chahiye):
//
//   startTime  = Frame 0 of the source comp on parent timeline
//                (negative bhi ho sakta hai agar layer "before comp start" hai)
//   inPoint    = Visible start on parent timeline (ABSOLUTE, trim handle)
//   outPoint   = Visible end on parent timeline   (ABSOLUTE, trim handle)
//
//   Relationship:
//     inPoint  >= startTime                    (trim can't be before layer start)
//     outPoint <= startTime + source.duration  (trim can't exceed source end)
//
//   Key insight: inPoint/outPoint are ABSOLUTE parent-comp times, NOT
//   relative to startTime. This is why we must set all three separately.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function _freeze_precompPosition(precompLayer) {
    // Read all values through _v_safeNum — never crash on a bad property
    var snap = {
        // ── Core timing ─────────────────────────────────────────────────────
        startTime : _v_safeNum(function(){ return precompLayer.startTime; }, 0),
        inPoint   : _v_safeNum(function(){ return precompLayer.inPoint;   }, 0),
        outPoint  : _v_safeNum(function(){ return precompLayer.outPoint;  }, 0),

        // ── Identity ────────────────────────────────────────────────────────
        index     : _v_safeNum(function(){ return precompLayer.index; }, 0),
        name      : _v_safeStr(function(){ return precompLayer.name;  }, ""),
        label     : _v_safeNum(function(){ return precompLayer.label; }, 0),

        // ── Parent comp reference (needed for validation only) ───────────────
        containingComp: null
    };

    try { snap.containingComp = precompLayer.containingComp; } catch(e) {}

    // Validate: outPoint must be > inPoint (corrupt layer protection)
    if (snap.outPoint <= snap.inPoint) {
        // Fallback: treat outPoint as inPoint + 1 frame (1/24 sec minimum)
        snap.outPoint = snap.inPoint + (1/24);
    }

    return snap;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// LAYER 3: CHILD FREEZER
// sourceComp ke andar EVERY layer ki complete state freeze karo
// Pure read — kuch bhi modify nahi hota yahan
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function _freeze_children(sourceComp) {
    var snaps = [];

    if (!_v_isCompAlive(sourceComp)) return snaps;

    var count;
    try { count = sourceComp.numLayers; } catch(e) { return snaps; }

    for (var i = 1; i <= count; i++) {
        var lyr;
        try { lyr = sourceComp.layer(i); } catch(e) { continue; }
        if (!_v_isLayerAlive(lyr)) continue;

        var snap = {
            // ── Identity ──────────────────────────────────────────────────────
            sourceIndex  : i,
            name         : _v_safeStr(function(){ return lyr.name;  }, "Layer " + i),

            // ── Timing inside sourceComp (all relative to sourceComp's t=0) ──
            // startTime: where this layer's frame-0 is in sourceComp timeline
            // inPoint:   visible start in sourceComp time
            // outPoint:  visible end in sourceComp time
            startTime    : _v_safeNum(function(){ return lyr.startTime; }, 0),
            inPoint      : _v_safeNum(function(){ return lyr.inPoint;   }, 0),
            outPoint     : _v_safeNum(function(){ return lyr.outPoint;  }, 0),

            // ── Flags to preserve ─────────────────────────────────────────────
            label        : _v_safeNum(function(){ return lyr.label;  }, 0),
            locked       : false,
            shy          : false,
            solo         : false,
            parent       : null
        };

        // Safe flag reads
        try { snap.locked = lyr.locked; } catch(e) {}
        try { snap.shy    = lyr.shy;    } catch(e) {}
        try { snap.solo   = lyr.solo;   } catch(e) {}
        try { snap.parent = lyr.parent; } catch(e) {}

        // Validate timing (corrupt layer protection)
        if (snap.outPoint <= snap.inPoint) {
            snap.outPoint = snap.inPoint + (1/24);
        }

        snaps.push(snap);
    }

    return snaps;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// LAYER 4: PLACEMENT CALCULATOR
// Pure mathematics — zero AE API calls, zero side effects
//
// FORMULA (derived from AE timing model):
//
//   Child inside sourceComp:
//     child.startTime = offset of child's frame-0 inside sourceComp
//     child.inPoint   = visible start in sourceComp time
//     child.outPoint  = visible end in sourceComp time
//
//   sourceComp in parent comp:
//     precomp.startTime = where sourceComp's t=0 maps to on parent timeline
//
//   Therefore child in parent comp:
//     final.startTime = precomp.startTime + child.startTime
//     final.inPoint   = precomp.startTime + child.inPoint
//     final.outPoint  = precomp.startTime + child.outPoint
//
//   WHY this formula is correct:
//     If precomp.startTime=5 and child is at 0→1 inside precomp:
//       final.startTime = 5 + 0 = 5
//       final.inPoint   = 5 + 0 = 5
//       final.outPoint  = 5 + 1 = 6
//     → Layer appears at 5→6 in parent comp  ✓
//
//     If precomp is moved to startTime=7:
//       final.startTime = 7 + 0 = 7  → Layer at 7→8  ✓
//
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function _calc_finalPosition(precompSnap, childSnap) {
    var anchor    = precompSnap.startTime;  // ground truth anchor
    var finalStart = anchor + childSnap.startTime;
    var finalIn    = anchor + childSnap.inPoint;
    var finalOut   = anchor + childSnap.outPoint;

    // Final validation: outPoint must be strictly greater than inPoint
    if (finalOut <= finalIn) {
        finalOut = finalIn + (1/24);  // minimum 1 frame
    }

    return { startTime: finalStart, inPoint: finalIn, outPoint: finalOut };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// LAYER 5: COPY ENGINE
// Layers ko parent comp mein copy karo — index drift se 100% safe
//
// THE INDEX DRIFT PROBLEM (why naive approach fails):
//   copyToComp() always inserts at index 1 (top of layer stack).
//   1st copy → at index 1
//   2nd copy → at index 1, 1st copy shifts to index 2
//   3rd copy → at index 1, others shift down
//   If we use comp.layer(1) to track copies → we always get LATEST copy only
//   Previous copies are "lost" (at unknown shifting indices)
//   Result: wrong snap applied to wrong layer → layers land at wrong time
//
// SOLUTION: Unique temp name stamping
//   Before each copy: give source layer a globally unique temp name
//   After copy: scan comp by name — find exact copied layer
//   Immediately restore original name
//   Result: 100% accurate tracking regardless of how many copies exist
//
// TEMP NAME DESIGN:
//   Format: __dc_[timestamp_ms]_[precomp_index]_[child_index]
//   Timestamp: ensures uniqueness across multiple unprecomp calls
//   precomp_index + child_index: ensures uniqueness within one call
//   __ prefix: unlikely to clash with any user layer name
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function _copy_withTracking(comp, sourceComp, childSnaps, precompIdx) {
    var ts     = (new Date()).getTime();
    var PREFIX = "__dc_" + ts + "_" + precompIdx + "_";
    var result = [];  // [{ layer: copiedLayerOrNull, snap: childSnap }]

    // ── PHASE A: Unlock all children (copyToComp fails on locked layers) ─────
    // We unlock ALL first (not one at a time) to avoid index re-reads mid-loop
    for (var i = 0; i < childSnaps.length; i++) {
        try {
            var lyr = sourceComp.layer(childSnaps[i].sourceIndex);
            if (_v_isLayerAlive(lyr)) {
                lyr.locked = false;
                lyr.parent = null;  // parented layers also cause copy issues
            }
        } catch(e) {}
    }

    // ── PHASE B: Stamp temp names ─────────────────────────────────────────────
    // All names stamped before any copy — prevents any timing collision
    var tempNames = [];
    for (var i = 0; i < childSnaps.length; i++) {
        var tname = PREFIX + i;
        tempNames.push(tname);
        try {
            var lyr = sourceComp.layer(childSnaps[i].sourceIndex);
            if (_v_isLayerAlive(lyr)) lyr.name = tname;
        } catch(e) {}
    }

    // ── PHASE C: Copy one by one, track by temp name ──────────────────────────
    for (var i = 0; i < childSnaps.length; i++) {
        var snap   = childSnaps[i];
        var tname  = tempNames[i];
        var copied = null;

        try {
            var srcLyr = sourceComp.layer(snap.sourceIndex);
            if (!_v_isLayerAlive(srcLyr)) {
                result.push({ layer: null, snap: snap });
                continue;
            }

            srcLyr.copyToComp(comp);

            // Scan from index 1 upward to find our temp-named layer
            // We scan from top (1) because copyToComp always inserts there
            // Short-circuit as soon as found (performance: no need to scan all)
            for (var fi = 1; fi <= comp.numLayers; fi++) {
                try {
                    var candidate = comp.layer(fi);
                    if (_v_isLayerAlive(candidate) && candidate.name === tname) {
                        copied = candidate;
                        break;
                    }
                } catch(e) {}
            }

            // Restore name immediately — keep UI clean during processing
            if (copied) {
                try { copied.name = snap.name; } catch(e) {}
            }

        } catch(e) {
            // Copy failed for this specific layer — log but don't block batch
        }

        result.push({ layer: copied, snap: snap });
    }

    // ── PHASE D: Restore original names on source layers (safety net) ─────────
    // Even if copy failed — source names must go back to what user had
    for (var i = 0; i < childSnaps.length; i++) {
        try {
            var lyr = sourceComp.layer(childSnaps[i].sourceIndex);
            if (_v_isLayerAlive(lyr)) lyr.name = childSnaps[i].name;
        } catch(e) {}
    }

    return result;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// LAYER 6: STATE RESTORER
// sourceComp ke andar original parent/lock state wapas set karo
// Yeh ALWAYS run hota hai — copy fail ho ya succeed ho
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function _restore_childStates(sourceComp, childSnaps) {
    for (var i = 0; i < childSnaps.length; i++) {
        var snap = childSnaps[i];
        try {
            var lyr = sourceComp.layer(snap.sourceIndex);
            if (!_v_isLayerAlive(lyr)) continue;
            try { lyr.parent = snap.parent; } catch(e) {}
            try { lyr.locked = snap.locked; } catch(e) {}
        } catch(e) {}
    }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// LAYER 7: PLACEMENT APPLICATOR
// Har copied layer ko uski calculated position pe precisely set karo
//
// AE PROPERTY SET ORDER (critical):
//   1. startTime FIRST  — yeh layer ka timeline anchor set karta hai
//   2. inPoint SECOND   — yeh absolute trim-start set karta hai
//   3. outPoint THIRD   — yeh absolute trim-end set karta hai
//
//   Agar order galat ho:
//     inPoint set karo startTime se pehle → AE internally adjust kar sakta hai
//     outPoint set karo inPoint se pehle  → AE could clamp to current inPoint
//
//   Hamesha: startTime → inPoint → outPoint
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function _place_layers(copiedMap, precompSnap) {
    var placedCount = 0;

    for (var i = 0; i < copiedMap.length; i++) {
        var entry = copiedMap[i];

        // Skip: copy failed for this layer
        if (!entry.layer || !_v_isLayerAlive(entry.layer)) continue;

        try {
            // Calculate exact final position
            var pos = _calc_finalPosition(precompSnap, entry.snap);

            // Apply in strict order (see header comment)
            entry.layer.startTime = pos.startTime;
            entry.layer.inPoint   = pos.inPoint;
            entry.layer.outPoint  = pos.outPoint;

            // Verify placement (self-check)
            // If startTime didn't stick (some AE versions have quirks), try once more
            try {
                var actualST = entry.layer.startTime;
                if (Math.abs(actualST - pos.startTime) > 0.001) {
                    entry.layer.startTime = pos.startTime;
                    entry.layer.inPoint   = pos.inPoint;
                    entry.layer.outPoint  = pos.outPoint;
                }
            } catch(e) {}

            // Restore visual metadata (non-critical — wrapped individually)
            try { entry.layer.label    = entry.snap.label;    } catch(e) {}
            try { entry.layer.shy      = entry.snap.shy;      } catch(e) {}

            // Mark as selected so user can see what was placed
            try { entry.layer.selected = true; } catch(e) {}

            placedCount++;
        } catch(e) {
            // Placement error for this specific layer — don't block rest
        }
    }

    return placedCount;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// LAYER 8: SINGLE PRECOMP ORCHESTRATOR
// Ek precomp ke liye poora flow run karo — isolated aur atomic
// Ek precomp fail ho to sirf woh skip hoti hai, baaki sab safe
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// STACK ORDER RESTORER
// copyToComp always inserts at index 1, so copied layers end up reversed.
// This puts them back in the exact order they had inside the precomp.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function _restore_stackOrder(comp, copiedMap) {
    var live = [];
    for (var i = 0; i < copiedMap.length; i++) {
        var l = copiedMap[i].layer;
        if (l && _v_isLayerAlive(l)) live.push(l);
    }
    if (live.length < 2) return;

    // topmost copied layer = anchor slot for the whole group
    var top = live[0];
    for (var k = 1; k < live.length; k++) {
        try { if (live[k].index < top.index) top = live[k]; } catch(e) {}
    }

    try { if (live[0] !== top) live[0].moveBefore(top); } catch(e) {}
    for (var j = 1; j < live.length; j++) {
        try { live[j].moveAfter(live[j - 1]); } catch(e) {}
    }
}

function _run_onePrecomp(comp, precompLayer, precompIdx) {
    // Guard 1: layer must be alive
    if (!_v_isLayerAlive(precompLayer)) {
        return { ok: false, reason: "layer_dead" };
    }

    // Guard 2: must be a precomp
    if (!_v_isPrecomp(precompLayer)) {
        return { ok: false, reason: "not_precomp" };
    }

    var sourceComp = precompLayer.source;

    // Guard 3: source comp must be accessible
    if (!_v_isCompAlive(sourceComp)) {
        return { ok: false, reason: "source_dead" };
    }

    // ── FREEZE: read all state before any mutation ────────────────────────────
    var precompSnap = _freeze_precompPosition(precompLayer);
    var childSnaps  = _freeze_children(sourceComp);

    // Edge case: empty precomp (no layers inside)
    if (childSnaps.length === 0) {
        try { precompLayer.remove(); } catch(e) {}
        return { ok: true, placed: 0, reason: "empty_precomp" };
    }

    // ── COPY: layers to parent comp with tracking ─────────────────────────────
    var copiedMap = _copy_withTracking(comp, sourceComp, childSnaps, precompIdx);

    // ── RESTORE: put source comp state back (always, even if copy failed) ────
    _restore_childStates(sourceComp, childSnaps);

    // ── REMOVE: precomp layer hatao (AFTER copy + restore) ───────────────────
    try { precompLayer.remove(); } catch(e) {}

    // ── PLACE: copied layers ko calculated positions pe set karo ─────────────
    var placed = _place_layers(copiedMap, precompSnap);

    // ── ORDER: restore original top-to-bottom stacking of the copied layers ──
    _restore_stackOrder(comp, copiedMap);

    return { ok: true, placed: placed, total: childSnaps.length };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// LAYER 9: BATCH ORCHESTRATOR — MAIN ENTRY POINT
// Sabhi precomps ko safe order mein process karo
//
// SAFE ORDER LOGIC:
//   Precomps sorted by index DESCENDING before processing.
//   Example: selected precomps at indices [2, 15, 47, 891]
//   Processing order: 891 → 47 → 15 → 2
//
//   Why this works:
//     When we remove layer at index 891 → layers at 1-890 unchanged
//     When we remove layer at index 47  → layers at 1-46  unchanged
//     And so on — every removal only shifts layers ABOVE it (higher index)
//     Since we already processed those, they don't matter anymore
//
//   This guarantee holds for any N layers — 10, 1000, or 100000.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function unprecomp() {
    undoWrapper("UnPreComp", function() {

        // ── Step 1: Get active comp ───────────────────────────────────────────
        var comp = getActiveComp();
        if (!comp) return;

        // ── Step 2: Detect all precomps in selection ──────────────────────────
        var det = _det_getSelectedPrecomps(comp);

        if (det.error) {
            alert("UnPreComp error: " + det.error);
            return;
        }

        if (det.total === 0) {
            alert("Please select one or more precomp layers.");
            return;
        }

        if (det.precomps.length === 0) {
            alert("No precomp layers in selection.\n(" + det.skipped + " non-precomp layers skipped.)");
            return;
        }

        // ── Step 3: Sort descending by index — safe removal order ─────────────
        det.precomps.sort(function(a, b) {
            var ia = _v_safeNum(function(){ return a.index; }, 0);
            var ib = _v_safeNum(function(){ return b.index; }, 0);
            return ib - ia;  // descending: highest index first
        });

        // ── Step 4: Process each precomp — isolated per iteration ────────────
        var totalPlaced  = 0;
        var totalOk      = 0;
        var totalFailed  = 0;

        for (var pi = 0; pi < det.precomps.length; pi++) {
            try {
                var res = _run_onePrecomp(comp, det.precomps[pi], pi);
                if (res.ok) {
                    totalPlaced += (res.placed || 0);
                    totalOk++;
                } else {
                    totalFailed++;
                }
            } catch(e) {
                // Absolute last resort catch — this precomp is skipped
                totalFailed++;
            }
        }

        // ── Step 5: Silent success / alert only on failures ───────────────────
        if (totalFailed > 0) {
            alert(
                "UnPreComp complete.\n\n" +
                "✓ " + totalOk + " precomp(s) processed\n" +
                "✓ " + totalPlaced + " layer(s) placed\n" +
                "✗ " + totalFailed + " failed (locked or unsupported)"
            );
        }
        // Full success = no alert, AE undo stack shows "UnPreComp"
    });
}

function centerInComp() {
    undoWrapper("Center In Comp", function() {
        var comp = getActiveComp();
        if (!comp) return;
        var layers = comp.selectedLayers;
        if (layers.length === 0) return;
        
        for (var i = 0; i < layers.length; i++) {
            var layer = layers[i];
            layer.property("Position").setValue([comp.width/2, comp.height/2, layer.property("Position").value[2]]);
        }
    });
}

function setLabel(colorIndex) {
    undoWrapper("Set Label", function() {
        var comp = getActiveComp();
        if (!comp) return;
        var layers = comp.selectedLayers;
        for (var i = 0; i < layers.length; i++) {
            layers[i].label = colorIndex;
        }
    });
}

// ─── FIX EFFECT CENTER POINTS AFTER PRESET ───────────────────────────────────
function fixTextPresetEffectPoints(layer, comp) {
    try {
        var t = comp.time;
        var rect = layer.sourceRectAtTime(t, false);
        if (!rect || rect.width === 0) return;

        var pos    = layer.property("Anchor Point").value;
        var anchor = layer.property("Anchor Point").value;
        var scale  = layer.property("Scale").value;
        var sx     = scale[0] / 100;
        var sy     = scale[1] / 100;

        function ls2cs(lx, ly) {
            return [
                pos[0] + (lx - anchor[0]) * sx,
                pos[1] + (ly - anchor[1]) * sy
            ];
        }

        var r = rect;
        var topLeft   = ls2cs(r.left,            r.top);
        var topRight  = ls2cs(r.left + r.width,  r.top);
        var botLeft   = ls2cs(r.left,            r.top + r.height);
        var botRight  = ls2cs(r.left + r.width,  r.top + r.height);
        var topCenter = ls2cs(r.left + r.width * 0.5, r.top);
        var botCenter = ls2cs(r.left + r.width * 0.5, r.top + r.height);
        var center    = ls2cs(r.left + r.width * 0.5, r.top + r.height * 0.5);

        var fx = layer.property("ADBE Effect Parade") ||
                 layer.property("Effects") ||
                 layer.property(5);
        if (!fx || fx.numProperties === 0) return;

        for (var i = 1; i <= fx.numProperties; i++) {
            var effect = fx.property(i);
            var mn = "";
            try { mn = effect.matchName; } catch(e) { continue; }

            if (mn === "ADBE Ramp") {
                try { effect.property("Start of Ramp").setValue(topCenter); } catch(e) {}
                try { effect.property("End of Ramp").setValue(botCenter);   } catch(e) {}
            }

            if (mn === "ADBE 4-Color Gradient") {
                var grp = null;
                try { grp = effect.property("Positions & Colors"); }    catch(e1) {}
                if (!grp) {
                    try { grp = effect.property("ADBE 4ColorGradient-0001"); } catch(e2) {}
                }
                if (grp) {
                    try { grp.property("Point 1").setValue(topLeft);  } catch(e) {}
                    try { grp.property("Point 2").setValue(topRight); } catch(e) {}
                    try { grp.property("Point 3").setValue(botLeft);  } catch(e) {}
                    try { grp.property("Point 4").setValue(botRight); } catch(e) {}
                    try { grp.property("ADBE 4ColorGradient-0002").setValue(topLeft);  } catch(e) {}
                    try { grp.property("ADBE 4ColorGradient-0004").setValue(topRight); } catch(e) {}
                    try { grp.property("ADBE 4ColorGradient-0006").setValue(botLeft);  } catch(e) {}
                    try { grp.property("ADBE 4ColorGradient-0008").setValue(botRight); } catch(e) {}
                } else {
                    try { effect.property("Point 1").setValue(topLeft);  } catch(e) {}
                    try { effect.property("Point 2").setValue(topRight); } catch(e) {}
                    try { effect.property("Point 3").setValue(botLeft);  } catch(e) {}
                    try { effect.property("Point 4").setValue(botRight); } catch(e) {}
                }
            }

            if (mn === "CC Light Sweep") {
                try { effect.property("Center").setValue(center); } catch(e) {}
            }
        }
    } catch(e) {}
}

function enforceColorRevealGradient(layer) {
    // Color Reveal: top-left + top-right = blue, bottom-left + bottom-right = white.
    // AE's 4-Color Gradient color properties use the even match-name slots.
    try {
        var fx = layer.property("ADBE Effect Parade");
        if (!fx) return;
        var blue = [0.117647, 0.690196, 1.0]; // #1EB0FF-ish clean blue
        var white = [1.0, 1.0, 1.0];
        for (var i = 1; i <= fx.numProperties; i++) {
            var effect = fx.property(i);
            var mn = "";
            try { mn = effect.matchName; } catch(e) { continue; }
            if (mn !== "ADBE 4ColorGradient") continue;
            var grp = null;
            try { grp = effect.property("Positions & Colors"); } catch(e1) {}
            if (!grp) grp = effect;
            try { grp.property("ADBE 4ColorGradient-0002").setValue(blue); } catch(e) {}
            try { grp.property("ADBE 4ColorGradient-0004").setValue(blue); } catch(e) {}
            try { grp.property("ADBE 4ColorGradient-0006").setValue(white); } catch(e) {}
            try { grp.property("ADBE 4ColorGradient-0008").setValue(white); } catch(e) {}
            // Fallback for versions exposing display names.
            try { grp.property("Color 1").setValue(blue); } catch(e) {}
            try { grp.property("Color 2").setValue(blue); } catch(e) {}
            try { grp.property("Color 3").setValue(white); } catch(e) {}
            try { grp.property("Color 4").setValue(white); } catch(e) {}
        }
    } catch(e) {}
}

function applyPreset(pathStr) {
    undoWrapper("Apply Preset", function() {
        var comp = getActiveComp();
        if (!comp) return;
        
        var presetFile = new File(pathStr);
        if (!presetFile.exists) return alert("Preset file not found: " + pathStr);
        
        if (pathStr.toLowerCase().indexOf("animation enhancement") !== -1) {
            var selected = comp.selectedLayers;
            var layer = comp.layers.addShape();
            layer.name = "Animation Enhancement";
            
            // ── Selected layer ki EXACT length match karo ────────────────────
            if (selected && selected.length > 0) {
                var selIn  = selected[0].inPoint;
                var selOut = selected[0].outPoint;
                layer.startTime = selIn;
                layer.inPoint   = selIn;
                layer.outPoint  = selOut;
            } else {
                layer.startTime = 0;
                layer.inPoint   = 0;
                layer.outPoint  = comp.duration;
            }
            
            var shapeContents = layer.property("ADBE Root Vectors Group");
            var rect = shapeContents.addProperty("ADBE Vector Shape - Rect");
            rect.property("ADBE Vector Rect Size").setValue([comp.width, comp.height]);
            
            var fill = shapeContents.addProperty("ADBE Vector Graphic - Fill");
            fill.property("ADBE Vector Fill Color").setValue([1, 1, 1]);
            
            layer.adjustmentLayer = true;
            layer.applyPreset(presetFile);
            
            // ── Selected layer ke just UPAR rakho ────────────────────────────
            if (selected && selected.length > 0) {
                moveAboveSelected(layer, selected);
            }
        } else {
            var layers = comp.selectedLayers;
            if (layers.length === 0) return alert("Select a layer to apply preset.");
            
            for (var i = 0; i < layers.length; i++) {
                layers[i].applyPreset(presetFile);
                fixTextPresetEffectPoints(layers[i], comp);
                if (pathStr.toLowerCase().indexOf("color reveal.ffx") !== -1 || pathStr.toLowerCase().indexOf("color reveal") !== -1) {
                    enforceColorRevealGradient(layers[i]);
                }
            }
        }
    });
}

// ═══════════════════════════════════════════════════════════════════════════════
//  ENHANCE TOOLKIT — Rounded Corners + Bounce
// ═══════════════════════════════════════════════════════════════════════════════
function _dc_getEffectsGroup(layer) {
    if (!layer) return null;
    try { return layer.property("ADBE Effect Parade") || layer.property("Effects") || layer.property(5); } catch (e) { return null; }
}

function _dc_findEffectByName(effectsGroup, name) {
    if (!effectsGroup || !name) return null;
    try {
        for (var i = 1; i <= effectsGroup.numProperties; i++) {
            var fx = effectsGroup.property(i);
            if (fx && fx.name === name) return fx;
        }
    } catch (e) {}
    return null;
}

function _dc_getOrAddSliderControl(effectsGroup, name, value) {
    var fx = _dc_findEffectByName(effectsGroup, name);
    if (!fx) {
        try {
            fx = effectsGroup.addProperty("ADBE Slider Control");
            fx.name = name;
        } catch (eAdd) { return null; }
    }
    try {
        var slider = fx.property("Slider") || fx.property(1);
        if (slider) slider.setValue(value);
        return slider;
    } catch (eSet) { return null; }
}

function _dc_getOrAddCheckboxControl(effectsGroup, name, value) {
    var fx = _dc_findEffectByName(effectsGroup, name);
    if (!fx) {
        try {
            fx = effectsGroup.addProperty("ADBE Checkbox Control");
            fx.name = name;
        } catch (eAdd) { return null; }
    }
    try {
        var checkbox = fx.property("Checkbox") || fx.property(1);
        if (checkbox) checkbox.setValue(value ? 1 : 0);
        return checkbox;
    } catch (eSet) { return null; }
}

function _dc_isEffectProperty(prop) {
    try {
        var p = prop;
        while (p) {
            var mn = "";
            try { mn = p.matchName || ""; } catch (eMn) {}
            if (mn === "ADBE Effect Parade") return true;
            p = p.parentProperty;
        }
    } catch (e) {}
    return false;
}

function _dc_isBounceCompatibleProperty(prop) {
    if (!prop || !prop.canSetExpression) return false;
    try {
        if (_dc_isEffectProperty(prop)) return false;
        var t = prop.propertyValueType;
        // Expressions are meaningful for scalar/vector numeric properties.
        return t === PropertyValueType.OneD ||
               t === PropertyValueType.TwoD ||
               t === PropertyValueType.TwoD_SPATIAL ||
               t === PropertyValueType.ThreeD ||
               t === PropertyValueType.ThreeD_SPATIAL;
    } catch (e) { return false; }
}

function _dc_getBounceTarget(layer) {
    // Intelligent selection rule:
    // 1) Exactly one compatible property explicitly selected -> use it.
    // 2) Otherwise, if exactly one layer is selected, prefer the selected
    //    transform property (Position/Scale/Rotation) if AE reports it.
    // 3) Fall back to Position. Never attach the expression to text/color/audio
    //    properties that cannot participate in numeric overshoot math.
    try {
        var selectedProps = layer.selectedProperties || [];
        var compatible = [];
        for (var i = 0; i < selectedProps.length; i++) {
            if (_dc_isBounceCompatibleProperty(selectedProps[i])) compatible.push(selectedProps[i]);
        }
        if (compatible.length === 1) return compatible[0];
    } catch (eSelected) {}

    try {
        var tg = layer.property('ADBE Transform Group');
        var preferred = [
            tg ? tg.property('ADBE Position') : null,
            tg ? tg.property('ADBE Scale') : null,
            tg ? tg.property('ADBE Rotate Z') : null,
            tg ? tg.property('ADBE Opacity') : null
        ];
        // Position is the deterministic default, but use a selected transform
        // if AE exposes exactly one selected transform property.
        if (selectedProps && selectedProps.length) {
            for (var p = 0; p < preferred.length; p++) {
                if (preferred[p] && preferred[p].selected && _dc_isBounceCompatibleProperty(preferred[p])) return preferred[p];
            }
        }
        for (var q = 0; q < preferred.length; q++) {
            if (preferred[q] && preferred[q].matchName === 'ADBE Position' && _dc_isBounceCompatibleProperty(preferred[q])) return preferred[q];
        }
    } catch (eTransform) {}

    try {
        var pos = layer.property('Position');
        if (_dc_isBounceCompatibleProperty(pos)) return pos;
    } catch (ePos) {}
    return null;
}

function _dc_bounceExpression() {
    // Exact overshoot+ algorithm supplied by the user, adapted only so its
    // four controls are native Expression Controls on the selected layer.
    return 'try{' +
        'var amp=effect("DeepComp Bounce | Amplitude")("Slider")/1000;' +
        'var freq=effect("DeepComp Bounce | Frequency")("Slider");' +
        'var decay=effect("DeepComp Bounce | Decay")("Slider");' +
        'var floor=effect("DeepComp Bounce | Floor")("Checkbox");' +
        'var n,numkeys,v,t;' +
        'if(floor!=true){' +
            'n=0;' +
            'if(numKeys>0){n=nearestKey(time).index;if(key(n).time>time){n--;}};' +
            'if(n==0){t=0;}else{t=time-key(n).time;}' +
            'if(n>0){v=velocityAtTime(key(n).time-thisComp.frameDuration/10);value+v*amp*(Math.sin(freq*t*2*Math.PI)/Math.exp(decay*t));}else{value}' +
        '}else{' +
            'n=0;' +
            'if(numKeys>0){n=nearestKey(time).index;if(key(n).time>time){n--;}};' +
            'if(n==0){t=0;}else{t=time-key(n).time;}' +
            'if(n>0){v=velocityAtTime(key(n).time-thisComp.frameDuration/10);value+v*amp*-(Math.abs(Math.sin(freq*t*2*Math.PI))/Math.exp(decay*t));}else{value}' +
        '}' +
    '}catch(err){value}';
}

function applyDeepCompRoundedCorners(radius, borderValue) {
    var result = "error";
    undoWrapper("Rounded Corners", function() {
        try {
            var comp = getActiveComp();
            if (!comp) { result = "Open a composition first."; return; }
            var layers = comp.selectedLayers;
            if (!layers || layers.length === 0) { result = "Select a layer first."; return; }

            var r = Number(radius);
            if (!isFinite(r)) r = 0;
            r = Math.max(0, Math.min(100, r));

            var b = Number(borderValue);
            if (!isFinite(b)) b = Math.max(0, 40 + (r - 10) * 10);
            b = Math.max(0, b);

            for (var i = 0; i < layers.length; i++) {
                var layer = layers[i];
                var fxGroup = _dc_getEffectsGroup(layer);
                if (!fxGroup) continue;

                // Persist the radius on the layer so the border remains live-editable.
                var radiusSlider = _dc_getOrAddSliderControl(fxGroup, "DeepComp Corner Radius", r);
                if (!radiusSlider) { result = "Could not create the radius control on: " + layer.name; return; }

                var rounded = _dc_findEffectByName(fxGroup, "Rounded Edges");
                if (!rounded) rounded = _dc_findEffectByName(fxGroup, "Roughen Edges");
                if (!rounded) {
                    // AE exposes this native effect as Roughen Edges. We rename
                    // the instance to the user-facing “Rounded Edges” tool name
                    // used by DeepComp and by the supplied reference screenshot.
                    try { rounded = fxGroup.addProperty("ADBE Roughen Edges"); } catch (eMatch) {}
                    if (rounded) { try { rounded.name = "Rounded Edges"; } catch (eRenameRounded) {} }
                }
                if (!rounded) {
                    result = "After Effects could not create the Rounded Edges effect on: " + layer.name;
                    return;
                }

                var border = null;
                try { border = rounded.property("Border"); } catch (eBorderName) {}
                if (!border) {
                    try { border = rounded.property(3); } catch (eBorderIndex) {}
                }
                if (!border) {
                    result = "Rounded Edges was created, but its Border control was not found on: " + layer.name;
                    return;
                }

                // Border is formula-driven so changing DeepComp Corner Radius in AE
                // keeps the relationship alive. The panel also sends the evaluated value.
                var borderExpr = 'Math.max(0, 40 + (effect("DeepComp Corner Radius")("Slider") - 10) * 10);';
                try {
                    border.expression = borderExpr;
                    border.expressionEnabled = true;
                } catch (eExpr) {
                    // Fallback for older AE builds that do not accept an expression here.
                    border.setValue(b);
                }
            }
            result = "ok";
        } catch (e) {
            result = "Rounded Corners failed: " + e.toString();
        }
    });
    return result;
}

function applyDeepCompBounce(amplitude, frequency, decay, floor) {
    var result = "error";
    undoWrapper("Bounce", function() {
        try {
            var comp = getActiveComp();
            if (!comp) { result = "Open a composition first."; return; }
            var layers = comp.selectedLayers;
            if (!layers || layers.length === 0) { result = "Select a layer first."; return; }

            var a = Number(amplitude); if (!isFinite(a)) a = 250; a = Math.max(0, Math.min(2000, a));
            var f = Number(frequency); if (!isFinite(f)) f = 3;   f = Math.max(0.1, Math.min(20, f));
            var d = Number(decay);    if (!isFinite(d)) d = 5;    d = Math.max(0.1, Math.min(20, d));
            var fl = !!floor;
            var expr = _dc_bounceExpression();

            for (var i = 0; i < layers.length; i++) {
                var layer = layers[i];
                var fxGroup = _dc_getEffectsGroup(layer);
                if (!fxGroup) continue;

                _dc_getOrAddSliderControl(fxGroup, "DeepComp Bounce | Amplitude", a);
                _dc_getOrAddSliderControl(fxGroup, "DeepComp Bounce | Frequency", f);
                _dc_getOrAddSliderControl(fxGroup, "DeepComp Bounce | Decay", d);
                _dc_getOrAddCheckboxControl(fxGroup, "DeepComp Bounce | Floor", fl);

                var target = _dc_getBounceTarget(layer);
                if (!target) {
                    result = "No expression-capable property found on: " + layer.name;
                    return;
                }

                try {
                    target.expression = expr;
                    target.expressionEnabled = true;
                } catch (eExpression) {
                    result = "Could not apply Bounce to " + layer.name + ": " + eExpression.toString();
                    return;
                }
            }
            result = "ok";
        } catch (e) {
            result = "Bounce failed: " + e.toString();
        }
    });
    return result;
}

// ─── COMPREHENSIVE EFFECT MATCH-NAME LOOKUP ─────────────────────────────────
function getEffectMatchName(displayName) {
    var lookup = {
        // ── Blur & Sharpen ──
        "Bilateral Blur":           "ADBE Bilateral Blur",
        "Box Blur":                 "ADBE Box Blur2",
        "Camera Lens Blur":         "ADBE Camera Lens Blur",
        "Camera-Shake Deblur":      "ADBE CameraShakeDeblur",
        "CC Cross Blur":            "CC Cross Blur",
        "CC Radial Blur":           "CC Radial Blur",
        "CC Radial Fast Blur":      "CC Radial Fast Blur",
        "CC Vector Blur":           "CC Vector Blur",
        "Channel Blur":             "ADBE Channel Blur",
        "Compound Blur":            "ADBE Compound Blur",
        "Directional Blur":         "ADBE Motion Blur",
        "Fast Box Blur":            "ADBE Fast Box Blur",
        "Gaussian Blur":            "ADBE Gaussian Blur 2",
        "Lens Blur":                "ADBE Lens Blur",
        "Radial Blur":              "ADBE Radial Blur",
        "Reduce Interlace Flicker": "ADBE Reduce Interlace Flicker",
        "Sharpen":                  "ADBE Sharpen",
        "Smart Blur":               "ADBE Smart Blur",
        "Unsharp Mask":             "ADBE Unsharp Mask",
        // ── Channel ──
        "Arithmetic":               "ADBE Arithmetic",
        "Blend":                    "ADBE Blend",
        "Calculations":             "ADBE Calculations",
        "CC Composite":             "CC Composite",
        "Channel Combiner":         "ADBE Channel Combiner",
        "Compound Arithmetic":      "ADBE Compound Arithmetic",
        "Invert":                   "ADBE Invert",
        "Minimax":                  "ADBE Minimax",
        "Remove Color Matting":     "ADBE Remove Color Matting",
        "Set Channels":             "ADBE Set Channels",
        "Set Matte":                "ADBE Set Matte",
        "Shift Channels":           "ADBE Shift Channels",
        "Solid Composite":          "ADBE Solid Composite",
        // ── Color Correction ──
        "Auto Color":               "ADBE Auto Color",
        "Auto Contrast":            "ADBE Auto Contrast",
        "Auto Levels":              "ADBE Auto Levels",
        "Black & White":            "ADBE Black&White",
        "Brightness & Contrast":    "ADBE Brightness & Contrast 2",
        "Broadcast Colors":         "ADBE Broadcast Colors",
        "CC Color Neutralizer":     "CC Color Neutralizer",
        "CC Color Offset":          "CC Color Offset",
        "CC Kernel":                "CC Kernel",
        "CC Toner":                 "CC Toner",
        "Change Color":             "ADBE Change Color",
        "Change to Color":          "ADBE Change To Color",
        "Channel Mixer":            "ADBE Channel Mixer",
        "Color Balance":            "ADBE Color Balance",
        "Color Balance (HLS)":      "ADBE Color Balance (HLS)",
        "Color Link":               "ADBE Color Link",
        "Color Stabilizer":         "ADBE Color Stabilizer",
        "Colorama":                 "ADBE Colorama",
        "Curves":                   "ADBE CurvesCustom",
        "Equalize":                 "ADBE Equalize",
        "Exposure":                 "ADBE Exposure",
        "Gamma/Pedestal/Gain":      "ADBE Gamma/Pedestal/Gain",
        "Hue/Saturation":           "ADBE HUE SATURATION",
        "Hue/Sat":                  "ADBE HUE SATURATION",
        "Leave Color":              "ADBE Leave Color",
        "Levels":                   "ADBE Levels",
        "Levels (Individual Controls)": "ADBE Levels2",
        "Lumetri Color":            "ADBE Lumetri",
        "Photo Filter":             "ADBE Photo Filter",
        "PS Arbitrary Map":         "ADBE PS Arbitrary Map",
        "Selective Color":          "ADBE Selective Color",
        "Shadow/Highlight":         "ADBE Shadow-Highlight",
        "Tint":                     "ADBE Tint",
        "Tritone":                  "ADBE Tritone",
        "Vibrance":                 "ADBE Vibrance",
        // ── Distort ──
        "Bezier Warp":              "ADBE Bezier Warp",
        "Bulge":                    "ADBE Bulge",
        "CC Bend It":               "CC Bend It",
        "CC Blobylize":             "CC Blobylize",
        "CC Flo Motion":            "CC Flo Motion",
        "CC Griddler":              "CC Griddler",
        "CC Lens":                  "CC Lens",
        "CC Page Turn":             "CC Page Turn",
        "CC Power Pin":             "CC Power Pin",
        "CC Ripple Pulse":          "CC Ripple Pulse",
        "CC Slant":                 "CC Slant",
        "CC Smear":                 "CC Smear",
        "CC Split":                 "CC Split",
        "CC Split 2":               "CC Split 2",
        "CC Tiler":                 "CC Tiler",
        "Corner Pin":               "ADBE Corner Pin",
        "Displacement Map":         "ADBE Displacement Map",
        "Liquify":                  "ADBE FreePin3",
        "Magnify":                  "ADBE Magnify",
        "Mesh Warp":                "ADBE Mesh Warp",
        "Mirror":                   "ADBE Mirror",
        "Offset":                   "ADBE Shift Channels2",
        "Optics Compensation":      "ADBE Optics Compensation",
        "Polar Coordinates":        "ADBE Polar Coordinates",
        "Reshape":                  "ADBE Reshape",
        "Ripple":                   "ADBE Ripple",
        "Rolling Shutter Repair":   "ADBE Rolling Shutter",
        "Smear":                    "ADBE Smear",
        "Spherize":                 "ADBE Spherize",
        "Transform":                "ADBE Geometry2",
        "Turbulent Displace":       "ADBE Turbulent Displace",
        "Twirl":                    "ADBE Twirl",
        "Warp":                     "ADBE Warp",
        "Warp Stabilizer VFX":      "ADBE Warp Stabilizer2",
        "Wave Warp":                "ADBE Wave Warp",
        "Motion Tile":              "ADBE Motion Tile",
        // ── Generate ──
        "4-Color Gradient":         "ADBE 4-Color Gradient",
        "Advanced Lightning":       "ADBE ADBEAdvancedLightning",
        "Audio Spectrum":           "ADBE AudioSpectrum",
        "Audio Waveform":           "ADBE AudioWaveform",
        "Beam":                     "ADBE Beam",
        "CC Glue Gun":              "CC Glue Gun",
        "CC Light Burst 2.5":       "CC Light Burst 2.5",
        "CC Light Rays":            "CC Light Rays",
        "CC Light Sweep":           "CC Light Sweep",
        "CC Thread":                "CC Thread",
        "Cell Pattern":             "ADBE Cell Pattern",
        "Checkerboard":             "ADBE Checkerboard",
        "Circle":                   "ADBE Circle",
        "Ellipse":                  "ADBE Ellipse",
        "Eyedropper Fill":          "ADBE Eyedropper Fill",
        "Fill":                     "ADBE Fill",
        "Fractal":                  "ADBE Fractal",
        "Gradient Ramp":            "ADBE Ramp",
        "Grid":                     "ADBE Grid",
        "Lens Flare":               "ADBE Lens Flare",
        "Lightning":                "ADBE Lightning",
        "Paint Bucket":             "ADBE Paint Bucket",
        "Radio Waves":              "ADBE Radio Waves",
        "Scribble":                 "ADBE Scribble",
        "Stroke":                   "ADBE Stroke",
        "Vegas":                    "ADBE Vegas",
        "Write-on":                 "ADBE Write-on",
        // ── Keying ──
        "CC Simple Wire Removal":   "CC Simple Wire Removal",
        "Color Difference Key":     "ADBE Color Difference Key",
        "Color Range":              "ADBE Color Range",
        "Difference Matte":         "ADBE Difference Matte",
        "Extract":                  "ADBE Extract",
        "Inner/Outer Key":          "ADBE Inner/Outer Key",
        "Key Cleaner":              "ADBE Key Cleaner",
        "Keylight (1.2)":           "ADBE Keylight",
        "Keylight":                 "ADBE Keylight",
        "Linear Color Key":         "ADBE Linear Color Key",
        "Luma Key":                 "ADBE Luma Key",
        "Spill Suppressor":         "ADBE Spill Suppressor",
        // ── Matte ──
        "Matte Choker":             "ADBE Matte Choker",
        "Refine Hard Matte":        "ADBE Refine Hard Matte",
        "Refine Soft Matte":        "ADBE Refine Soft Matte",
        "Simple Choker":            "ADBE Simple Choker",
        // ── Noise & Grain ──
        "Add Grain":                "ADBE Add Grain",
        "Dust & Scratches":         "ADBE Dust & Scratches",
        "Fractal Noise":            "ADBE Fractal Noise",
        "Match Grain":              "ADBE Match Grain",
        "Median":                   "ADBE Median3",
        "Noise":                    "ADBE Noise",
        "Noise Alpha":              "ADBE Noise Alpha",
        "Noise HLS":                "ADBE Noise HLS",
        "Noise HLS Auto":           "ADBE Noise HLS Auto",
        "Remove Grain":             "ADBE Remove Grain",
        "Turbulent Noise":          "ADBE Turbulent Noise",
        // ── Perspective ──
        "3D Camera Tracker":        "ADBE CAMERATRACKER",
        "Bevel Alpha":              "ADBE Bevel Alpha",
        "Bevel Edges":              "ADBE Bevel Edges",
        "CC Cylinder":              "CC Cylinder",
        "CC Environment":           "CC Environment",
        "CC Sphere":                "CC Sphere",
        "CC Spotlight":             "CC Spotlight",
        "Drop Shadow":              "ADBE Drop Shadow",
        "Radial Shadow":            "ADBE Radial Shadow",
        // ── Simulation ──
        "Card Dance":               "ADBE Card Dance",
        "Caustics":                 "ADBE Caustics",
        "CC Ball Action":           "CC Ball Action",
        "CC Bubbles":               "CC Bubbles",
        "CC Drizzle":               "CC Drizzle",
        "CC Hair":                  "CC Hair",
        "CC Mr. Mercury":           "CC Mr. Mercury",
        "CC Particle Systems II":   "CC Particle Systems II",
        "CC Particle World":        "CC Particle World",
        "CC Pixel Polly":           "CC Pixel Polly",
        "CC Rainfall":              "CC Rainfall",
        "CC Scatterize":            "CC Scatterize",
        "CC Snowfall":              "CC Snowfall",
        "CC Star Burst":            "CC Star Burst",
        "Foam":                     "ADBE Foam",
        "Particle Playground":      "ADBE Particle Playground",
        "Shatter":                  "ADBE Shatter",
        "Wave World":               "ADBE Wave World",
        // ── Stylize ──
        "Brush Strokes":            "ADBE Brush Strokes",
        "Cartoon":                  "ADBE Cartoon",
        "CC Block Load":            "CC Block Load",
        "CC Burn Film":             "CC Burn Film",
        "CC Glass":                 "CC Glass",
        "CC HexTile":               "CC HexTile",
        "CC Kaleida":               "CC Kaleida",
        "CC Mr. Smoothie":          "CC Mr. Smoothie",
        "CC Plastic":               "CC Plastic",
        "CC RepeTile":              "CC RepeTile",
        "CC Threshold":             "CC Threshold",
        "CC Threshold RGB":         "CC Threshold RGB",
        "CC Vignette":              "CC Vignette",
        "Color Emboss":             "ADBE Color Emboss",
        "Emboss":                   "ADBE Emboss",
        "Find Edges":               "ADBE Find Edges",
        "Glow":                     "ADBE Glow",
        "Mosaic":                   "ADBE Mosaic",
        "Motion Blur":              "ADBE Motion Blur",
        "Posterize":                "ADBE Posterize",
        "Roughen Edges":            "ADBE Roughen Edges",
        "Scatter":                  "ADBE Scatter",
        "Strobe Light":             "ADBE Strobe Light",
        "Texturize":                "ADBE Texturize",
        "Threshold":                "ADBE Threshold",
        // ── Text ──
        "Numbers":                  "ADBE Numbers",
        "Timecode":                 "ADBE Timecode",
        // ── Time ──
        "CC Force Motion Blur":     "CC Force Motion Blur",
        "CC Wide Time":             "CC Wide Time",
        "Echo":                     "ADBE Echo",
        "Posterize Time":           "ADBE Posterize Time",
        "Time Difference":          "ADBE Time Difference",
        "Time Displacement":        "ADBE Time Displacement",
        "Timewarp":                 "ADBE Timewarp",
        // ── Transition ──
        "Block Dissolve":           "ADBE Block Dissolve",
        "Card Wipe":                "ADBE Card Wipe",
        "CC Glass Wipe":            "CC Glass Wipe",
        "CC Grid Wipe":             "CC Grid Wipe",
        "CC Image Wipe":            "CC Image Wipe",
        "CC Jaws":                  "CC Jaws",
        "CC Light Wipe":            "CC Light Wipe",
        "CC Line Sweep":            "CC Line Sweep",
        "CC Radial ScaleWipe":      "CC Radial ScaleWipe",
        "CC Scale Wipe":            "CC Scale Wipe",
        "CC Twister":               "CC Twister",
        "CC WarpoMatic":            "CC WarpoMatic",
        "Gradient Wipe":            "ADBE Gradient Wipe",
        "Iris Wipe":                "ADBE Iris Wipe",
        "Linear Wipe":              "ADBE Linear Wipe",
        "Radial Wipe":              "ADBE Radial Wipe",
        "Venetian Blinds":          "ADBE Venetian Blinds",
        // ── Utility ──
        "Apply Color LUT":          "ADBE Apply Color LUT2",
        "Cineon Converter":         "ADBE Cineon Converter",
        "Color Profile Converter":  "ADBE Color Profile Converter",
        "Grow Bounds":              "ADBE Grow Bounds",
        "HDR Compander":            "ADBE HDR Compander",
        "HDR Highlight Compression":"ADBE HDR Highlight Compression",
        "Depth Matte":              "ADBE Depth Matte",
        "Depth of Field":           "ADBE Depth of Field",
        "High-Low Pass":            "ADBE High-Low Pass",
        // ── Popular Third-Party Plugins ──
        "Deep Glow":                "Deep Glow",
        "Shadow Studio 2":          "Shadow Studio 2",
        "Shadow Studio 3":          "Shadow Studio 3",
        "Saber":                    "Saber",
        "RSMB":                     "RSMB",
        "RSMB Pro":                 "RSMB Pro",
        "Twixtor":                  "Twixtor",
        "Twixtor Pro":              "Twixtor Pro",
        "Particular":               "Particular",
        "Trapcode Particular":      "Particular",
        "Form":                     "Form",
        "Trapcode Form":            "Form",
        "Mir":                      "Mir",
        "Trapcode Mir":             "Mir",
        "Element 3D":               "Element 3D",
        "Video Copilot Element 3D": "Element 3D",
        "Optical Flares":           "Optical Flares",
        "Orb":                      "Orb",
        "VC Orb":                   "Orb",
        "Mettle SkyBox":            "Mettle SkyBox Studio",
        "BCC Lens Flare":           "BCC Lens Flare",
        "BCC Glitter":              "BCC Glitter",
        "BCC Motion Blur":          "BCC Motion Blur",
        "BCC Fast Film Glow":       "BCC Fast Film Glow",
        "BCC Chromatic Aberration": "BCC Chromatic Aberration",
        "BCC Rays":                 "BCC Rays",
        "Sapphire Glow":            "S_Glow",
        "Sapphire Blur":            "S_Blur",
        "Sapphire Flare":           "S_LensFlare",
        "Sapphire Grain":           "S_Grain",
        "Sapphire Vignette":        "S_Vignette",
        "Sapphire Rays":            "S_Rays",
        "Sapphire WarpDrops":       "S_WarpDrops",
        "Mocha AE":                 "ADBE Mocha Shape",
        "Magic Bullet Looks":       "Magic Bullet Looks",
        "Magic Bullet Colorista":   "Colorista IV",
        "Neat Video":               "Neat Video v5 AE",
        "Denoiser III":             "Denoiser III",
        "Film Convert":             "FilmConvert",
        "Universe Glow":            "Universe Glow",
        "Universe Chromatic Aberration": "Universe Chromatic Aberration",
        "Universe VHS":             "Universe VHS",
        "Universe Kaleidoscope":    "Universe Kaleidoscope",
        "ReelSmart Motion Blur":    "RSMB",
        "Sure Target 2":            "Sure Target 2",
        "Starglow":                 "Starglow",
        "Shine":                    "Shine",
        "3D Stroke":                "3D Stroke",
        "Lux":                      "Lux",
        "Sound Keys":               "Sound Keys"
    };
    
    var found = lookup[displayName];
    return found ? found : displayName;
}

// ─── SMART APPLY EFFECT ──────────────────────────────────────────────────────
function applyEffect(effectName) {
    undoWrapper("Apply Effect: " + effectName, function() {
        var comp = getActiveComp();
        if (!comp) return;
        var layers = comp.selectedLayers;
        if (layers.length === 0) return alert("Please select a layer first, then click the effect.");
        
        var matchName = getEffectMatchName(effectName);
        
        for (var i = 0; i < layers.length; i++) {
            var layer = layers[i];
            var effectsGroup = layer.property("ADBE Effect Parade") ||
                               layer.property("Effects") ||
                               layer.property(5);
            if (!effectsGroup) continue;
            
            var applied = false;
            try { effectsGroup.addProperty(matchName); applied = true; } catch(e1) {}
            if (!applied && matchName !== effectName) {
                try { effectsGroup.addProperty(effectName); applied = true; } catch(e2) {}
            }
            if (!applied) {
                try { var dummy = effectsGroup.addProperty(effectName.toLowerCase()); applied = true; } catch(e3) {}
            }
            if (!applied) {
                alert(
                    "Effect \"" + effectName + "\" could not be applied.\n\n" +
                    "Possible reasons:\n" +
                    "1. Plugin is not installed on this machine.\n" +
                    "2. Effect name spelling is slightly different.\n" +
                    "3. The layer type does not support this effect."
                );
            }
        }
    });
}

// ─── ZOOM IN ─────────────────────────────────────────────────────────────────
// Selected layer ke shuru mein 1 second ki zoom in layer, just UPAR
function applySmoothZoomIn() {
    undoWrapper("Smooth Zoom In", function() {
        var comp = getActiveComp();
        if (!comp) return;
        
        var duration = 1.0;
        var selected = comp.selectedLayers;
        
        var compStart, compEnd;
        if (selected && selected.length > 0) {
            compStart = selected[0].inPoint;
            compEnd   = compStart + duration;
        } else {
            compStart = comp.time;
            compEnd   = comp.time + duration;
        }
        
        var layer = comp.layers.addShape();
        layer.name = "deepcomp zoom in";
        layer.startTime = compStart;
        layer.inPoint   = compStart;
        layer.outPoint  = compEnd;
        
        var shapeContents = layer.property("ADBE Root Vectors Group");
        var rect = shapeContents.addProperty("ADBE Vector Shape - Rect");
        rect.property("ADBE Vector Rect Size").setValue([comp.width, comp.height]);
        
        var fill = shapeContents.addProperty("ADBE Vector Graphic - Fill");
        fill.property("ADBE Vector Fill Color").setValue([1, 1, 1]);
        
        layer.adjustmentLayer = true;
        layer.motionBlur = true;
        comp.motionBlur = true;
        
        var effectsGroup = layer.property("ADBE Effect Parade") || layer.property("Effects") || layer.property(5);
        var transformEffect = null;
        try {
            transformEffect = effectsGroup.addProperty("ADBE Geometry2");
        } catch(e) {
            transformEffect = effectsGroup.addProperty("Transform");
        }
        
        var scale = transformEffect.property("Scale") || transformEffect.property("ADBE Geometry2-0004");
        scale.setValueAtTime(compStart, 100);
        scale.setValueAtTime(compEnd,   135);
        
        var easeIn = new KeyframeEase(0, 80);
        var easeOut = new KeyframeEase(0, 80);
        scale.setTemporalEaseAtKey(1, [easeIn], [easeOut]);
        scale.setTemporalEaseAtKey(2, [easeIn], [easeOut]);
        
        // ── Selected layer ke just UPAR rakho ────────────────────────────────
        if (selected && selected.length > 0) {
            moveAboveSelected(layer, selected);
        }
    });
}

// ─── ZOOM OUT ────────────────────────────────────────────────────────────────
// Selected layer ke end mein 1 second ki zoom out layer, just UPAR
function applySmoothZoomOut() {
    undoWrapper("Smooth Zoom Out", function() {
        var comp = getActiveComp();
        if (!comp) return;
        
        var duration = 1.0;
        var selected = comp.selectedLayers;
        
        var compStart, compEnd;
        if (selected && selected.length > 0) {
            compEnd   = selected[0].outPoint;
            compStart = compEnd - duration;
        } else {
            compEnd   = comp.time + duration;
            compStart = comp.time;
        }
        
        var layer = comp.layers.addShape();
        layer.name = "deepcomp zoom out";
        layer.startTime = compStart;
        layer.inPoint   = compStart;
        layer.outPoint  = compEnd;
        
        var shapeContents = layer.property("ADBE Root Vectors Group");
        var rect = shapeContents.addProperty("ADBE Vector Shape - Rect");
        rect.property("ADBE Vector Rect Size").setValue([comp.width, comp.height]);
        
        var fill = shapeContents.addProperty("ADBE Vector Graphic - Fill");
        fill.property("ADBE Vector Fill Color").setValue([1, 1, 1]);
        
        layer.adjustmentLayer = true;
        layer.motionBlur = true;
        comp.motionBlur = true;
        
        var effectsGroup = layer.property("ADBE Effect Parade") || layer.property("Effects") || layer.property(5);
        var transformEffect = null;
        try {
            transformEffect = effectsGroup.addProperty("ADBE Geometry2");
        } catch(e) {
            transformEffect = effectsGroup.addProperty("Transform");
        }
        
        var scale = transformEffect.property("Scale") || transformEffect.property("ADBE Geometry2-0004");
        scale.setValueAtTime(compStart, 135);
        scale.setValueAtTime(compEnd,   100);
        
        var easeIn = new KeyframeEase(0, 80);
        var easeOut = new KeyframeEase(0, 80);
        scale.setTemporalEaseAtKey(1, [easeIn], [easeOut]);
        scale.setTemporalEaseAtKey(2, [easeIn], [easeOut]);
        
        // ── Selected layer ke just UPAR rakho ────────────────────────────────
        if (selected && selected.length > 0) {
            moveAboveSelected(layer, selected);
        }
    });
}

function organiseProject() {
    undoWrapper("Organise Project", function() {
        var proj = app.project;
        var items = proj.items;
        
        var folderPng = null;
        var folderSfx = null;
        var folderComps = null;
        
        for (var i = 1; i <= items.length; i++) {
            if (items[i] instanceof FolderItem) {
                if (items[i].name == "PNG") folderPng = items[i];
                if (items[i].name == "SFX") folderSfx = items[i];
                if (items[i].name == "Comps") folderComps = items[i];
            }
        }
        
        if (!folderPng) folderPng = proj.items.addFolder("PNG");
        if (!folderSfx) folderSfx = proj.items.addFolder("SFX");
        if (!folderComps) folderComps = proj.items.addFolder("Comps");
        
        for (var i = 1; i <= items.length; i++) {
            var item = items[i];
            if (item.parentFolder.name != proj.rootFolder.name) continue;
            
            if (item instanceof CompItem) {
                item.parentFolder = folderComps;
            } else if (item instanceof FootageItem) {
                var ext = item.file ? item.file.name.split('.').pop().toLowerCase() : "";
                if (ext == "png" || ext == "jpg" || ext == "jpeg") {
                    item.parentFolder = folderPng;
                } else if (ext == "wav" || ext == "mp3") {
                    item.parentFolder = folderSfx;
                }
            }
        }
    });
}

function timeToSeconds(timeStr) {
    if (!timeStr) return 0;
    var cleanStr = timeStr.replace(/^\s+|\s+$/g, '').replace(",", ".");
    var parts = cleanStr.split(":");
    if (parts.length < 3) return 0;
    var hours = parseFloat(parts[0]) || 0;
    var minutes = parseFloat(parts[1]) || 0;
    var seconds = parseFloat(parts[2]) || 0;
    return (hours * 3600) + (minutes * 60) + seconds;
}

function importSRT() {
    var comp = getActiveComp();
    if (!comp) return "error";
    
    var srtFile = File.openDialog("Select SRT Subtitle File", "SRT files:*.srt");
    if (!srtFile) return "cancel";
    
    var count = 0;
    undoWrapper("Import SRT Subtitles", function() {
        srtFile.open("r");
        var content = srtFile.read();
        srtFile.close();
        
        var blocks = content.replace(/\r\n/g, "\n").split(/\n\s*\n/);
        
        for (var i = 0; i < blocks.length; i++) {
            var block = blocks[i].replace(/^\s+|\s+$/g, '');
            if (block === "") continue;
            
            var lines = block.split("\n");
            if (lines.length < 3) continue;
            
            var timeLine = lines[1];
            var times = timeLine.split("-->");
            if (times.length < 2) continue;
            
            var startSec = timeToSeconds(times[0]);
            var endSec = timeToSeconds(times[1]);
            
            var textLines = [];
            for (var j = 2; j < lines.length; j++) {
                textLines.push(lines[j]);
            }
            var textStr = textLines.join("\n");
            
            var textLayer = comp.layers.addText(textStr);
            textLayer.name = "Sub: " + textStr.replace(/\n/g, " ").substring(0, 15);
            textLayer.inPoint = startSec;
            textLayer.outPoint = endSec;
            
            var textProp = textLayer.property("Source Text");
            var textDoc = textProp.value;
            textDoc.justification = ParagraphJustification.CENTER_JUSTIFY;
            textProp.setValue(textDoc);
            
            textLayer.property("Position").setValue([comp.width / 2, comp.height * 0.85, 0]);
            count++;
        }
    });
    
    alert("Successfully imported " + count + " subtitles!");
    return count.toString();
}

function getExtensionLibraryRoot(extRootFromJS) {
    if (extRootFromJS && extRootFromJS !== "" && extRootFromJS !== "undefined") {
        return extRootFromJS;
    }
    try {
        var f = new File($.fileName);
        if (f.exists) {
            var candidate = f.parent.parent.fsName;
            var csxs = new Folder(candidate + (($.os.indexOf("Win") !== -1) ? "\\" : "/") + "CSXS");
            if (csxs.exists) return candidate;
        }
    } catch(e) {}
    return null;
}

// ─── GET USER-WRITABLE LIBRARY ROOT ─────────────────────────────────────────
function getUserLibraryRoot() {
    // Match main.js exactly. Folder.userData is not a portable HOME path on
    // every CEP/ExtendScript host, so use APPDATA/HOME environment variables.
    var isWin = ($.os.indexOf('Win') !== -1);
    var sep = isWin ? "\\" : "/";
    var base = isWin ? $.getenv('APPDATA') : $.getenv('HOME');
    if (!base || base === '') {
        // Conservative fallback for hosts that do not expose the environment.
        base = Folder.userData.fsName;
        if (!isWin) {
            var prefs = base;
            var needle = "/Library/Preferences";
            if (prefs.indexOf(needle) !== -1) base = prefs.substring(0, prefs.indexOf(needle));
        }
    }
    base = String(base).replace(/[\\\/]+$/, '');
    var libRoot = isWin
        ? base + sep + 'DeepComp' + sep + 'yugz.fx'
        : base + sep + 'Library' + sep + 'Application Support' + sep + 'DeepComp' + sep + 'yugz.fx';
    var libFolder = new Folder(libRoot);
    if (!libFolder.exists) libFolder.create();
    return libRoot;
}

// Return the exact host-side library root so the CEP UI and ExtendScript
// never disagree about where saved assets live.
function getDeepCompLibraryRoot() {
    try { return getUserLibraryRoot(); } catch (e) { return ''; }
}

// ─── SAVE PRECOMP BACKEND MOVED TO THE COMPATIBLE PRECOMP LIBRARY ENGINE ─────
function saveImage(extRootFromJS) {
    var resultStr = "error";
    undoWrapper("Save Selected Image", function() {
        var imageItem = null;

        // Priority 1: check selected layers in the active timeline
        var comp = app.project.activeItem;
        if (comp && comp instanceof CompItem) {
            var layers = comp.selectedLayers;
            for (var li = 0; li < layers.length; li++) {
                var lyr = layers[li];
                if (lyr.source && lyr.source instanceof FootageItem && lyr.source.file) {
                    var ext = lyr.source.file.name.split(".").pop().toLowerCase();
                    if (ext === "png" || ext === "jpg" || ext === "jpeg" || ext === "bmp" || ext === "tga" || ext === "tiff" || ext === "tif" || ext === "gif" || ext === "webp") {
                        imageItem = lyr.source;
                        break;
                    }
                }
            }
        }

        // Priority 2: fall back to Project Panel selection
        if (!imageItem) {
            var items = app.project.selection;
            for (var i = 0; i < items.length; i++) {
                if (items[i] instanceof FootageItem && items[i].file) {
                    imageItem = items[i];
                    break;
                }
            }
        }

        if (!imageItem) {
            alert("Please select an image layer in the timeline, or an image in the Project Panel.");
            resultStr = "no_selection";
            return;
        }

        var srcFile = imageItem.file;
        var sep = ($.os.indexOf("Win") !== -1) ? "\\" : "/";

        var userLibRoot2 = getUserLibraryRoot();
        var libDir    = new Folder(userLibRoot2 + sep + "library");
        if (!libDir.exists) libDir.create();
        var imagesDir = new Folder(libDir.fsName + sep + "Images");
        if (!imagesDir.exists) imagesDir.create();

        var destFile = new File(imagesDir.fsName + sep + srcFile.name);
        try { srcFile.copy(destFile); } catch(eCopy) {}
        resultStr = srcFile.name;
    });
    return resultStr;
}

// importSavedAsset is provided by the transplanted Precomp Library engine below.

function openEffectsPresetsPanel() {
    var id = app.findMenuCommandId("Effects & Presets");
    if (id > 0) {
        app.executeCommand(id);
    } else {
        app.executeCommand(3718);
    }
}

function getLastAppliedEffect() {
    var comp = app.project.activeItem;
    if (!comp || !(comp instanceof CompItem)) return "NO_COMP";
    var layers = comp.selectedLayers;
    if (layers.length === 0) return "NO_LAYER";
    var layer = layers[0];
    var fx = layer.property("ADBE Effect Parade") ||
              layer.property("Effects") ||
              layer.property(5);
    if (!fx || fx.numProperties === 0) return "NO_EFFECTS";
    var lastFx = fx.property(fx.numProperties);
    return lastFx ? lastFx.name : "NO_EFFECTS";
}

function getAllEffectsOnLayer() {
    var comp = app.project.activeItem;
    if (!comp || !(comp instanceof CompItem)) return "[]";
    var layers = comp.selectedLayers;
    if (layers.length === 0) return "[]";
    var layer = layers[0];
    var fx = layer.property("ADBE Effect Parade") ||
              layer.property("Effects") ||
              layer.property(5);
    if (!fx || fx.numProperties === 0) return "[]";
    var names = [];
    for (var i = 1; i <= fx.numProperties; i++) {
        names.push(fx.property(i).name);
    }
    var json = "[";
    for (var j = 0; j < names.length; j++) {
        json += '"' + names[j].replace(/"/g, '\\"') + '"';
        if (j < names.length - 1) json += ",";
    }
    json += "]";
    return json;
}

function scanInstalledPlugins() {
    var pluginNames = [];
    var pluginDirs = [];
    pluginDirs.push(new Folder("C:/Program Files/Adobe/Adobe After Effects 2025/Support Files/Plug-ins"));
    pluginDirs.push(new Folder("C:/Program Files/Adobe/Adobe After Effects 2024/Support Files/Plug-ins"));
    pluginDirs.push(new Folder("C:/Program Files/Adobe/Adobe After Effects 2023/Support Files/Plug-ins"));
    pluginDirs.push(new Folder("C:/Program Files/Adobe/Common/Plug-ins/7.0/MediaCore"));
    pluginDirs.push(new Folder("C:/Program Files/Adobe/Common/Plug-ins/CSX/MediaCore"));
    pluginDirs.push(new Folder("/Applications/Adobe After Effects 2025/Plug-ins"));
    pluginDirs.push(new Folder("/Applications/Adobe After Effects 2024/Plug-ins"));
    pluginDirs.push(new Folder("/Library/Application Support/Adobe/Common/Plug-ins/7.0/MediaCore"));
    
    function scanDir(folder) {
        try {
            if (!folder.exists) return;
            var items = folder.getFiles();
            for (var i = 0; i < items.length; i++) {
                var item = items[i];
                if (item instanceof Folder) {
                    scanDir(item);
                } else if (item instanceof File) {
                    var name = item.name;
                    if (name.match(/\.(aex|plugin)$/i)) {
                        var displayName = name.replace(/\.(aex|plugin)$/i, '');
                        pluginNames.push(displayName);
                    }
                }
            }
        } catch(e) {}
    }
    for (var d = 0; d < pluginDirs.length; d++) { scanDir(pluginDirs[d]); }
    var unique = [];
    var seen = {};
    for (var j = 0; j < pluginNames.length; j++) {
        if (!seen[pluginNames[j]]) { seen[pluginNames[j]] = true; unique.push(pluginNames[j]); }
    }
    var json = "[";
    for (var k = 0; k < unique.length; k++) {
        json += '"' + unique[k].replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
        if (k < unique.length - 1) json += ",";
    }
    json += "]";
    return json;
}

function getAllInstalledEffects() {
    var results = [];
    try {
        var effectsCollection = app.effects;
        for (var i = 0; i < effectsCollection.length; i++) {
            var fx = effectsCollection[i];
            try {
                var name      = fx.displayName || fx.name || "";
                var category  = fx.category    || "Other";
                var matchName = fx.matchName   || name;
                if (name) { results.push({ n: name, c: category, m: matchName }); }
            } catch(eInner) {}
        }
    } catch(eOuter) {
        return "UNAVAILABLE";
    }
    var parts = [];
    for (var j = 0; j < results.length; j++) {
        var r = results[j];
        var n = r.n.replace(/\\/g,"\\\\").replace(/"/g,'\\"');
        var c = r.c.replace(/\\/g,"\\\\").replace(/"/g,'\\"');
        var m = r.m.replace(/\\/g,"\\\\").replace(/"/g,'\\"');
        parts.push('{"n":"' + n + '","c":"' + c + '","m":"' + m + '"}');
    }
    return "[" + parts.join(",") + "]";
}

function getUserPresetsFromAE() {
    var results = [];
    var presetDirs = [];
    var win_docs = new Folder(
        Folder.userData.fsName + "/AppData/Roaming/Adobe/After Effects/" +
        app.version.split(".")[0] + ".x/User Presets"
    );
    presetDirs.push(win_docs);
    var winVersions = ["26.0","25.0","24.0","23.0","22.0","21.0","18.0","17.0","16.0"];
    for (var vi = 0; vi < winVersions.length; vi++) {
        presetDirs.push(new Folder(
            Folder.userData.fsName + "/AppData/Roaming/Adobe/After Effects/" +
            winVersions[vi] + "/User Presets"
        ));
        presetDirs.push(new Folder(
            "C:/Program Files/Adobe/Adobe After Effects " +
            (2000 + parseInt(winVersions[vi])) +
            "/Support Files/Presets"
        ));
    }
    presetDirs.push(new Folder(
        Folder.userData.fsName + "/Library/Application Support/Adobe/After Effects/" +
        app.version.split(".")[0] + ".x/User Presets"
    ));
    presetDirs.push(new Folder("/Applications/Adobe After Effects 2026/Presets"));
    presetDirs.push(new Folder("/Applications/Adobe After Effects 2025/Presets"));
    presetDirs.push(new Folder("/Applications/Adobe After Effects 2024/Presets"));

    var seen = {};
    function scanPresetDir(folder, parentLabel) {
        if (!folder || !folder.exists) return;
        try {
            var items = folder.getFiles();
            for (var i = 0; i < items.length; i++) {
                var item = items[i];
                if (item instanceof Folder) {
                    scanPresetDir(item, item.name);
                } else if (item instanceof File) {
                    if (item.name.match(/\.ffx$/i)) {
                        var displayName = item.name.replace(/\.ffx$/i, "");
                        var pathStr = item.fsName.replace(/\\/g, "\\\\");
                        var key = displayName.toLowerCase();
                        if (!seen[key]) {
                            seen[key] = true;
                            results.push({ n: displayName, p: pathStr, f: parentLabel || "Presets" });
                        }
                    }
                }
            }
        } catch(e) {}
    }
    for (var d = 0; d < presetDirs.length; d++) { scanPresetDir(presetDirs[d], presetDirs[d].name); }
    var parts = [];
    for (var j = 0; j < results.length; j++) {
        var r = results[j];
        var n = r.n.replace(/\\/g,"\\\\").replace(/"/g,'\\"');
        var p = r.p.replace(/"/g,'\\"');
        var f = r.f.replace(/\\/g,"\\\\").replace(/"/g,'\\"');
        parts.push('{"n":"' + n + '","p":"' + p + '","f":"' + f + '"}');
    }
    return "[" + parts.join(",") + "]";
}

function applyEffectByMatchName(matchName, displayName) {
    undoWrapper("Apply Effect: " + displayName, function() {
        var comp = getActiveComp();
        if (!comp) return;
        var layers = comp.selectedLayers;
        if (layers.length === 0) {
            return alert("Please select a layer first, then click the effect chip.");
        }
        for (var i = 0; i < layers.length; i++) {
            var layer = layers[i];
            var effectsGroup = layer.property("ADBE Effect Parade") ||
                               layer.property("Effects") || layer.property(5);
            if (!effectsGroup) continue;
            var applied = false;
            try { effectsGroup.addProperty(matchName); applied = true; } catch(e1) {}
            if (!applied) {
                try { effectsGroup.addProperty(displayName); applied = true; } catch(e2) {}
            }
            if (!applied) {
                alert("Could not apply \"" + displayName + "\".\n" +
                      "It may not be installed, or the layer type may not support it.");
            }
        }
    });
}

// ═══════════════════════════════════════════════════════════════════════════════
//  V2.0 EXTENDED AE TOOLS
// ═══════════════════════════════════════════════════════════════════════════════

function addText() {
    undoWrapper("Add Text Layer", function() {
        var comp = getActiveComp();
        if (!comp) return;
        var selected = comp.selectedLayers;
        var layer = comp.layers.addText("Text");
        layer.property("Position").setValue([comp.width / 2, comp.height / 2, 0]);
        if (selected && selected.length > 0) {
            layer.inPoint = selected[0].inPoint;
            layer.outPoint = selected[0].outPoint;
            moveAboveSelected(layer, selected);
        }
    });
}

function addShape() {
    undoWrapper("Add Shape Layer", function() {
        var comp = getActiveComp();
        if (!comp) return;
        var selected = comp.selectedLayers;
        var layer = comp.layers.addShape();
        layer.name = "Shape Layer";
        var shapeContents = layer.property("ADBE Root Vectors Group");
        var rect = shapeContents.addProperty("ADBE Vector Shape - Rect");
        rect.property("ADBE Vector Rect Size").setValue([comp.width * 0.4, comp.height * 0.4]);
        var fill = shapeContents.addProperty("ADBE Vector Graphic - Fill");
        fill.property("ADBE Vector Fill Color").setValue([1, 1, 1]);
        if (selected && selected.length > 0) {
            layer.inPoint = selected[0].inPoint;
            layer.outPoint = selected[0].outPoint;
            moveAboveSelected(layer, selected);
        }
    });
}

function duplicateLayer() {
    undoWrapper("Duplicate Layer", function() {
        var comp = getActiveComp();
        if (!comp) return;
        var selected = comp.selectedLayers;
        if (!selected || selected.length === 0) return alert("Select layers to duplicate.");
        for (var i = 0; i < selected.length; i++) {
            selected[i].duplicate();
        }
    });
}

function trimInPoint() {
    undoWrapper("Trim In Point", function() {
        var comp = getActiveComp();
        if (!comp) return;
        var selected = comp.selectedLayers;
        if (!selected || selected.length === 0) return alert("Select layers to trim.");
        for (var i = 0; i < selected.length; i++) {
            selected[i].inPoint = comp.time;
        }
    });
}

function trimOutPoint() {
    undoWrapper("Trim Out Point", function() {
        var comp = getActiveComp();
        if (!comp) return;
        var selected = comp.selectedLayers;
        if (!selected || selected.length === 0) return alert("Select layers to trim.");
        for (var i = 0; i < selected.length; i++) {
            selected[i].outPoint = comp.time;
        }
    });
}

function splitLayers() {
    undoWrapper("Split Layers", function() {
        var comp = getActiveComp();
        if (!comp) return;
        var selected = comp.selectedLayers;
        if (!selected || selected.length === 0) return alert("Select layers to split.");
        var t = comp.time;
        for (var i = 0; i < selected.length; i++) {
            var lyr = selected[i];
            if (t > lyr.inPoint && t < lyr.outPoint) {
                var dup = lyr.duplicate();
                lyr.outPoint = t;
                dup.inPoint = t;
            }
        }
    });
}

function fitToComp(mode) {
    undoWrapper("Fit to Comp", function() {
        var comp = getActiveComp();
        if (!comp) return;
        var selected = comp.selectedLayers;
        if (!selected || selected.length === 0) return alert("Select a layer.");
        for (var i = 0; i < selected.length; i++) {
            var lyr = selected[i];
            var rect = lyr.sourceRectAtTime(comp.time, false);
            var w = rect.width;
            var h = rect.height;
            if (w === 0 || h === 0) continue;
            var curScale = lyr.property("Scale").value;
            var sx = (comp.width / w) * 100;
            var sy = (comp.height / h) * 100;
            if (mode === "width") {
                lyr.property("Scale").setValue([sx, (curScale[1] / curScale[0]) * sx, curScale[2]]);
            } else if (mode === "height") {
                lyr.property("Scale").setValue([(curScale[0] / curScale[1]) * sy, sy, curScale[2]]);
            } else {
                lyr.property("Scale").setValue([sx, sy, curScale[2]]);
            }
            lyr.property("Position").setValue([comp.width / 2, comp.height / 2, lyr.property("Position").value[2]]);
        }
    });
}

function sequenceLayers(frameOffset) {
    undoWrapper("Sequence Layers", function() {
        var comp = getActiveComp();
        if (!comp) return;
        var selected = comp.selectedLayers;
        if (!selected || selected.length < 2) return alert("Select 2 or more layers to sequence.");
        var offset = (typeof frameOffset === "number" ? frameOffset : 0) / comp.frameRate;
        var currentTime = selected[0].inPoint;
        for (var i = 0; i < selected.length; i++) {
            var lyr = selected[i];
            var dur = lyr.outPoint - lyr.inPoint;
            lyr.startTime = currentTime - (lyr.inPoint - lyr.startTime);
            lyr.inPoint = currentTime;
            lyr.outPoint = currentTime + dur;
            currentTime += (dur - offset);
        }
    });
}

function removeAllEffects() {
    undoWrapper("Remove All Effects", function() {
        var comp = getActiveComp();
        if (!comp) return;
        var selected = comp.selectedLayers;
        if (!selected || selected.length === 0) return alert("Select layers.");
        for (var i = 0; i < selected.length; i++) {
            var fx = selected[i].property("ADBE Effect Parade") || selected[i].property("Effects");
            if (fx) {
                while (fx.numProperties > 0) {
                    fx.property(1).remove();
                }
            }
        }
    });
}

var _copiedPropsBuffer = null;

function copyProperties() {
    var comp = getActiveComp();
    if (!comp) return "error";
    var selected = comp.selectedLayers;
    if (!selected || selected.length === 0) return "no_layer";
    var lyr = selected[0];
    _copiedPropsBuffer = {
        position: lyr.property("Position").value,
        scale: lyr.property("Scale").value,
        rotation: lyr.property("Rotation") ? lyr.property("Rotation").value : 0,
        opacity: lyr.property("Opacity").value
    };
    return "ok";
}

function pasteProperties() {
    undoWrapper("Paste Properties", function() {
        if (!_copiedPropsBuffer) return alert("No properties copied yet.");
        var comp = getActiveComp();
        if (!comp) return;
        var selected = comp.selectedLayers;
        if (!selected || selected.length === 0) return alert("Select target layers.");
        for (var i = 0; i < selected.length; i++) {
            var lyr = selected[i];
            try { lyr.property("Position").setValue(_copiedPropsBuffer.position); } catch(e) {}
            try { lyr.property("Scale").setValue(_copiedPropsBuffer.scale); } catch(e) {}
            try { if (lyr.property("Rotation")) lyr.property("Rotation").setValue(_copiedPropsBuffer.rotation); } catch(e) {}
            try { lyr.property("Opacity").setValue(_copiedPropsBuffer.opacity); } catch(e) {}
        }
    });
}

function renameSelectedLayers(baseName) {
    undoWrapper("Rename Layers", function() {
        var comp = getActiveComp();
        if (!comp) return;
        var selected = comp.selectedLayers;
        if (!selected || selected.length === 0) return;
        for (var i = 0; i < selected.length; i++) {
            selected[i].name = (selected.length > 1) ? (baseName + " " + (i + 1)) : baseName;
        }
    });
}

// ═══════════════════════════════════════════════════════════════════════════════
//  AUTOMATIC TEXT PRESET KEYFRAME SYSTEM
// ═══════════════════════════════════════════════════════════════════════════════

function _collectAnimatableProps(group, list) {
    if (!group) return;
    for (var i = 1; i <= group.numProperties; i++) {
        var prop = group.property(i);
        if (prop.propertyType === PropertyType.PROPERTY) {
            if (prop.numKeys > 0) {
                list.push(prop);
            }
        } else if (prop.propertyType === PropertyType.INDEXED_GROUP || prop.propertyType === PropertyType.NAMED_GROUP) {
            _collectAnimatableProps(prop, list);
        }
    }
}

function applyPresetWithKeyframeAdaptation(pathStr) {
    var resultStatus = "error";
    undoWrapper("Apply Preset & Adapt Timing", function() {
        var comp = getActiveComp();
        if (!comp) return;
        var presetFile = new File(pathStr);
        if (!presetFile.exists) return alert("Preset file not found: " + pathStr);

        var selected = comp.selectedLayers;
        if (!selected || selected.length === 0) return alert("Select a layer to apply preset.");

        for (var li = 0; li < selected.length; li++) {
            var layer = selected[li];
            var targetIn = layer.inPoint;
            var targetOut = layer.outPoint;

            // 1. Snapshot existing keyframe timestamps across all properties
            var beforeProps = [];
            _collectAnimatableProps(layer, beforeProps);
            var beforeSnapshot = [];
            for (var b = 0; b < beforeProps.length; b++) {
                var p = beforeProps[b];
                var kTimes = [];
                for (var ki = 1; ki <= p.numKeys; ki++) {
                    kTimes.push(p.keyTime(ki));
                }
                beforeSnapshot.push({ prop: p, times: kTimes });
            }

            // 2. Apply the .ffx preset
            layer.applyPreset(presetFile);
            fixTextPresetEffectPoints(layer, comp);

            // 3. Collect all properties after preset application
            var afterProps = [];
            _collectAnimatableProps(layer, afterProps);

            // 4. Identify newly introduced keyframes and find the earliest keyframe time
            var earliestPresetKey = 999999;
            var newKeyEntries = [];

            for (var a = 0; a < afterProps.length; a++) {
                var propAfter = afterProps[a];
                var oldMatch = null;
                for (var s = 0; s < beforeSnapshot.length; s++) {
                    if (beforeSnapshot[s].prop === propAfter) {
                        oldMatch = beforeSnapshot[s];
                        break;
                    }
                }

                var newlyAddedIndices = [];
                if (!oldMatch) {
                    // All keys on this property are new
                    for (var k = 1; k <= propAfter.numKeys; k++) {
                        var kt = propAfter.keyTime(k);
                        if (kt < earliestPresetKey) earliestPresetKey = kt;
                        newlyAddedIndices.push(k);
                    }
                } else {
                    // Check if new keys exist
                    for (var k2 = 1; k2 <= propAfter.numKeys; k2++) {
                        var kt2 = propAfter.keyTime(k2);
                        var isOld = false;
                        for (var ot = 0; ot < oldMatch.times.length; ot++) {
                            if (Math.abs(oldMatch.times[ot] - kt2) < 0.0001) {
                                isOld = true;
                                break;
                            }
                        }
                        if (!isOld) {
                            if (kt2 < earliestPresetKey) earliestPresetKey = kt2;
                            newlyAddedIndices.push(k2);
                        }
                    }
                }

                if (newlyAddedIndices.length > 0) {
                    newKeyEntries.push({ prop: propAfter, indices: newlyAddedIndices });
                }
            }

            // 5. If preset keyframes were detected, calculate shift and reposition them to targetIn
            if (earliestPresetKey !== 999999 && newKeyEntries.length > 0) {
                var shift = targetIn - earliestPresetKey;
                if (Math.abs(shift) > 0.001) {
                    for (var e = 0; e < newKeyEntries.length; e++) {
                        var entry = newKeyEntries[e];
                        var targetProp = entry.prop;
                        // Snapshot keyframe data before moving
                        var keyData = [];
                        for (var i = 1; i <= targetProp.numKeys; i++) {
                            var t = targetProp.keyTime(i);
                            var v = targetProp.keyValue(i);
                            var inEase = null, outEase = null;
                            var inInterp = null, outInterp = null;
                            try { inEase = targetProp.keyInTemporalEase(i); } catch(eEase) {}
                            try { outEase = targetProp.keyOutTemporalEase(i); } catch(eEase2) {}
                            try { inInterp = targetProp.keyInInterpolationType(i); } catch(eInt) {}
                            try { outInterp = targetProp.keyOutInterpolationType(i); } catch(eInt2) {}
                            keyData.push({
                                time: t + shift,
                                value: v,
                                inEase: inEase,
                                outEase: outEase,
                                inInterp: inInterp,
                                outInterp: outInterp
                            });
                        }

                        // Re-create shifted keys
                        while (targetProp.numKeys > 0) {
                            targetProp.removeKey(1);
                        }
                        for (var kd = 0; kd < keyData.length; kd++) {
                            var item = keyData[kd];
                            var newKeyIndex = targetProp.addKey(item.time);
                            targetProp.setValueAtKey(newKeyIndex, item.value);
                            try {
                                if (item.inEase && item.outEase) {
                                    targetProp.setTemporalEaseAtKey(newKeyIndex, item.inEase, item.outEase);
                                }
                            } catch(eSetEase) {}
                            try {
                                if (item.inInterp !== null && item.outInterp !== null) {
                                    targetProp.setInterpolationTypeAtKey(newKeyIndex, item.inInterp, item.outInterp);
                                }
                            } catch(eSetInt) {}
                        }
                    }
                }
            }
        }
        resultStatus = "ok";
    });
    return resultStatus;
}

// ═══════════════════════════════════════════════════════════════════════════════
//  AE HEALTH & CACHE MONITOR
// ═══════════════════════════════════════════════════════════════════════════════

function getAEHealthStats() {
    var memStr = "{}";
    try {
        var sizes = app.memorySizes;
        var total = sizes ? (sizes.appMemorySize || 0) : 0;
        var used = sizes ? (sizes.usedMemorySize || 0) : 0;
        var comps = 0;
        if (app.project) {
            for (var i = 1; i <= app.project.numItems; i++) {
                if (app.project.item(i) instanceof CompItem) comps++;
            }
        }
        memStr = '{"appMemory":"' + total + '","usedMemory":"' + used + '","comps":' + comps + ',"version":"' + app.version + '"}';
    } catch(e) {
        memStr = '{"error":"' + e.toString().replace(/"/g, '\\"') + '"}';
    }
    return memStr;
}

function purgeAECache() {
    undoWrapper("Purge All Memory & Cache", function() {
        try {
            app.purge(PurgeTarget.ALL_CACHES);
        } catch(e) {
            try {
                app.purge(PurgeTarget.IMAGE_CACHES);
                app.purge(PurgeTarget.UNDO_CACHES);
            } catch(e2) {}
        }
    });
    return "ok";
}

// ═══════════════════════════════════════════════════════════════════════════════
//  SFX SOUND DESIGN LIBRARY — AE HOST BRIDGE
// ═══════════════════════════════════════════════════════════════════════════════

function findExistingFootageByPath(pathStr) {
    if (!app.project) return null;
    var targetFile = new File(pathStr);
    var targetFsName = targetFile.fsName ? targetFile.fsName.toLowerCase() : "";
    for (var i = 1; i <= app.project.numItems; i++) {
        var item = app.project.item(i);
        if (item instanceof FootageItem && item.file && item.file.fsName) {
            if (item.file.fsName.toLowerCase() === targetFsName) {
                return item;
            }
        }
    }
    return null;
}

function insertSFX(pathStr, displayName, insertMode, offsetSec, trimInSec, trimOutSec) {
    var resultStr = "error";
    undoWrapper("DeepComp - Insert SFX", function() {
        var comp = getActiveComp();
        if (!comp) {
            resultStr = "NO_ACTIVE_COMP";
            return;
        }

        var sfxFile = new File(pathStr);
        if (!sfxFile.exists) {
            resultStr = "FILE_NOT_FOUND";
            return;
        }

        offsetSec = (typeof offsetSec === "number") ? offsetSec : parseFloat(offsetSec || 0);
        if (isNaN(offsetSec)) offsetSec = 0;

        trimInSec = (typeof trimInSec === "number") ? trimInSec : parseFloat(trimInSec || 0);
        if (isNaN(trimInSec)) trimInSec = 0;

        trimOutSec = (typeof trimOutSec === "number") ? trimOutSec : parseFloat(trimOutSec || 0);
        if (isNaN(trimOutSec)) trimOutSec = 0;

        // 1. Prevent duplicate footage import if already in project
        var footage = findExistingFootageByPath(pathStr);
        if (!footage) {
            try {
                var importOptions = new ImportOptions(sfxFile);
                footage = app.project.importFile(importOptions);
            } catch(eImp) {
                resultStr = "IMPORT_FAILED: " + eImp.toString();
                return;
            }
        }

        if (!footage) {
            resultStr = "FOOTAGE_NULL";
            return;
        }

        // 2. Determine base insertion time based on mode
        var baseTime = comp.time;
        if (insertMode === "selected_start" || insertMode === "smart") {
            if (comp.selectedLayers && comp.selectedLayers.length > 0) {
                baseTime = comp.selectedLayers[0].inPoint;
            }
        } else if (insertMode === "selected_end") {
            if (comp.selectedLayers && comp.selectedLayers.length > 0) {
                baseTime = comp.selectedLayers[0].outPoint;
            }
        }

        var insertTime = baseTime + offsetSec;
        if (insertTime < 0) insertTime = 0;

        // 3. Add audio layer to comp
        var layer = comp.layers.add(footage);
        if (!layer) {
            resultStr = "LAYER_ADD_FAILED";
            return;
        }

        // 4. Rename layer to display name
        if (displayName && displayName !== "" && displayName !== "undefined") {
            layer.name = displayName;
        }

        // 5. Handle trimming without modifying source file
        if (trimOutSec > trimInSec && trimOutSec > 0) {
            var dur = trimOutSec - trimInSec;
            layer.startTime = insertTime - trimInSec;
            layer.inPoint = insertTime;
            layer.outPoint = insertTime + dur;
        } else if (trimInSec > 0) {
            layer.startTime = insertTime - trimInSec;
            layer.inPoint = insertTime;
        } else {
            layer.startTime = insertTime;
        }

        var mins = Math.floor(insertTime / 60);
        var secs = Math.floor(insertTime % 60);
        var frames = Math.floor((insertTime % 1) * (comp.frameRate || 30));
        var timeFormatted = (mins < 10 ? "0" + mins : mins) + ":" +
                            (secs < 10 ? "0" + secs : secs) + ":" +
                            (frames < 10 ? "0" + frames : frames);

        resultStr = '{"status":"ok","insertedTime":' + insertTime + ',"formattedTime":"' + timeFormatted + '","layerName":"' + layer.name.replace(/"/g, '\\"') + '"}';
    });
    return resultStr;
}

function insertSoundStack(stackJsonStr) {
    var resultStr = "error";
    undoWrapper("DeepComp - Insert Sound Stack", function() {
        var comp = getActiveComp();
        if (!comp) {
            resultStr = "NO_ACTIVE_COMP";
            return;
        }

        var stackData = null;
        try {
            eval("stackData = " + stackJsonStr + ";");
        } catch(eParse) {
            resultStr = "PARSE_ERROR: " + eParse.toString();
            return;
        }

        if (!stackData || !stackData.items || stackData.items.length === 0) {
            resultStr = "EMPTY_STACK";
            return;
        }

        var baseTime = comp.time;
        if (stackData.insertMode === "selected_start" && comp.selectedLayers && comp.selectedLayers.length > 0) {
            baseTime = comp.selectedLayers[0].inPoint;
        }

        var insertedCount = 0;
        for (var i = 0; i < stackData.items.length; i++) {
            var item = stackData.items[i];
            if (!item || !item.filePath) continue;

            var sfxFile = new File(item.filePath);
            if (!sfxFile.exists) continue;

            var footage = findExistingFootageByPath(item.filePath);
            if (!footage) {
                try {
                    var importOptions = new ImportOptions(sfxFile);
                    footage = app.project.importFile(importOptions);
                } catch(e) { continue; }
            }
            if (!footage) continue;

            var offset = (typeof item.offset === "number") ? item.offset : parseFloat(item.offset || 0);
            if (isNaN(offset)) offset = 0;

            var itemInsertTime = baseTime + offset;
            if (itemInsertTime < 0) itemInsertTime = 0;

            var layer = comp.layers.add(footage);
            if (layer) {
                if (item.displayName) layer.name = item.displayName;
                layer.startTime = itemInsertTime;
                insertedCount++;
            }
        }

        var mins = Math.floor(baseTime / 60);
        var secs = Math.floor(baseTime % 60);
        var frames = Math.floor((baseTime % 1) * (comp.frameRate || 30));
        var timeFormatted = (mins < 10 ? "0" + mins : mins) + ":" +
                            (secs < 10 ? "0" + secs : secs) + ":" +
                            (frames < 10 ? "0" + frames : frames);

        resultStr = '{"status":"ok","count":' + insertedCount + ',"formattedTime":"' + timeFormatted + '"}';
    });
    return resultStr;
}


// ══════════════════════════════════════════════════════════════════════════════
//  SFX FOLDER PICKER  (opens native OS folder dialog, returns path string)
// ══════════════════════════════════════════════════════════════════════════════
function pickFolderForSFX() {
    try {
        var folder = Folder.selectDialog("Select a folder of SFX audio files");
        if (folder) {
            return folder.fsName; // Returns the native file-system path e.g. C:\Users\…\SFX
        }
    } catch (e) {}
    return "null";
}


// ============================================================================
// DeepComp Save Precomp: transplanted proven Precomp Library backend
// UI remains DeepComp; storage/API are driven by this engine.
// ============================================================================

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


// DeepComp compatibility aliases: use the transplanted backend as the single source of truth.
function getSelectedPrecompInfo() { return pcSelectionInfo(); }
function savePrecomp(name, extRootFromJS) {
    var r = pcSavePrecomp(name);
    try {
        var o = JSON.parse(r);
        return o.ok ? o.entry.name : (o.error ? o.error : "error");
    } catch(e) { return "error"; }
}
function importSavedAsset(pathStr) {
    var r = pcImportPrecomp(pathStr);
    try {
        var o = JSON.parse(r);
        if (!o.ok) { alert("DeepComp: " + o.error); return "error"; }
        return o.comp || "Imported";
    } catch(e) { return "error"; }
}
