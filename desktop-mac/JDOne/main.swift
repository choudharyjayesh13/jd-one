// JD — desktop app for JD Group. One app, two doors:
//   Staff    → JD One (internal app)
//   Customer → JD One customer portal (wallet, investments, bookings)
// Each door runs in its own web view with its own cookie/storage jar, so a
// staff login and a customer login never mix. Built with AppKit + WebKit only
// (no third-party dependencies) so it compiles with `swiftc` on any Mac.
import AppKit
import WebKit
import CoreLocation

let STAFF_URL = URL(string: "https://choudharyjayesh13.github.io/jd-one/")!
let CUSTOMER_URL = URL(string: "https://choudharyjayesh13.github.io/jd-one/portal/")!

final class Door: NSObject, WKUIDelegate, WKNavigationDelegate {
    let name: String
    let url: URL
    let webView: WKWebView
    init(name: String, url: URL, storeID: UUID) {
        self.name = name
        self.url = url
        let config = WKWebViewConfiguration()
        // Separate persistent storage per door (macOS 14+); falls back to a private jar.
        if #available(macOS 14.0, *) {
            config.websiteDataStore = WKWebsiteDataStore(forIdentifier: storeID)
        } else {
            config.websiteDataStore = .nonPersistent()
        }
        config.preferences.javaScriptCanOpenWindowsAutomatically = true
        config.applicationNameForUserAgent = "JDOneDesktop/1.0"
        webView = WKWebView(frame: .zero, configuration: config)
        webView.allowsBackForwardNavigationGestures = true
        super.init()
        webView.uiDelegate = self
        webView.navigationDelegate = self
        webView.load(URLRequest(url: url))
    }
    // Camera (attendance selfie) and geolocation prompts inside the web view.
    @available(macOS 12.0, *)
    func webView(_ webView: WKWebView, requestMediaCapturePermissionFor origin: WKSecurityOrigin, initiatedByFrame frame: WKFrameInfo, type: WKMediaCaptureType, decisionHandler: @escaping (WKPermissionDecision) -> Void) {
        decisionHandler(.grant)
    }
    // Open external links (maps, WhatsApp, website) in the default browser.
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        if let u = navigationAction.request.url, navigationAction.targetFrame == nil || (u.host != url.host && !(u.host ?? "").contains("supabase")) {
            if u.host != url.host { NSWorkspace.shared.open(u); decisionHandler(.cancel); return }
        }
        decisionHandler(.allow)
    }
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let u = navigationAction.request.url { NSWorkspace.shared.open(u) }
        return nil
    }
    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        let a = NSAlert(); a.messageText = name; a.informativeText = message; a.runModal(); completionHandler()
    }
    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        let a = NSAlert(); a.messageText = name; a.informativeText = message; a.addButton(withTitle: "OK"); a.addButton(withTitle: "Cancel")
        completionHandler(a.runModal() == .alertFirstButtonReturn)
    }
}

final class AppDelegate: NSObject, NSApplicationDelegate, NSToolbarDelegate {
    var window: NSWindow!
    var doors: [Door] = []
    var current = 0
    let locationManager = CLLocationManager()

    func applicationDidFinishLaunching(_ notification: Notification) {
        // Ask macOS for location once so the web geolocation prompt can succeed.
        locationManager.requestWhenInUseAuthorization()
        doors = [
            Door(name: "Staff", url: STAFF_URL, storeID: UUID(uuidString: "5A1F0000-0000-4000-8000-00000000A001")!),
            Door(name: "Customer", url: CUSTOMER_URL, storeID: UUID(uuidString: "5A1F0000-0000-4000-8000-00000000C002")!),
        ]
        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1180, height: 780), styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false)
        window.title = "JD"
        window.minSize = NSSize(width: 420, height: 600)
        window.center()
        window.setFrameAutosaveName("JDMain")
        let tb = NSToolbar(identifier: "main"); tb.delegate = self; tb.displayMode = .iconAndLabel
        window.toolbar = tb
        window.titlebarAppearsTransparent = false
        show(door: UserDefaults.standard.integer(forKey: "lastDoor"))
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        buildMenu()
    }

    func show(door i: Int) {
        current = max(0, min(i, doors.count - 1))
        UserDefaults.standard.set(current, forKey: "lastDoor")
        let wv = doors[current].webView
        window.contentView = wv
        window.title = "JD · \(doors[current].name)"
        (window.toolbar?.items.first { $0.itemIdentifier.rawValue == "switch" }?.view as? NSSegmentedControl)?.selectedSegment = current
    }

    // Toolbar: [Staff | Customer] switcher, reload, open in browser.
    func toolbarDefaultItemIdentifiers(_ toolbar: NSToolbar) -> [NSToolbarItem.Identifier] { [.init("switch"), .flexibleSpace, .init("reload"), .init("browser")] }
    func toolbarAllowedItemIdentifiers(_ toolbar: NSToolbar) -> [NSToolbarItem.Identifier] { toolbarDefaultItemIdentifiers(toolbar) }
    func toolbar(_ toolbar: NSToolbar, itemForItemIdentifier id: NSToolbarItem.Identifier, willBeInsertedIntoToolbar flag: Bool) -> NSToolbarItem? {
        let item = NSToolbarItem(itemIdentifier: id)
        switch id.rawValue {
        case "switch":
            let seg = NSSegmentedControl(labels: ["Staff", "Customer"], trackingMode: .selectOne, target: self, action: #selector(switched(_:)))
            seg.selectedSegment = current
            seg.segmentStyle = .texturedRounded
            item.view = seg; item.label = "Login"
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
    @objc func reload() { doors[current].webView.reload() }
    @objc func openInBrowser() { NSWorkspace.shared.open(doors[current].webView.url ?? doors[current].url) }
    @objc func goHome() { doors[current].webView.load(URLRequest(url: doors[current].url)) }
    @objc func signOutAll() {
        for d in doors {
            d.webView.configuration.websiteDataStore.removeData(ofTypes: WKWebsiteDataStore.allWebsiteDataTypes(), modifiedSince: .distantPast) { d.webView.load(URLRequest(url: d.url)) }
        }
    }

    func buildMenu() {
        let main = NSMenu()
        let app = NSMenuItem(); main.addItem(app)
        let appMenu = NSMenu()
        appMenu.addItem(withTitle: "About JD", action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)), keyEquivalent: "")
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle: "Sign out of both", action: #selector(signOutAll), keyEquivalent: "")
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle: "Hide JD", action: #selector(NSApplication.hide(_:)), keyEquivalent: "h")
        appMenu.addItem(withTitle: "Quit JD", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        app.submenu = appMenu
        let view = NSMenuItem(); main.addItem(view)
        let viewMenu = NSMenu(title: "View")
        viewMenu.addItem(withTitle: "Staff login", action: #selector(showStaff), keyEquivalent: "1")
        viewMenu.addItem(withTitle: "Customer login", action: #selector(showCustomer), keyEquivalent: "2")
        viewMenu.addItem(.separator())
        viewMenu.addItem(withTitle: "Home", action: #selector(goHome), keyEquivalent: "h").keyEquivalentModifierMask = [.command, .shift]
        viewMenu.addItem(withTitle: "Reload", action: #selector(reload), keyEquivalent: "r")
        viewMenu.addItem(withTitle: "Open in Browser", action: #selector(openInBrowser), keyEquivalent: "o")
        view.submenu = viewMenu
        let edit = NSMenuItem(); main.addItem(edit)
        let editMenu = NSMenu(title: "Edit")
        editMenu.addItem(withTitle: "Undo", action: Selector(("undo:")), keyEquivalent: "z")
        editMenu.addItem(withTitle: "Cut", action: #selector(NSText.cut(_:)), keyEquivalent: "x")
        editMenu.addItem(withTitle: "Copy", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
        editMenu.addItem(withTitle: "Paste", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
        editMenu.addItem(withTitle: "Select All", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")
        edit.submenu = editMenu
        NSApp.mainMenu = main
    }
    @objc func showStaff() { show(door: 0) }
    @objc func showCustomer() { show(door: 1) }
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.regular)
app.run()
