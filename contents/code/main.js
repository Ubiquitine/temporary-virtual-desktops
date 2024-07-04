var busy = false;
var oneSpare = readConfig("oneSpare", false);
var backHome = readConfig("backHome", false);

function isDesktopEmpty(desktop) {
    for (var i in workspace.windowList()) {
        var window = workspace.windowList()[i];
        if (window.desktops.includes(desktop) && window.normalWindow && !window.skipTaskbar) {
            return false;
        }
    }
    return true;
}

/**
 * Closing focused desktops is allowed only if backHome is enabled
 */
function mayCloseDesktop(desktop) {
    return workspace.currentDesktop != desktop || backHome;
}

/**
 * Should last desktop be closed because second to last is empty?
 */
function shouldCloseLastDesktop() {
    return workspace.desktops.length >= 2 
        && isDesktopEmpty(workspace.desktops[workspace.desktops.length - 2])
        && mayCloseDesktop(workspace.desktops[workspace.desktops.length - 1]);
}

function deleteDesktop(desktop) {
    if (workspace.currentDesktop == desktop && backHome){
        workspace.currentDesktop = workspace.desktops[0];
    }
    workspace.removeDesktop(desktop);
}

function renameDesktops() {
    var n = 1;
    for (var i = 0 ; i < workspace.desktops.length ; i++ ) {
        var d = workspace.desktops[i];
        if (/^Desktop\ ([0-9]{1,})$/.test(d.name)) {
            d.name = 'Desktop ' + n ;
            n++;
        }
    }
}

function balanceDesktops() {
    if (busy) {
        return;
    }

    busy = true;

    if (oneSpare) {
        for (var i = 0 ; i < workspace.desktops.length - 1 ; i++ ) {
            if (isDesktopEmpty(workspace.desktops[i]) && mayCloseDesktop(workspace.desktops[i])){
                deleteDesktop(workspace.desktops[i]);
            }
        }

        if (shouldCloseLastDesktop()) {
            deleteDesktop(workspace.desktops[workspace.desktops.length - 1]);
        } else if (!isDesktopEmpty(workspace.desktops[workspace.desktops.length - 1])){
            workspace.createDesktop(workspace.desktops.length, '')
        }
    } else {
        for (var i = 0 ; i < workspace.desktops.length ; i++ ) {
            if (isDesktopEmpty(workspace.desktops[i]) && mayCloseDesktop(workspace.desktops[i])){
                deleteDesktop(workspace.desktops[i]);
            }   
        }
    }
    renameDesktops();
    busy = false;
}

function update() {
    var timer = new QTimer();
    timer.interval = 100;
    timer.singleShot = true;
    timer.timeout.connect(balanceDesktops);
    timer.start();
}

function connectSignals() {
    workspace.windowAdded.connect(window => {
        // Check if the window is normal.
        if (window !== null && window.normalWindow){
            update();
        }
    });
    workspace.windowRemoved.connect(window => {
        // Check if the window is normal.
        if (window !== null && window.normalWindow){
            update();
        }
    });
    workspace.desktopsChanged.connect(update);
    workspace.currentDesktopChanged.connect(update);
}

function main() {
    connectSignals();
    update();
}

main();

