// GameViewController.swift — fullscreen WKWebView playing the web client.
//
// Interaction-critical bits for this game (user requirement: every interaction
// must work — select, drag, direction, deploy confirm, retreat, long-press
// details):
//  - preferredContentMode = .mobile: iPads would otherwise load the desktop
//    layout with a Mac UA, which breaks the game's touch targeting and its
//    mobile UI alignment (the reported misaligned icons / black screen).
//  - touch callout + text selection disabled: the game uses LONG PRESS for
//    "operator details"; the iOS copy-callout would swallow it.
//  - console/error capture → DebugLog, boot watchdog probe with a native
//    overlay offering a compatibility reload (?board=2d&render=fallback).

import UIKit
import WebKit

final class GameViewController: UIViewController {

    private let urlString: String
    private var host = "127.0.0.1"
    private var webView: WKWebView!
    private var overlay: UIView!
    private var overlayText: UILabel!
    private var probeAttempts = 0

    init(url: String) {
        self.urlString = url
        // P0: without this the navigation policy cancels the very first load of a
        // LAN host (192.168.x.x) and hands it to Safari — join mode was dead.
        self.host = URL(string: url)?.host ?? "127.0.0.1"
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) is not supported") }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black
        setNeedsStatusBarAppearanceUpdate()

        let config = WKWebViewConfiguration()
        let prefs = WKWebpagePreferences()
        prefs.allowsContentJavaScript = true
        // THE fix for iPad: force the mobile layout/UA so the game uses its
        // touch-first, rem-scaled phone/tablet CSS instead of the desktop one.
        prefs.preferredContentMode = .mobile
        config.defaultWebpagePreferences = prefs
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        config.userContentController.add(WeakScriptMessageHandler(self), name: "console")
        config.userContentController.addUserScript(WKUserScript(
            source: Self.bootstrapJS,
            injectionTime: .atDocumentStart,
            forMainFrameOnly: true))

        webView = WKWebView(frame: view.bounds, configuration: config)
        webView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        webView.scrollView.isScrollEnabled = false
        webView.scrollView.bounces = false
        webView.scrollView.keyboardDismissMode = .interactive
        webView.allowsLinkPreview = false
        webView.isOpaque = true
        webView.backgroundColor = UIColor(red: 0.043, green: 0.063, blue: 0.075, alpha: 1)
        webView.navigationDelegate = self
        view.addSubview(webView)

        buildOverlay()
        buildCloseButton()
        applyEdgePadding()

        webView.load(URLRequest(url: initialURL))
        // clamp the game's own HUD labels that overflow the viewport on ultrawide screens
        let clampJS = "(function(){function fix(){document.querySelectorAll('div,span,p').forEach(function(el){if(el.children.length===0&&/剩余可放置/.test(el.textContent||'')){var r=el.getBoundingClientRect();if(r.right>window.innerWidth-8){el.style.position='fixed';el.style.left='auto';el.style.right='8px';}}});}if(document.readyState!=='loading'){setTimeout(fix,900);}else{document.addEventListener('DOMContentLoaded',function(){setTimeout(fix,900);});}})()"
        config.userContentController.addUserScript(WKUserScript(
            source: clampJS,
            injectionTime: .atDocumentEnd,
            forMainFrameOnly: true))
        UIApplication.shared.isIdleTimerDisabled = true
        DebugLog.i("webview", "loading \(urlString)")
    }

    override var prefersStatusBarHidden: Bool { true }
    override var preferredStatusBarUpdateAnimation: UIStatusBarAnimation { .fade }

    // ---------------------------------------------------------------- setup

    /// Injected at document start on the stock client — no web file is modified.
    private static let bootstrapJS = """
    (function(){
      function send(level, text){ try{ window.webkit.messageHandlers.console.postMessage(level + '|' + text); }catch(e){} }
      ['log','info','warn','error'].forEach(function(kind){
        var original = console[kind];
        console[kind] = function(){
          var parts = []; for (var i = 0; i < arguments.length; i++) {
            var a = arguments[i];
            try { parts.push(typeof a === 'object' ? JSON.stringify(a) : String(a)); } catch(e) { parts.push(String(a)); }
          }
          send(kind, parts.join(' '));
          if (original) original.apply(console, arguments);
        };
      });
      window.addEventListener('error', function(e){
        send('error', 'uncaught: ' + (e.message || 'unknown') + ' @' + (e.filename || '') + ':' + (e.lineno || 0));
      });
      window.addEventListener('unhandledrejection', function(e){
        send('error', 'unhandledrejection: ' + String(e.reason));
      });
      function harden(){
        try {
          var style = document.createElement('style');
          // long press = operator details in the game; kill the iOS callout/select
          // UI — but inputs must keep text selection or the keyboard never focuses
          style.textContent = '*{-webkit-touch-callout:none!important;-webkit-user-select:none!important}' +
            'input,textarea,[contenteditable]{-webkit-user-select:text!important;-webkit-user-select:auto!important}';
          document.documentElement.appendChild(style);
        } catch(e) {}
      }
      if (document.documentElement) harden(); else document.addEventListener('DOMContentLoaded', harden);
    })();
    """

    /// Probe what the page can see about itself; runs against the STOCK client.
    private static let probeJS = "(function(){" +
        "var gl=function(t){try{var c=document.createElement('canvas');return !!(c.getContext&&c.getContext(t))}catch(e){return false}};" +
        "try{return JSON.stringify({booted:!!(globalThis.__SP__&&globalThis.__SP__.store)," +
        "canvases:document.querySelectorAll('canvas').length," +
        "root:(document.getElementById('app')||{}).childElementCount||0," +
        "webgl:gl('webgl'),webgl2:gl('webgl2'),dpr:window.devicePixelRatio||0," +
        "w:window.innerWidth||0,h:window.innerHeight||0," +
        "ua:navigator.userAgent.slice(0,120)})}catch(e){return JSON.stringify({err:String(e)})}})()"

    /// iPadOS 15's WebKit is old: default the board to the 2D renderer (an
    /// officially supported downgrade per the game's README) so the map always
    /// paints; the 3D board stays available through the game's own settings.
    private var initialURL: URL {
        let base = urlString
        let hasBoard = base.contains("board=")
        let sep = base.contains("?") ? "&" : "?"
        return URL(string: hasBoard ? base : "\(base)\(sep)board=2d")!
    }

    /** Snapshot the current page into Documents/screenshots — ground truth for
        any layout report (e.g. icon alignment) without needing a Mac. */
    private func captureSnapshot(_ tag: String) {
        webView.takeSnapshot(with: nil) { image, _ in
            guard let image else { return }
            let dir = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
                .appendingPathComponent("screenshots", isDirectory: true)
            try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
            let stamp = Int(Date().timeIntervalSince1970)
            if let data = image.pngData() {
                try? data.write(to: dir.appendingPathComponent("\(tag)-\(stamp).png"))
                DebugLog.i("webview", "snapshot saved: \(tag)-\(stamp).png")
            }
        }
    }
    // ------------------------------------------------------- irregular screens

    /** Irregular-screen clearance: uniform scale so the whole game fits between the side insets. */
    private func applyEdgePadding() {
        let px = CGFloat(UserDefaults.standard.integer(forKey: "edge_padding_px"))
        guard px > 0, webView.bounds.width > 0 else { webView.transform = .identity; return }
        let k = (webView.bounds.width - 2 * px) / webView.bounds.width
        webView.transform = CGAffineTransform(scaleX: k, y: k)
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        // re-applied on every layout pass (rotation / initial layout included) so the inset stays correct
        applyEdgePadding()
    }

    // ------------------------------------------------------------- close

    /**
     * iOS has no hardware back: a small floating ✕ gives the escape hatch.
     * First tap asks for confirmation (防误触, same contract as Android's
     * double-back); the server keeps running in the background either way.
     */
    private func buildCloseButton() {
        let close = UIButton(type: .system)
        close.setTitle("✕", for: .normal)
        close.titleLabel?.font = .boldSystemFont(ofSize: 14)
        close.setTitleColor(.white, for: .normal)
        close.backgroundColor = UIColor(white: 0, alpha: 0.35)
        close.layer.cornerRadius = 14
        close.accessibilityLabel = "退出游戏"
        close.translatesAutoresizingMaskIntoConstraints = false
        close.addTarget(self, action: #selector(closeTapped), for: .touchUpInside)
        view.addSubview(close)
        NSLayoutConstraint.activate([
            close.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 10),
            close.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor, constant: 10),
            close.widthAnchor.constraint(equalToConstant: 28),
            close.heightAnchor.constraint(equalToConstant: 28),
        ])
    }

    @objc private func closeTapped() {
        let now = Date().timeIntervalSince1970
        if now - lastCloseTap < 2 {
            dismiss(animated: false) {
                DebugLog.i("lifecycle", "game dismissed (server keeps running)")
            }
            return
        }
        lastCloseTap = now
        let alert = UIAlertController(title: nil, message: "退出游戏？（服务器保持运行，可随时重进）", preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "退出", style: .destructive) { [weak self] _ in
            self?.dismiss(animated: false)
        })
        alert.addAction(UIAlertAction(title: "取消", style: .cancel))
        present(alert, animated: true)
    }

    private var lastCloseTap: TimeInterval = 0

    // ------------------------------------------------------- boot watchdog

    private func scheduleBootProbe() {
        probeAttempts = 0
        DispatchQueue.main.asyncAfter(deadline: .now() + 4) { self.runBootProbe() }
    }

    private func runBootProbe() {
        webView.evaluateJavaScript(Self.probeJS) { raw, _ in
            guard let raw = raw as? String,
                  let data = raw.data(using: .utf8),
                  let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
                DebugLog.i("watchdog", "probe unreadable")
                return
            }
            DebugLog.i("watchdog", "probe: \(obj)")
            self.captureSnapshot("probe-\(self.probeAttempts)")
            if obj["booted"] as? Bool == true {
                self.hideOverlay()
                return
            }
            self.probeAttempts += 1
            if self.probeAttempts <= 2 {
                DispatchQueue.main.asyncAfter(deadline: .now() + 3) { self.runBootProbe() }
            } else {
                let diag = "游戏页面长时间没有启动。\n\n" +
                    "WebGL: \(obj["webgl"] ?? "?") · WebGL2: \(obj["webgl2"] ?? "?")\n" +
                    "canvas 数量: \(obj["canvases"] ?? "?") · 视口: \(obj["w"] ?? "?")x\(obj["h"] ?? "?")\n" +
                    "UA: \(obj["ua"] ?? "?")\n\n" +
                    "可尝试「兼容模式」（2D 棋盘 + 简化渲染）。诊断已写入日志。"
                self.showOverlay(diag)
            }
        }
    }

    // ------------------------------------------------------------- overlay

    private func buildOverlay() {
        overlay = UIView(frame: view.bounds)
        overlay.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        overlay.backgroundColor = UIColor(red: 0.043, green: 0.063, blue: 0.075, alpha: 0.96)
        overlay.isHidden = true

        let title = UILabel()
        title.text = "加载异常"
        title.font = .boldSystemFont(ofSize: 20)
        title.textColor = UIColor(red: 0.9, green: 0.45, blue: 0.45, alpha: 1)
        title.translatesAutoresizingMaskIntoConstraints = false

        overlayText = UILabel()
        overlayText.font = .systemFont(ofSize: 13)
        overlayText.textColor = .white
        overlayText.numberOfLines = 0
        overlayText.translatesAutoresizingMaskIntoConstraints = false

        let reload = UIButton(type: .system)
        reload.setTitle("重新加载", for: .normal)
        reload.backgroundColor = UIColor(red: 0.208, green: 0.816, blue: 0.729, alpha: 1)
        reload.setTitleColor(.black, for: .normal)
        reload.layer.cornerRadius = 8
        reload.addTarget(self, action: #selector(reloadTapped), for: .touchUpInside)
        reload.translatesAutoresizingMaskIntoConstraints = false

        let compat = UIButton(type: .system)
        compat.setTitle("兼容模式", for: .normal)
        compat.backgroundColor = UIColor(white: 1, alpha: 0.12)
        compat.setTitleColor(.white, for: .normal)
        compat.layer.cornerRadius = 8
        compat.addTarget(self, action: #selector(compatTapped), for: .touchUpInside)
        compat.translatesAutoresizingMaskIntoConstraints = false

        overlay.addSubview(title)
        overlay.addSubview(overlayText)
        overlay.addSubview(reload)
        overlay.addSubview(compat)
        view.addSubview(overlay)

        NSLayoutConstraint.activate([
            title.topAnchor.constraint(equalTo: overlay.safeAreaLayoutGuide.topAnchor, constant: 28),
            title.centerXAnchor.constraint(equalTo: overlay.centerXAnchor),
            overlayText.topAnchor.constraint(equalTo: title.bottomAnchor, constant: 12),
            overlayText.leadingAnchor.constraint(equalTo: overlay.leadingAnchor, constant: 28),
            overlayText.trailingAnchor.constraint(equalTo: overlay.trailingAnchor, constant: -28),
            reload.topAnchor.constraint(equalTo: overlayText.bottomAnchor, constant: 20),
            reload.centerXAnchor.constraint(equalTo: overlay.centerXAnchor, constant: -80),
            reload.widthAnchor.constraint(equalToConstant: 130),
            reload.heightAnchor.constraint(equalToConstant: 44),
            compat.topAnchor.constraint(equalTo: reload.topAnchor),
            compat.centerXAnchor.constraint(equalTo: overlay.centerXAnchor, constant: 80),
            compat.widthAnchor.constraint(equalToConstant: 130),
            compat.heightAnchor.constraint(equalToConstant: 44),
        ])
    }

    @objc private func reloadTapped() {
        hideOverlay()
        webView.load(URLRequest(url: initialURL))
    }

    @objc private func compatTapped() {
        hideOverlay()
        let sep = urlString.contains("?") ? "&" : "?"
        webView.load(URLRequest(url: URL(string: "\(urlString)\(sep)board=2d&render=fallback")!))
    }

    private func showOverlay(_ text: String) {
        overlayText.text = text
        overlay.isHidden = false
    }

    private func hideOverlay() { overlay.isHidden = true }

    // ------------------------------------------------------------ lifecycle

    override func viewWillAppear(_ animated: Bool) {
        super.viewWillAppear(animated)
        UIApplication.shared.isIdleTimerDisabled = true
    }

    override func viewWillDisappear(_ animated: Bool) {
        super.viewWillDisappear(animated)
        UIApplication.shared.isIdleTimerDisabled = false
    }
}

extension GameViewController: WKNavigationDelegate {
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        DebugLog.i("webview", "page finished: \(webView.url?.absoluteString ?? "?")")
        scheduleBootProbe()
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url, let host = url.host else {
            // about:blank / blob: / same-document navigations have no host — keep them
            decisionHandler(.allow)
            return
        }
        if host == self.host || host == "127.0.0.1" || host == "localhost" {
            decisionHandler(.allow)
            return
        }
        // external links (GitHub, notices…) open in Safari
        if navigationAction.targetFrame == nil || url.scheme == "http" || url.scheme == "https" {
            UIApplication.shared.open(url)
        }
        decisionHandler(.cancel)
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        // unreachable host / refused connection fails PROVISIONALLY — without this
        // the user stares at a black screen with no overlay and no watchdog
        DebugLog.e("webview", "provisional navigation failed: \(error.localizedDescription)")
        showOverlay("页面加载失败：\(error.localizedDescription)\n\n请确认房主设备已开服、双方在同一 Wi-Fi（或虚拟局域网）。")
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        // renderer jetsam kill (this game is a 280 MB payload) — WKWebView does
        // not reliably auto-reload; do it here like Android's onRenderProcessGone
        DebugLog.e("webview", "web content process terminated — reloading")
        webView.reload()
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        DebugLog.e("webview", "navigation failed: \(error.localizedDescription)")
        showOverlay("页面加载失败：\(error.localizedDescription)")
    }
}

extension GameViewController: WKScriptMessageHandler {
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == "console", let body = message.body as? String else { return }
        let parts = body.split(separator: "|", maxSplits: 1, omittingEmptySubsequences: false)
        let level = parts.count == 2 ? String(parts[0]) : "log"
        let text = parts.count == 2 ? String(parts[1]) : body
        DebugLog.console(level, text, "page")
    }
}
