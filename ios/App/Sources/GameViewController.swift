// GameViewController.swift — fullscreen immersive WKWebView playing the web client.
// iPad / iPhone, all orientations; keeps the screen awake while playing.

import UIKit
import WebKit

final class GameViewController: UIViewController, WKUIDelegate {

    private let urlString: String
    private var webView: WKWebView!
    private var host: String = "127.0.0.1"

    init(url: String) {
        self.urlString = url
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) is not supported") }

    override func viewDidLoad() {
        super.viewDidLoad()
        host = URL(string: urlString)?.host ?? "127.0.0.1"

        let config = WKWebViewConfiguration()
        let prefs = WKWebpagePreferences()
        prefs.allowsContentJavaScript = true
        config.defaultWebpagePreferences = prefs
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []

        webView = WKWebView(frame: view.bounds, configuration: config)
        webView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        webView.scrollView.isScrollEnabled = false
        webView.isOpaque = false
        webView.backgroundColor = .black
        webView.uiDelegate = self
        webView.navigationDelegate = self
        view.addSubview(webView)

        // edge-to-edge under notches / home indicator
        webView.translatesAutoresizingMaskIntoConstraints = true

        webView.load(URLRequest(url: URL(string: urlString)!))
        UIApplication.shared.isIdleTimerDisabled = true
        DebugLog.i("webview", "loading \(urlString)")
    }

    override func viewWillDisappear(_ animated: Bool) {
        super.viewWillDisappear(animated)
        UIApplication.shared.isIdleTimerDisabled = false
        // suspend the game's audio when leaving (stock client exposes __SP__.audio)
        webView?.evaluateJavaScript(
            "try{globalThis.__SP__&&globalThis.__SP__.audio&&globalThis.__SP__.audio.suspend&&globalThis.__SP__.audio.suspend()}catch(e){}",
            completionHandler: nil)
    }

    override func viewWillAppear(_ animated: Bool) {
        super.viewWillAppear(animated)
        UIApplication.shared.isIdleTimerDisabled = true
        webView?.evaluateJavaScript(
            "try{globalThis.__SP__&&globalThis.__SP__.audio&&globalThis.__SP__.audio.resume&&globalThis.__SP__.audio.resume()}catch(e){}",
            completionHandler: nil)
    }
}

extension GameViewController: WKNavigationDelegate {
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        DebugLog.i("webview", "page finished: \(webView.url?.absoluteString ?? "?")")
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        if let host = navigationAction.request.url?.host, host == self.host || host == "127.0.0.1" || host == "localhost" {
            decisionHandler(.allow)
            return
        }
        // external links (GitHub, notices…) open in Safari
        if let url = navigationAction.request.url {
            UIApplication.shared.open(url)
        }
        decisionHandler(.cancel)
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        DebugLog.e("webview", "navigation failed: \(error.localizedDescription)")
    }
}
