var busy = false;
var oneSpare = readConfig("oneSpare", false);
var backHome = readConfig("backHome", false);
var keepFirst = readConfig("keepFirst", false);
var updateDelay = readConfig("updateDelay", 1000);
var createProtectionGrace = readConfig("createProtectionGrace", 1500);

// desktop.id -> timestamp when first seen
var desktopCreationTime = {};

// window.internalId -> when onAllDesktops was first observed this stretch
var onAllDesktopsSince = {};

var updateTimer = null;

function sameDesktop(a, b) {
    return a && b && a.id === b.id;
}

function desktopStillExists(desktop) {
    if (!desktop)
        return false;
    for (var i = 0; i < workspace.desktops.length; i++) {
        if (sameDesktop(workspace.desktops[i], desktop))
            return true;
    }
    return false;
}

function windowId(window) {
    return window.internalId.toString();
}

/**
 * Track windows that are on all desktops. Short-lived stretches are treated as
 * desktop-switch animations (macsimize6); long-lived ones are sticky windows.
 */
function refreshOnAllDesktopsTracking() {
    var active = {};
    var windows = workspace.windowList();

    for (var i = 0; i < windows.length; i++) {
        var window = windows[i];
        if (!window || !window.normalWindow || window.skipTaskbar)
            continue;
        if (!window.onAllDesktops)
            continue;

        var id = windowId(window);
        active[id] = true;
        if (onAllDesktopsSince[id] === undefined)
            onAllDesktopsSince[id] = Date.now();
    }

    for (var id in onAllDesktopsSince) {
        if (!active[id])
            delete onAllDesktopsSince[id];
    }
}

/**
 * True while a normal window has only recently been put on all desktops.
 * During that window, source/destination desktops look empty because
 * onAllDesktops clears window.desktops — so we must not delete anything.
 */
function isDesktopSwitchAnimationActive() {
    if (createProtectionGrace <= 0)
        return false;

    refreshOnAllDesktopsTracking();

    var now = Date.now();
    for (var id in onAllDesktopsSince) {
        if ((now - onAllDesktopsSince[id]) < createProtectionGrace)
            return true;
    }
    return false;
}

function isDesktopEmpty(desktop) {
    if (keepFirst && sameDesktop(workspace.desktops[0], desktop))
        return false;

    var windows = workspace.windowList();
    for (var i = 0; i < windows.length; i++) {
        var window = windows[i];
        if (!window || !window.normalWindow || window.skipTaskbar)
            continue;
        // Sticky / onAllDesktops windows are ignored for emptiness: a permanent
        // "show on all desktops" window must not pin every desktop forever.
        // Animation safety is handled by isDesktopSwitchAnimationActive().
        if (window.onAllDesktops)
            continue;
        if (window.desktops && window.desktops.includes(desktop))
            return false;
    }
    return true;
}

/**
 * Closing focused desktops is allowed only if backHome is enabled
 */
function mayCloseDesktop(desktop) {
    return !sameDesktop(workspace.currentDesktop, desktop) || backHome;
}

/**
 * Should last desktop be closed because second to last is empty?
 */
function shouldCloseLastDesktop() {
    return workspace.desktops.length >= 2
        && isDesktopEmpty(workspace.desktops[workspace.desktops.length - 2])
        && mayCloseDesktop(workspace.desktops[workspace.desktops.length - 1]);
}

function isRecentlyCreated(desktop) {
    if (createProtectionGrace <= 0)
        return false;
    var created = desktopCreationTime[desktop.id];
    if (created === undefined)
        return false;
    return (Date.now() - created) < createProtectionGrace;
}

function shouldProtectDesktop(desktop) {
    return isRecentlyCreated(desktop);
}

function deleteDesktop(desktop) {
    if (!desktopStillExists(desktop))
        return;
    if (sameDesktop(workspace.currentDesktop, desktop) && backHome)
        workspace.currentDesktop = workspace.desktops[0];
    delete desktopCreationTime[desktop.id];
    workspace.removeDesktop(desktop);
}

/**
 * Prefixes of the names KWin gives desktops by default. KWin names them
 * i18n("Desktop %1"), so outside English the prefix is translated
 * ("Bureau 2", "デスクトップ 2") and cannot be hard-coded; it is learnt from
 * desktops whose name ends in their own position (see learnDefaultName).
 */
var defaultNamePrefixes = ['Desktop '];

function learnDefaultName(desktop, position) {
    var m = /^(.*[^0-9])([0-9]+)$/.exec(desktop.name);
    if (m && parseInt(m[2], 10) === position && defaultNamePrefixes.indexOf(m[1]) < 0)
        defaultNamePrefixes.push(m[1]);
}

function defaultNamePrefix(name) {
    for (var i = 0; i < defaultNamePrefixes.length; i++) {
        var prefix = defaultNamePrefixes[i];
        if (name.length > prefix.length && name.indexOf(prefix) === 0
            && /^[0-9]+$/.test(name.substring(prefix.length)))
            return prefix;
    }
    return null;
}

function renameDesktops() {
    var n = 1;
    for (var i = 0; i < workspace.desktops.length; i++) {
        var d = workspace.desktops[i];
        var prefix = defaultNamePrefix(d.name);
        if (prefix !== null) {
            if (d.name !== prefix + n)
                d.name = prefix + n;
            n++;
        }
    }
}

function balanceDesktops() {
    if (busy)
        return;

    // Workaround for macsimize6 smooth animation
    if (isDesktopSwitchAnimationActive()) {
        update(Math.min(updateDelay, 150));
        return;
    }

    busy = true;

    if (oneSpare) {
        for (var i = 0; i < workspace.desktops.length - 1; i++) {
            var d = workspace.desktops[i];
            if (shouldProtectDesktop(d))
                continue;
            if (isDesktopEmpty(d) && mayCloseDesktop(d))
                deleteDesktop(d);
        }

        var last = workspace.desktops[workspace.desktops.length - 1];
        if (shouldCloseLastDesktop() && !shouldProtectDesktop(last)) {
            deleteDesktop(last);
        } else if (!isDesktopEmpty(last)) {
            workspace.createDesktop(workspace.desktops.length, '');
        }
    } else {
        // Iterate backwards so index shifts from removals don't skip desktops
        for (var i = workspace.desktops.length - 1; i >= 0; i--) {
            var d = workspace.desktops[i];
            if (shouldProtectDesktop(d))
                continue;
            if (isDesktopEmpty(d) && mayCloseDesktop(d))
                deleteDesktop(d);
        }
    }

    renameDesktops();
    busy = false;
}

function recordNewDesktops() {
    var now = Date.now();
    var activeIds = {};

    for (var i = 0; i < workspace.desktops.length; i++) {
        var d = workspace.desktops[i];
        activeIds[d.id] = true;
        if (!(d.id in desktopCreationTime)) {
            desktopCreationTime[d.id] = now;
            learnDefaultName(d, i + 1);
        }
    }

    for (var id in desktopCreationTime) {
        if (!activeIds[id])
            delete desktopCreationTime[id];
    }
}

function update(delay) {
    if (delay === undefined || delay === null)
        delay = updateDelay;

    // Debounce: restart so a burst of signals only balances once after settle.
    if (updateTimer) {
        updateTimer.stop();
        updateTimer = null;
    }

    updateTimer = new QTimer();
    updateTimer.interval = delay;
    updateTimer.singleShot = true;
    updateTimer.timeout.connect(function () {
        updateTimer = null;
        balanceDesktops();
    });
    updateTimer.start();
}

function connectSignals() {
    workspace.windowAdded.connect(function (window) {
        if (window !== null && window.normalWindow)
            update();
    });
    workspace.windowRemoved.connect(function (window) {
        if (window !== null && window.normalWindow)
            update();
    });
    workspace.desktopsChanged.connect(function () {
        recordNewDesktops();
        // Pick up onAllDesktops transitions that start with desktop creation
        refreshOnAllDesktopsTracking();
        update();
    });
    workspace.currentDesktopChanged.connect(function () {
        refreshOnAllDesktopsTracking();
        update();
    });
}

function main() {
    var now = Date.now();

    // Existing desktops are not "new".
    for (var i = 0; i < workspace.desktops.length; i++) {
        desktopCreationTime[workspace.desktops[i].id] = now - createProtectionGrace - 1;
        learnDefaultName(workspace.desktops[i], i + 1);
    }

    // Existing sticky windows must not look like an in-progress animation.
    refreshOnAllDesktopsTracking();
    for (var id in onAllDesktopsSince)
        onAllDesktopsSince[id] = now - createProtectionGrace - 1;

    connectSignals();
    update();
}

main();
