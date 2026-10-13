// JD One — desktop super app for JD Group. One window, one door per platform:
//   Home         → launcher with a tile for every platform
//   JD One       → staff app (attendance, rooms, sales, network…)
//   Udaisarovar  → The Udaisarovar resort (rooms, activities, booking)
//   Pronite      → Pronite events (tickets, membership)
//   My account   → JD customer account (wallet, investments, bookings)
// The same person gets each platform's own interface, and every door keeps its
// own cookie/storage jar, so a staff login, a resort guest login and a Pronite
// login never mix. AppKit + WebKit only, so it compiles with `swiftc` on any Mac.
import AppKit
import WebKit
import CoreLocation

struct Platform {
    let name: String
    let tagline: String
    let url: URL
    /// Domains that stay inside the app; any other link opens in the browser.
    let hosts: [String]
    let storeID: String
    let colour: String
    let initials: String
}

// Change a platform's address here, then run ./build.sh again.
// Store IDs A001 / C002 are the ones the older JD.app used, so existing sign-ins carry over.
let PLATFORMS: [Platform] = [
    Platform(name: "JD One", tagline: "Staff app · attendance, rooms, sales, network", url: URL(string: "https://app.myjdgroup.com/")!,
             hosts: ["app.myjdgroup.com"], storeID: "5A1F0000-0000-4000-8000-00000000A001", colour: "#E8711A", initials: "JD"),
    Platform(name: "Udaisarovar", tagline: "The Udaisarovar resort · stay, activities, day trips", url: URL(string: "https://www.theudaisarovar.com/")!,
             hosts: ["theudaisarovar.com"], storeID: "5A1F0000-0000-4000-8000-00000000B003", colour: "#2F6B4F", initials: "US"),
    Platform(name: "Pronite", tagline: "Events · tickets, membership, partners", url: URL(string: "https://pronite.in/")!,
             hosts: ["pronite.in"], storeID: "5A1F0000-0000-4000-8000-00000000D004", colour: "#7B2FF7", initials: "PN"),
    Platform(name: "My account", tagline: "JD customer account · wallet, investments, bookings", url: URL(string: "https://app.myjdgroup.com/portal/")!,
             hosts: ["app.myjdgroup.com"], storeID: "5A1F0000-0000-4000-8000-00000000C002", colour: "#1F3A5F", initials: "ME"),
]
/// Sign-in and payment pages that must open inside the door that asked for them.
let SHARED_HOSTS = ["supabase.co", "accounts.google.com", "razorpay.com"]

func hostMatches(_ host: String?, _ list: [String]) -> Bool {
    guard let h = host?.lowercased() else { return false }
    return list.contains { h == $0 || h.hasSuffix("." + $0) }
}

/// The Home launcher, drawn locally so it opens instantly even when offline.
func homeHTML() -> String {
    let tiles = PLATFORMS.enumerated().map { i, p in
        """
        <a class="tile" href="jdone://open/\(i + 1)" style="--c:\(p.colour)">
          <span class="badge">\(p.initials)</span>
          <span class="txt"><b>\(p.name)</b><small>\(p.tagline)</small></span>
          <kbd>⌘\(i + 2)</kbd>
        </a>
        """
    }.joined()
    return #"""
    <!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <style>
    :root{--bg:#f7f4ef;--card:#fff;--ink:#1d2433;--mute:#667085;--line:#e7e1d8}
    @media (prefers-color-scheme:dark){:root{--bg:#14161b;--card:#1d2027;--ink:#eef0f4;--mute:#9aa3b2;--line:#2b2f38}}
    *{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px -apple-system,BlinkMacSystemFont,"SF Pro Text",sans-serif}
    main{max-width:760px;margin:0 auto;padding:48px 24px}
    h1{font-size:30px;margin:0 0 4px;letter-spacing:-.02em}p.sub{color:var(--mute);margin:0 0 28px}
    .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:14px}
    .tile{display:flex;align-items:center;gap:14px;padding:18px;border-radius:16px;background:var(--card);border:1px solid var(--line);
      color:inherit;text-decoration:none;border-left:6px solid var(--c);transition:transform .12s,box-shadow .12s}
    .tile:hover{transform:translateY(-2px);box-shadow:0 8px 24px rgba(0,0,0,.08)}
    .badge{flex:none;width:48px;height:48px;border-radius:50%;background:var(--c);color:#fff;display:grid;place-items:center;font-weight:700;letter-spacing:.03em}
    .txt{flex:1;display:flex;flex-direction:column;gap:3px}.txt small{color:var(--mute);font-size:13px}
    kbd{color:var(--mute);font:12px ui-monospace,monospace;border:1px solid var(--line);border-radius:6px;padding:2px 6px}
    .note{margin-top:28px;color:var(--mute);font-size:13px;line-height:1.5}
    </style></head><body><main>
    <h1>JD One</h1><p class="sub">Every JD Group platform in one app. Pick where you want to go.</p>
    <div class="grid">
    """# + tiles + #"""
    </div>
    <p class="note">Each platform opens in its own style and remembers its own sign-in, so one person can be a guest at
    Udaisarovar, a member on Pronite and staff in JD One at the same time without the logins mixing.
    Links to other websites, phone numbers and WhatsApp open outside the app.</p>
    </main></body></html>
    """#
}

final class Door: NSObject, WKUIDelegate, WKNavigationDelegate {
    let name: String
    let platform: Platform?
    let webView: WKWebView
    private var loaded = false
    var onOpenDoor: ((Int) -> Void)?

    init(platform: Platform?) {
        self.platform = platform
        self.name = platform?.name ?? "Home"
        let config = WKWebViewConfiguration()
        if let p = platform, #available(macOS 14.0, *) {
            // Separate persistent storage per platform, so sign-ins never mix.
            config.websiteDataStore = WKWebsiteDataStore(forIdentifier: UUID(uuidString: p.storeID)!)
        } else {
            config.websiteDataStore = .nonPersistent()
        }
        config.preferences.javaScriptCanOpenWindowsAutomatically = true
        config.applicationNameForUserAgent = "Version/17.0 Safari/605.1.15 JDOneDesktop/2.0"
        webView = WKWebView(frame: .zero, configuration: config)
        webView.allowsBackForwardNavigationGestures = true
        super.init()
        webView.uiDelegate = self
        webView.navigationDelegate = self
    }

    /// Load the first time the door is opened, so unused platforms cost nothing.
    func loadIfNeeded() {
        guard !loaded else { return }
        loaded = true
        goHome()
    }
    func goHome() {
        if let p = platform { webView.load(URLRequest(url: p.url)) } else { webView.loadHTMLString(homeHTML(), baseURL: nil) }
    }

    private func staysInside(_ u: URL) -> Bool {
        guard let p = platform else { return false }
        return hostMatches(u.host, p.hosts + SHARED_HOSTS)
    }

    // Camera (attendance selfie, ticket scan) inside the web view.
    @available(macOS 12.0, *)
    func webView(_ webView: WKWebView, requestMediaCapturePermissionFor origin: WKSecurityOrigin, initiatedByFrame frame: WKFrameInfo, type: WKMediaCaptureType, decisionHandler: @escaping (WKPermissionDecision) -> Void) {
        decisionHandler(.grant)
    }
    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let u = action.request.url, let scheme = u.scheme?.lowercased() else { return decisionHandler(.allow) }
        if scheme == "jdone" {                       // tile on the Home launcher
            if let i = Int(u.lastPathComponent) { onOpenDoor?(i) }
            return decisionHandler(.cancel)
        }
        if scheme == "about" || scheme == "blob" || scheme == "data" { return decisionHandler(.allow) }
        if scheme != "http" && scheme != "https" {   // tel:, mailto:, whatsapp:, upi:
            NSWorkspace.shared.open(u); return decisionHandler(.cancel)
        }
        // Embedded frames (maps, videos, payment widgets) load as the site intends.
        if let f = action.targetFrame, !f.isMainFrame { return decisionHandler(.allow) }
        if staysInside(u) { return decisionHandler(.allow) }
        NSWorkspace.shared.open(u)
        decisionHandler(.cancel)
    }
    // target=_blank: same platform → this door; anything else → the browser.
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let u = action.request.url {
            if staysInside(u) { webView.load(URLRequest(url: u)) } else { NSWorkspace.shared.open(u) }
        }
        return nil
    }
    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        let a = NSAlert(); a.messageText = name; a.informativeText = message; a.runModal(); completionHandler()
    }
    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        let a = NSAlert(); a.messageText = name; a.informativeText = message; a.addButton(withTitle: "OK"); a.addButton(withTitle: "Cancel")
        completionHandler(a.runModal() == .alertFirstButtonReturn)
    }
    // File pickers (ticket photos, documents, KYC uploads).
    func webView(_ webView: WKWebView, runOpenPanelWith parameters: WKOpenPanelParameters, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping ([URL]?) -> Void) {
        let panel = NSOpenPanel()
        panel.allowsMultipleSelection = parameters.allowsMultipleSelection
        panel.canChooseDirectories = parameters.allowsDirectories
        panel.begin { completionHandler($0 == .OK ? panel.urls : nil) }
    }
    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { showOffline(error) }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { showOffline(error) }
    private func showOffline(_ error: Error) {
        let e = error as NSError
        guard e.code != NSURLErrorCancelled, e.code != 102 /* frame load interrupted */, let p = platform else { return }
        webView.loadHTMLString("""
        <body style="font:15px -apple-system,sans-serif;display:grid;place-items:center;height:90vh;color:#667085;text-align:center">
        <div><h2 style="color:\(p.colour)">\(p.name) couldn't load</h2><p>\(e.localizedDescription)</p>
        <p><a href="\(p.url.absoluteString)">Try again</a></p></div></body>
        """, baseURL: nil)
    }
}

final class AppDelegate: NSObject, NSApplicationDelegate, NSToolbarDelegate {
    var window: NSWindow!
    var doors: [Door] = []
    var current = 0
    let locationManager = CLLocationManager()
    var labels: [String] { ["Home"] + PLATFORMS.map(\.name) }

    func applicationDidFinishLaunching(_ notification: Notification) {
        // Ask macOS for location once so attendance and "Area help" can use it.
        locationManager.requestWhenInUseAuthorization()
        doors = [Door(platform: nil)] + PLATFORMS.map { Door(platform: $0) }
        for d in doors { d.onOpenDoor = { [weak self] i in self?.show(door: i) } }
        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1240, height: 820), styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false)
        window.minSize = NSSize(width: 420, height: 600)
        window.center()
        window.setFrameAutosaveName("JDOneMain")
        let tb = NSToolbar(identifier: "jdone-main"); tb.delegate = self; tb.displayMode = .iconOnly
        window.toolbar = tb
        if #available(macOS 11.0, *) { window.toolbarStyle = .unified }
        show(door: UserDefaults.standard.object(forKey: "lastPlatform") as? Int ?? 0)
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        buildMenu()
    }

    func show(door i: Int) {
        current = max(0, min(i, doors.count - 1))
        UserDefaults.standard.set(current, forKey: "lastPlatform")
        let d = doors[current]
        d.loadIfNeeded()
        window.contentView = d.webView
        window.title = current == 0 ? "JD One" : "JD One · \(d.name)"
        (window.toolbar?.items.first { $0.itemIdentifier.rawValue == "switch" }?.view as? NSSegmentedControl)?.selectedSegment = current
    }

    // Toolbar: back, [Home | JD One | Udaisarovar | Pronite | My account], reload, open in browser.
    func toolbarDefaultItemIdentifiers(_ toolbar: NSToolbar) -> [NSToolbarItem.Identifier] { [.init("back"), .flexibleSpace, .init("switch"), .flexibleSpace, .init("reload"), .init("browser")] }
    func toolbarAllowedItemIdentifiers(_ toolbar: NSToolbar) -> [NSToolbarItem.Identifier] { toolbarDefaultItemIdentifiers(toolbar) }
    func toolbar(_ toolbar: NSToolbar, itemForItemIdentifier id: NSToolbarItem.Identifier, willBeInsertedIntoToolbar flag: Bool) -> NSToolbarItem? {
        let item = NSToolbarItem(itemIdentifier: id)
        switch id.rawValue {
        case "switch":
            let seg = NSSegmentedControl(labels: labels, trackingMode: .selectOne, target: self, action: #selector(switched(_:)))
            seg.selectedSegment = current
            seg.segmentStyle = .texturedRounded
            item.view = seg; item.label = "Platform"
        case "back":
            item.image = NSImage(systemSymbolName: "chevron.backward", accessibilityDescription: "Back"); item.label = "Back"
            item.target = self; item.action = #selector(goBack)
        case "reload":
            item.image = NSImage(systemSymbolName: "arrow.clockwise", accessibilityDescription: "Reload"); item.label = "Reload"
            item.target = self; item.action = #selector(reload)
        case "browser":
            item.image = NSImage(systemSymbolName: "safari", accessibilityDescription: "Open in browser"); item.label = "Browser"
            item.target = self; item.action = #selector(openInBrowser)
        default: return nil
        }
        return item
    }
    @objc func switched(_ s: NSSegmentedControl) { show(door: s.selectedSegment) }
    @objc func goBack() { if doors[current].webView.canGoBack { doors[current].webView.goBack() } else { doors[current].goHome() } }
    @objc func reload() { doors[current].webView.reload() }
    @objc func openInBrowser() {
        guard let p = doors[current].platform else { return }
        if let u = doors[current].webView.url, u.scheme?.hasPrefix("http") == true { NSWorkspace.shared.open(u) } else { NSWorkspace.shared.open(p.url) }
    }
    @objc func goHome() { doors[current].goHome() }
    @objc func signOutAll() {
        for d in doors where d.platform != nil {
            d.webView.configuration.websiteDataStore.removeData(ofTypes: WKWebsiteDataStore.allWebsiteDataTypes(), modifiedSince: .distantPast) { d.goHome() }
        }
    }
    @objc func menuOpen(_ m: NSMenuItem) { show(door: m.tag) }

    func buildMenu() {
        let main = NSMenu()
        let app = NSMenuItem(); main.addItem(app)
        let appMenu = NSMenu()
        appMenu.addItem(withTitle: "About JD One", action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)), keyEquivalent: "")
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle: "Sign out everywhere", action: #selector(signOutAll), keyEquivalent: "")
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle: "Hide JD One", action: #selector(NSApplication.hide(_:)), keyEquivalent: "h")
        appMenu.addItem(withTitle: "Quit JD One", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        app.submenu = appMenu
        let edit = NSMenuItem(); main.addItem(edit)
        let editMenu = NSMenu(title: "Edit")
        editMenu.addItem(withTitle: "Undo", action: Selector(("undo:")), keyEquivalent: "z")
        editMenu.addItem(withTitle: "Redo", action: Selector(("redo:")), keyEquivalent: "Z")
        editMenu.addItem(.separator())
        editMenu.addItem(withTitle: "Cut", action: #selector(NSText.cut(_:)), keyEquivalent: "x")
        editMenu.addItem(withTitle: "Copy", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
        editMenu.addItem(withTitle: "Paste", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
        editMenu.addItem(withTitle: "Select All", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")
        edit.submenu = editMenu
        let go = NSMenuItem(); main.addItem(go)
        let goMenu = NSMenu(title: "Go")
        for (i, label) in labels.enumerated() {
            let m = goMenu.addItem(withTitle: label, action: #selector(menuOpen(_:)), keyEquivalent: "\(i + 1)")
            m.tag = i
        }
        goMenu.addItem(.separator())
        goMenu.addItem(withTitle: "Back", action: #selector(goBack), keyEquivalent: "[")
        goMenu.addItem(withTitle: "Platform start page", action: #selector(goHome), keyEquivalent: "H")
        goMenu.addItem(withTitle: "Reload", action: #selector(reload), keyEquivalent: "r")
        goMenu.addItem(withTitle: "Open in Browser", action: #selector(openInBrowser), keyEquivalent: "o")
        go.submenu = goMenu
        NSApp.mainMenu = main
    }
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.regular)
app.run()
