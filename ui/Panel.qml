import QtQuick
import QtQuick.Controls
import Quickshell
import Quickshell.Io
import qs.Commons
import qs.Ui

// NanoClaw bar button and dashboard.
//
// The bar shows the NanoClaw mark, highlighted while approvals wait on you.
// The popup lists service state, agents, running agent containers (the
// sub-agents NanoClaw spawns per session), pending approvals and channels,
// with actions that open NanoClaw's own tools in a terminal. Data comes from
// bin/nanoclaw-dash, which reads NanoClaw's database read-only.
//
// Left click: dashboard. Right click: chat with your main agent.
// Middle click: disposable agent.

Panel {
  id: root
  moduleName: "rohirik.nanoclaw"
  ipcTarget: "rohirik.nanoclaw"
  manageIpc: false

  readonly property color foreground: bar ? bar.foreground : Color.foreground
  readonly property color urgent: bar ? bar.urgent : Color.urgent
  readonly property color accent: Color.accent
  readonly property color dim: Qt.darker(foreground, 1.55)
  readonly property string fontFamily: bar ? bar.fontFamily : Style.font.family

  readonly property string binDir: decodeURIComponent(Qt.resolvedUrl("../bin").toString().replace("file://", ""))
  readonly property string term: "omarchy-launch-floating-terminal-with-presentation "

  implicitWidth: button.implicitWidth
  implicitHeight: button.implicitHeight

  // The NanoClaw mark ships with the plugin; no system font install needed.
  FontLoader { id: glyphFont; source: Qt.resolvedUrl("../assets/NanoClawIcons.ttf") }

  property var snap: ({})
  property bool loaded: false
  readonly property var agents: snap.agents || []
  readonly property var containers: snap.containers || []
  readonly property var approvals: snap.approvals || []
  readonly property var channels: snap.channels || []
  readonly property bool running: snap.service === "active"
  readonly property bool serviceInstalled: !!snap.service && snap.service !== "not-installed"
  readonly property bool attention: approvals.length > 0 || (loaded && snap.installed && !snap.setupComplete)

  function statusLine() {
    if (!loaded) return "Loading…"
    if (!snap.installed) return "Not installed"
    if (!snap.setupComplete) return "Setup not finished"
    if (snap.service === "not-installed") return "Service not installed"
    return running ? "Running · " + containers.length + " container" + (containers.length === 1 ? "" : "s")
                   : "Service " + snap.service
  }

  function refresh() { if (!dashProc.running) dashProc.running = true }
  function inTerminal(cmd) { if (bar) bar.run(term + binDir + "/" + cmd); root.close() }
  function ctl(args) { inTerminal("nanoclaw-ctl " + args) }
  function menu(route) { if (bar) bar.run("omarchy-menu summon " + route); root.close() }

  IpcHandler {
    target: root.ipcTarget
    function open(): void { root.open() }
    function close(): void { root.close() }
    function toggle(): void { root.toggle() }
    function refresh(): string { root.refresh(); return "ok" }
  }

  Process {
    id: dashProc
    command: {
      var c = root.setting("checkoutPath", "")
      return c ? [root.binDir + "/nanoclaw-dash", "--checkout", c] : [root.binDir + "/nanoclaw-dash"]
    }
    stdout: StdioCollector {
      waitForEnd: true
      onStreamFinished: {
        try { root.snap = JSON.parse(text); root.loaded = true } catch (e) {}
      }
    }
  }

  // Slow in the background (approval highlight on the bar), fast while open.
  Timer {
    interval: root.opened ? 5000 : Math.max(15, root.setting("refreshIntervalSec", 60)) * 1000
    running: true
    repeat: true
    triggeredOnStart: true
    onTriggered: root.refresh()
  }
  onOpenedChanged: if (opened) refresh()

  BarIconButton {
    id: button
    anchors.fill: parent
    bar: root.bar
    text: ""
    fontFamily: glyphFont.name
    active: root.attention
    tooltipText: "NanoClaw · " + root.statusLine()
    onPressed: function(code) {
      if (code === Qt.RightButton) root.inTerminal("nanoclaw-agent")
      else if (code === Qt.MiddleButton) root.ctl("disposable")
      else root.toggle()
    }

    // Service dot: green running, dim stopped, urgent when something needs you.
    Rectangle {
      visible: root.loaded && root.snap.installed
      width: Style.space(5); height: width; radius: width / 2
      anchors.right: parent.right
      anchors.bottom: parent.bottom
      anchors.margins: Style.space(3)
      color: root.attention ? root.urgent : (root.running ? "#50c878" : root.dim)
    }
  }

  component Action: Button {
    fontSize: Style.font.caption
    verticalPadding: Style.space(4)
    horizontalPadding: Style.space(8)
    bordered: true
    foreground: root.foreground
    fontFamily: root.fontFamily
    opacity: enabled ? 1 : 0.35
  }

  component Caption: Text {
    width: parent ? parent.width : implicitWidth
    color: root.dim
    font.family: root.fontFamily
    font.pixelSize: Style.font.caption
    elide: Text.ElideRight
    textFormat: Text.PlainText
  }

  KeyboardPanel {
    id: panel
    anchorItem: button
    owner: root
    bar: root.bar
    open: root.opened
    focusTarget: keyCatcher
    contentWidth: panel.fittedContentWidth(Style.space(400))
    contentHeight: panel.fittedContentHeight(column.implicitHeight, Style.space(640))

    PanelKeyCatcher {
      id: keyCatcher
      anchors.fill: parent
      onCloseRequested: root.close()
      onTabRequested: function(direction) { root.switchPanel(direction) }
      onMoveRequested: function(dx, dy) {
        if (dy !== 0) flick.contentY = Math.max(0, Math.min(flick.contentHeight - flick.height,
                                                            flick.contentY + dy * Style.space(56)))
      }
      onTextKey: function(t) {
        if (t === "r") root.refresh()
        else if (t === "c") root.inTerminal("nanoclaw-agent")
        else if (t === "d") root.ctl("disposable")
      }

      Flickable {
        id: flick
        anchors.fill: parent
        contentWidth: width
        contentHeight: column.implicitHeight
        clip: true
        boundsBehavior: Flickable.StopAtBounds
        interactive: contentHeight > height
        ScrollBar.vertical: ScrollBar { policy: ScrollBar.AsNeeded }

        Column {
          id: column
          width: flick.width
          spacing: Style.space(10)

          // ---------- Header ----------
          Row {
            width: parent.width
            spacing: Style.space(12)
            Text {
              text: ""
              font.family: glyphFont.name
              font.pixelSize: Style.font.display
              color: root.foreground
            }
            Column {
              anchors.verticalCenter: parent.verticalCenter
              Text {
                text: "NanoClaw"
                color: root.foreground
                font.family: root.fontFamily
                font.pixelSize: Style.font.body
                font.bold: true
              }
              Text {
                text: root.statusLine()
                color: root.attention ? root.urgent : root.dim
                font.family: root.fontFamily
                font.pixelSize: Style.font.caption
              }
            }
          }

          // ---------- Setup banner ----------
          Column {
            visible: root.loaded && !root.snap.setupComplete
            width: parent.width
            spacing: Style.space(6)
            Caption {
              text: !root.snap.installed ? "NanoClaw isn't installed yet."
                  : "Setup stopped before it finished. Resume it to create your agent."
              color: root.urgent
              wrapMode: Text.WordWrap
              elide: Text.ElideNone
            }
            Action { text: root.snap.installed ? "Resume setup" : "Install NanoClaw"; onClicked: root.ctl("setup") }
          }

          // ---------- Quick actions ----------
          Flow {
            width: parent.width
            spacing: Style.space(6)
            Action { text: "Chat"; tooltipText: "c"; enabled: root.snap.setupComplete === true; onClicked: root.inTerminal("nanoclaw-agent") }
            Action { text: "Disposable"; tooltipText: "d · deleted when you exit"; enabled: root.running; onClicked: root.ctl("disposable") }
            Action { text: "New agent"; onClicked: root.snap.menu ? root.menu("nanoclaw.templates") : root.ctl("template-create") }
            Action { text: "Add channel"; onClicked: root.snap.menu ? root.menu("nanoclaw.channels") : root.ctl("channel") }
            Action { text: "More…"; visible: root.snap.menu === true; onClicked: root.menu("nanoclaw") }
          }

          PanelSeparator { width: parent.width; foreground: root.foreground }

          // ---------- Agents ----------
          PanelSectionHeader {
            text: "AGENTS · " + root.agents.length
            foreground: root.foreground
            fontFamily: root.fontFamily
          }
          Caption { visible: root.agents.length === 0; text: "No agents yet." }
          Repeater {
            model: root.agents
            delegate: Item {
              required property var modelData
              width: column.width
              height: agentCol.implicitHeight
              Column {
                id: agentCol
                anchors.left: parent.left
                anchors.right: agentActions.left
                anchors.rightMargin: Style.space(8)
                Text {
                  width: parent.width
                  text: (modelData.running > 0 ? "● " : "○ ") + modelData.name
                        + (modelData.disposable ? "  (disposable)" : "")
                  color: modelData.running > 0 ? root.foreground : root.dim
                  font.family: root.fontFamily
                  font.pixelSize: Style.font.body
                  elide: Text.ElideRight
                  textFormat: Text.PlainText
                }
                Caption {
                  text: modelData.provider + " · " + modelData.activeSessions + "/" + modelData.sessions
                        + " sessions · " + modelData.running + " running"
                        + (modelData.channels.length ? " · " + modelData.channels.join(", ") : "")
                }
              }
              Row {
                id: agentActions
                anchors.right: parent.right
                anchors.verticalCenter: parent.verticalCenter
                spacing: Style.space(4)
                PanelActionButton {
                  iconText: "󰑓"; tooltipText: "Restart"
                  foreground: root.foreground; fontFamily: root.fontFamily
                  onClicked: root.ctl("agent-restart " + modelData.folder)
                }
                PanelActionButton {
                  iconText: "󰆴"; tooltipText: "Delete"
                  foreground: root.foreground; fontFamily: root.fontFamily
                  onClicked: root.ctl("agent-delete " + modelData.folder)
                }
              }
            }
          }

          // ---------- Running containers (sub-agents) ----------
          PanelSectionHeader {
            visible: root.containers.length > 0
            text: "RUNNING CONTAINERS · " + root.containers.length
            foreground: root.foreground
            fontFamily: root.fontFamily
          }
          Repeater {
            model: root.containers
            delegate: Caption {
              required property var modelData
              width: column.width
              text: "▸ " + (modelData.folder || modelData.name) + " · " + modelData.status
            }
          }

          // ---------- Approvals ----------
          PanelSectionHeader {
            visible: root.approvals.length > 0
            text: "WAITING ON YOU · " + root.approvals.length
            foreground: root.urgent
            fontFamily: root.fontFamily
          }
          Repeater {
            model: root.approvals
            delegate: Caption {
              required property var modelData
              width: column.width
              color: root.foreground
              text: "! " + modelData.title + (modelData.agent ? "  — " + modelData.agent : "")
            }
          }
          Action { visible: root.approvals.length > 0; text: "Review approvals"; onClicked: root.ctl("approvals") }

          // ---------- Channels ----------
          PanelSectionHeader {
            text: "CHANNELS · " + root.channels.length
            foreground: root.foreground
            fontFamily: root.fontFamily
          }
          Caption { text: root.channels.length ? root.channels.join("  ·  ") : "Terminal only. Add a channel to message your agents from your phone." ; wrapMode: Text.WordWrap; elide: Text.ElideNone }

          PanelSeparator { width: parent.width; foreground: root.foreground }

          // ---------- Service ----------
          PanelSectionHeader {
            text: "SERVICE"
            foreground: root.foreground
            fontFamily: root.fontFamily
          }
          Flow {
            width: parent.width
            spacing: Style.space(6)
            Action { text: root.running ? "Stop" : "Start"; enabled: root.serviceInstalled; onClicked: root.ctl("service " + (root.running ? "stop" : "start")) }
            Action { text: "Restart"; enabled: root.running; onClicked: root.ctl("service restart") }
            Action { text: "Logs"; enabled: root.serviceInstalled; onClicked: root.ctl("service logs") }
            Action { text: "Tasks"; enabled: root.running; onClicked: root.ctl("tasks") }
            Action { text: "Health"; onClicked: root.inTerminal("nanoclaw-menu --preflight") }
            Action { text: "Clean up"; tooltipText: "Shows what it found and asks first"; onClicked: root.ctl("clean") }
          }
          Caption { text: root.snap.checkout ? root.snap.checkout + " · " + (root.snap.unit || "") : "" }
        }
      }
    }
  }
}
