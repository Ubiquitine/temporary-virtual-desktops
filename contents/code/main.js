var busy = false;
var oneSpare = readConfig("oneSpare", false);

function isDesktopEmpty(desktop) {
    for (var i in workspace.windowList()) {
        var window = workspace.windowList()[i];
        if (window.desktops.includes(desktop) && !window.skipTaskbar) {
            return false;
        }
    }
    return true;
}

function renameDesktops() {
    for (var i = 1 ; i < workspace.desktops.length ; i++ ) {
        var d = workspace.desktops[i];
        var n = i + 1;
        d.name = 'Desktop ' + n ;
    }
}

function balanceDesktops() {
    if (busy) {
        return;
    }

    busy = true;

    if (oneSpare == true) {
        for (var i = 1 ; i < workspace.desktops.length - 1 ; i++ ) {
            if (isDesktopEmpty(workspace.desktops[i])){
                workspace.removeDesktop(workspace.desktops[i]);
            }
        }
        if (!isDesktopEmpty(workspace.desktops[workspace.desktops.length - 1])){
            workspace.createDesktop(workspace.desktops.length, '')
        }
    } else {
        for (var i = 1 ; i < workspace.desktops.length ; i++ ) {
            if (isDesktopEmpty(workspace.desktops[i])){
                workspace.removeDesktop(workspace.desktops[i]);
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
    workspace.windowAdded.connect(update);
    workspace.windowRemoved.connect(update);
    workspace.desktopsChanged.connect(update);
    workspace.currentDesktopChanged.connect(update);
}

function main() {
    connectSignals();
    update();
}

main();

