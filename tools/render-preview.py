#!/usr/bin/env python3
"""Render the real dashboard QML offscreen with demo data into preview.png.

Uses the installed Omarchy shell's UI components and your current theme. It
never talks to NanoClaw, Docker, or your desktop: the panel's data process and
timers are switched off in a throwaway copy and a fixed snapshot is injected.
"""
import atexit, json, os, shutil, subprocess, tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SHELL = Path(os.environ.get("OMARCHY_PATH", "/usr/share/omarchy")) / "shell"
OUT = ROOT / "preview.png"
work = Path(tempfile.mkdtemp(prefix="nanoclaw-preview-"))
atexit.register(shutil.rmtree, work, ignore_errors=True)
for name in ["Ui", "Commons", "services"]:
    shutil.copytree(SHELL / name, work / name)
shutil.copytree(ROOT, work / "Plugin", ignore=shutil.ignore_patterns(".git", "state", "tests", "tools", "*.png"))
shutil.copy2(ROOT / "assets" / "NanoClawIcons.ttf", work / "Plugin" / "assets" / "NanoClawIcons.ttf")

# The popup becomes a plain offscreen window that saves itself and quits.
(work / "Ui" / "KeyboardPanel.qml").write_text("""
import QtQuick
import Quickshell
import qs.Commons
FloatingWindow {
 id: root
 property var anchorItem
 property var owner
 property var bar
 property bool open: false
 property var focusTarget
 property int contentWidth: 400
 property int contentHeight: 600
 default property alias contents: body.data
 function fittedContentWidth(w) { return w }
 function fittedContentHeight(h, cap) { return Math.min(h, cap) }
 implicitWidth: contentWidth + 48
 implicitHeight: contentHeight + 48
 visible: open
 color: Color.background
 Rectangle {
   id: frame
   width: root.contentWidth + 48
   height: root.contentHeight + 48
   color: Color.background
   border.color: Color.foreground
   border.width: 2
   Item { id: body; anchors.fill: parent; anchors.margins: 24 }
 }
 Timer {
   interval: 1500; running: root.open; repeat: false
   onTriggered: frame.grabToImage(function(result) {
     if (!result.saveToFile("OUTPUT")) Qt.exit(1); else Qt.quit()
   }, Qt.size(frame.width * 2, frame.height * 2))
 }
}
""".replace("OUTPUT", str(OUT)))

panel = work / "Plugin" / "ui" / "Panel.qml"
s = panel.read_text()
for old, new in [
    ('    running: true\n    repeat: true\n    triggeredOnStart: true\n    onTriggered: root.refresh()',
     '    running: false\n    repeat: false\n    onTriggered: {}'),
    ('  onOpenedChanged: if (opened) refresh()', '  onOpenedChanged: {}'),
    ('ipcTarget: "rohirik.nanoclaw"', 'ipcTarget: "rohirik.nanoclaw.preview"'),
]:
    assert s.count(old) == 1, old
    s = s.replace(old, new)
panel.write_text(s)

snap = {
    "installed": True, "checkout": "~/nanoclaw", "service": "active", "unit": "nanoclaw-v2-1a2b3c4d",
    "setupComplete": True, "image": True, "docker": True, "menu": True,
    "agents": [
        {"id": "a1", "name": "Family Assistant", "folder": "family-assistant", "provider": "claude",
         "sessions": 4, "activeSessions": 2, "running": 1, "disposable": False,
         "channels": ["telegram/Family", "cli/Local CLI"]},
        {"id": "a2", "name": "Code Architect", "folder": "code-architect", "provider": "codex",
         "sessions": 2, "activeSessions": 1, "running": 1, "disposable": False,
         "channels": ["telegram/Dev"]},
        {"id": "a3", "name": "Disposable 20260927-1412", "folder": "tmp-20260927-141203", "provider": "claude",
         "sessions": 1, "activeSessions": 1, "running": 1, "disposable": True, "channels": []},
    ],
    "containers": [
        {"name": "ncl-1a2b3c4d-sess-1", "folder": "family-assistant", "status": "Up 12 minutes"},
        {"name": "ncl-1a2b3c4d-sess-2", "folder": "code-architect", "status": "Up 3 minutes"},
        {"name": "ncl-1a2b3c4d-sess-3", "folder": "tmp-20260927-141203", "status": "Up 40 seconds"},
    ],
    "approvals": [{"id": "p1", "title": "Install ffmpeg in the container", "agent": "Family Assistant"}],
    "channels": ["cli/Local CLI", "telegram/Dev", "telegram/Family"],
    "counts": {"agents": 3, "running": 3, "sessions": 7, "approvals": 1, "channels": 3},
}

(work / "shell.qml").write_text("""
import QtQuick
import Quickshell
import qs.Commons
import "Plugin/ui" as Plugin
ShellRoot {
 QtObject {
  id: fakeBar
  property color foreground: Color.foreground
  property color barForeground: Color.foreground
  property color background: Color.background
  property color urgent: Color.urgent
  property string fontFamily: Style.font.family
  property bool vertical: false
  property int barSize: 32
  property string position: "top"
  property bool foregroundAnimationEnabled: false
  function hideTooltip() {}
  function showTooltip() {}
  function registerClickTarget() {}
  function unregisterClickTarget() {}
  function run(cmd) {}
 }
 Plugin.Panel { id: plugin; bar: fakeBar }
 Timer {
  interval: 200; running: true; repeat: false
  onTriggered: { plugin.snap = SNAP; plugin.loaded = true; plugin.open() }
 }
}
""".replace("SNAP", json.dumps(snap)))

runtime = work / "runtime"
runtime.mkdir(mode=0o700)
env = dict(os.environ, QT_QPA_PLATFORM="offscreen", QT_QPA_PLATFORMTHEME="basic",
           QT_QUICK_BACKEND="software", QT_SCALE_FACTOR="1", XDG_RUNTIME_DIR=str(runtime))
env.pop("DISPLAY", None)
env.pop("WAYLAND_DISPLAY", None)
OUT.unlink(missing_ok=True)
result = subprocess.run(["quickshell", "-p", str(work), "--no-color"], env=env,
                        capture_output=True, text=True, timeout=30)
if result.returncode or not OUT.exists():
    raise SystemExit(result.stdout + result.stderr)
print(OUT)
