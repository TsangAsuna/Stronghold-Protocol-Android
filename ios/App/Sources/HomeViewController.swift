// HomeViewController.swift — the iOS shell is a server manager + browser
// bridge, NOT a webview: iOS 15.1's WKWebView cannot run this game properly,
// while Safari (and Gecko-based Reynard) can. The shell hosts the Node server,
// keeps itself alive in the background with a silent audio track, discovers
// LAN hosts via Bonjour and hands the game URL to the system browser.

import UIKit

final class HomeViewController: UIViewController {

    private let prefs = UserDefaults.standard

    private let statusLabel = UILabel()
    private let activity = UIActivityIndicatorView(style: .medium)
    private let hostButton = UIButton(type: .system)
    private let joinButton = UIButton(type: .system)
    private let hintLabel = UILabel()

    // hosting state UI
    private let urlLabel = UILabel()
    private let safariButton = UIButton(type: .system)
    private let copyButton = UIButton(type: .system)
    private let stopButton = UIButton(type: .system)

    private var busy = false
    private var browser: LanBrowser?
    private var hostingPort: Int?
    private var hostingBox: UIStackView?
    private var inAppButton: UIButton?

    private var gameURL: URL? {
        guard let port = hostingPort else { return nil }
        return URL(string: "http://127.0.0.1:\(port)/")
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 0.043, green: 0.063, blue: 0.075, alpha: 1)
        setupUI()
        ensureInstalled()
    }

    // ---------------------------------------------------------------- UI

    private func setupUI() {
        let title = UILabel()
        title.text = "卫戍协议：盟约 · iOS"
        title.font = .boldSystemFont(ofSize: 24)
        title.textColor = UIColor(red: 0.208, green: 0.816, blue: 0.729, alpha: 1)
        title.translatesAutoresizingMaskIntoConstraints = false

        let subtitle = UILabel()
        subtitle.text = "服务器壳 · 游戏在 Safari / Reynard 中游玩（iOS 15 的内嵌 WebView 跑不动它）"
        subtitle.font = .systemFont(ofSize: 12)
        subtitle.textColor = .secondaryLabel
        subtitle.numberOfLines = 0
        subtitle.translatesAutoresizingMaskIntoConstraints = false

        statusLabel.text = "正在检查资源…"
        statusLabel.font = .monospacedSystemFont(ofSize: 12, weight: .regular)
        statusLabel.textColor = .label
        statusLabel.numberOfLines = 0
        statusLabel.translatesAutoresizingMaskIntoConstraints = false

        activity.isHidden = true
        activity.translatesAutoresizingMaskIntoConstraints = false

        hostButton.setTitle("本机开服（房间服务器）", for: .normal)
        joinButton.setTitle("加入对局（自动发现 / 输入地址）", for: .normal)
        styleButton(hostButton, filled: true)
        styleButton(joinButton, filled: false)

        urlLabel.font = .monospacedSystemFont(ofSize: 15, weight: .semibold)
        urlLabel.textColor = UIColor(red: 0.208, green: 0.816, blue: 0.729, alpha: 1)
        urlLabel.numberOfLines = 0
        urlLabel.isUserInteractionEnabled = true
        urlLabel.translatesAutoresizingMaskIntoConstraints = false

        safariButton.setTitle("▶ 在 Safari 中打开游戏（推荐）", for: .normal)
        let inAppButton = UIButton(type: .system)
        inAppButton.setTitle("App 内打开（实验）", for: .normal)
        inAppButton.titleLabel?.font = .systemFont(ofSize: 14)
        inAppButton.translatesAutoresizingMaskIntoConstraints = false
        inAppButton.backgroundColor = UIColor(white: 1, alpha: 0.12)
        inAppButton.setTitleColor(.label, for: .normal)
        inAppButton.layer.cornerRadius = 10
        inAppButton.heightAnchor.constraint(equalToConstant: 44).isActive = true
        inAppButton.addTarget(self, action: #selector(openInApp), for: .touchUpInside)
        self.inAppButton = inAppButton
        copyButton.setTitle("复制地址", for: .normal)
        stopButton.setTitle("停止服务器并退出", for: .normal)
        for b in [safariButton, copyButton, stopButton] {
            b.titleLabel?.font = .systemFont(ofSize: 14)
            b.translatesAutoresizingMaskIntoConstraints = false
        }
        safariButton.backgroundColor = UIColor(red: 0.208, green: 0.816, blue: 0.729, alpha: 1)
        safariButton.setTitleColor(.black, for: .normal)
        safariButton.layer.cornerRadius = 10
        safariButton.heightAnchor.constraint(equalToConstant: 46).isActive = true

        hintLabel.numberOfLines = 0
        hintLabel.font = .systemFont(ofSize: 11)
        hintLabel.textColor = .secondaryLabel
        hintLabel.translatesAutoresizingMaskIntoConstraints = false

        let hostingBox = UIStackView(arrangedSubviews: [urlLabel, safariButton, inAppButton!, copyButton, stopButton])
        hostingBox.axis = .vertical
        hostingBox.spacing = 10
        hostingBox.translatesAutoresizingMaskIntoConstraints = false
        hostingBox.isHidden = true
        self.hostingBox = hostingBox

        for v in [title, subtitle, statusLabel, activity, hostButton, joinButton, hostingBox, hintLabel] {
            view.addSubview(v)
        }

        NSLayoutConstraint.activate([
            title.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 20),
            title.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 24),
            title.trailingAnchor.constraint(lessThanOrEqualTo: view.trailingAnchor, constant: -24),

            subtitle.topAnchor.constraint(equalTo: title.bottomAnchor, constant: 4),
            subtitle.leadingAnchor.constraint(equalTo: title.leadingAnchor),
            subtitle.trailingAnchor.constraint(lessThanOrEqualTo: view.trailingAnchor, constant: -24),

            statusLabel.topAnchor.constraint(equalTo: subtitle.bottomAnchor, constant: 14),
            statusLabel.leadingAnchor.constraint(equalTo: title.leadingAnchor),
            statusLabel.trailingAnchor.constraint(lessThanOrEqualTo: view.trailingAnchor, constant: -24),

            activity.centerYAnchor.constraint(equalTo: statusLabel.centerYAnchor),
            activity.leadingAnchor.constraint(equalTo: statusLabel.trailingAnchor, constant: 8),

            hostButton.topAnchor.constraint(equalTo: statusLabel.bottomAnchor, constant: 24),
            hostButton.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 24),
            hostButton.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -24),
            hostButton.heightAnchor.constraint(equalToConstant: 48),

            joinButton.topAnchor.constraint(equalTo: hostButton.bottomAnchor, constant: 12),
            joinButton.leadingAnchor.constraint(equalTo: hostButton.leadingAnchor),
            joinButton.trailingAnchor.constraint(equalTo: hostButton.trailingAnchor),
            joinButton.heightAnchor.constraint(equalToConstant: 48),

            hostingBox.topAnchor.constraint(equalTo: joinButton.bottomAnchor, constant: 18),
            hostingBox.leadingAnchor.constraint(equalTo: hostButton.leadingAnchor),
            hostingBox.trailingAnchor.constraint(equalTo: hostButton.trailingAnchor),

            hintLabel.topAnchor.constraint(equalTo: hostingBox.bottomAnchor, constant: 12),
            hintLabel.leadingAnchor.constraint(equalTo: hostButton.leadingAnchor),
            hintLabel.trailingAnchor.constraint(equalTo: hostButton.trailingAnchor),
        ])

        hostButton.addTarget(self, action: #selector(startHost), for: .touchUpInside)
        joinButton.addTarget(self, action: #selector(joinTapped), for: .touchUpInside)
        safariButton.addTarget(self, action: #selector(openInSafari), for: .touchUpInside)
        copyButton.addTarget(self, action: #selector(copyAddress), for: .touchUpInside)
        stopButton.addTarget(self, action: #selector(stopServerTapped), for: .touchUpInside)

        // the LAN IP can change (DHCP / network switch) — refresh on foreground
        NotificationCenter.default.addObserver(
            self, selector: #selector(refreshHostingInfo),
            name: UIApplication.didBecomeActiveNotification, object: nil)
    }

    @objc private func refreshHostingInfo() {
        guard let port = hostingPort, NodeRuntime.shared.isHealthy(port) else { return }
        let lan = NodeRuntime.localIPv4Addresses().map { "http://\($0):\(port)" }
        urlLabel.text = "本机地址：\n" + lan.joined(separator: "\n")
        DebugLog.i("host", "hosting info refreshed: \(lan)")
    }

    private func styleButton(_ b: UIButton, filled: Bool) {
        b.titleLabel?.font = .boldSystemFont(ofSize: 16)
        b.layer.cornerRadius = 10
        b.translatesAutoresizingMaskIntoConstraints = false
        if filled {
            b.backgroundColor = UIColor(red: 0.208, green: 0.816, blue: 0.729, alpha: 1)
            b.setTitleColor(UIColor(red: 0.03, green: 0.07, blue: 0.06, alpha: 1), for: .normal)
        } else {
            b.backgroundColor = UIColor(white: 1, alpha: 0.08)
            b.setTitleColor(.label, for: .normal)
        }
    }

    // ------------------------------------------------------------ install

    private func ensureInstalled() {
        if AssetInstaller.isInstalled() {
            statusLabel.text = "资源已就绪。"
            return
        }
        setBusy(true, "正在安装游戏资源（首次约 1 分钟）…")
        DispatchQueue.global(qos: .userInitiated).async {
            do {
                try AssetInstaller.install { done, total in
                    DispatchQueue.main.async {
                        self.statusLabel.text = "复制资源 \(done)/\(total) 项…"
                    }
                }
                DispatchQueue.main.async {
                    self.setBusy(false, "资源已就绪。")
                }
            } catch {
                DebugLog.e("install", "install failed: \(error)")
                DispatchQueue.main.async {
                    self.setBusy(false, "资源安装失败：\(error.localizedDescription)")
                }
            }
        }
    }

    private func setBusy(_ busy: Bool, _ status: String?) {
        self.busy = busy
        hostButton.isEnabled = !busy
        joinButton.isEnabled = !busy
        activity.isHidden = !busy
        if busy { activity.startAnimating() } else { activity.stopAnimating() }
        if let s = status { statusLabel.text = s }
    }

    // ------------------------------------------------------------ host flow

    @objc private func startHost() {
        if busy { return }
        setBusy(true, "正在启动本机服务器…")
        // health probes block up to seconds per address — keep them off the main thread
        DispatchQueue.global(qos: .userInitiated).async {
            if case let .running(port) = NodeRuntime.shared.state, NodeRuntime.shared.isHealthy(port) {
                DispatchQueue.main.async {
                    self.setBusy(false, "服务器已在运行 · 端口 \(port)")
                    self.enterHosting(port: port)
                }
                return
            }
            if case .exited = NodeRuntime.shared.state {
                DispatchQueue.main.async {
                    self.setBusy(false, "服务器进程已退出（node 每次启动只能运行一个实例），请重启 App 后再试")
                }
                return
            }

            // prefer the last successful port so browser addresses stay valid
            let preferred = (self.prefs.object(forKey: "last_port") as? Int) ?? 3000
            let port = NodeRuntime.freePort(preferred)
            DebugLog.i("host", "host flow started (port=\(port))")
            let state = NodeRuntime.shared.ensureStarted(root: NodeRuntime.documentsNodeRoot, port: port)
            var pollPort = port
            if case let .starting(p) = state { pollPort = p }
            if case let .running(p) = state { pollPort = p }
            NodeRuntime.shared.awaitHealthy(port: pollPort, timeoutMs: 20_000) { ok in
                DispatchQueue.main.async {
                    if ok {
                        self.prefs.set(pollPort, forKey: "last_port")
                        self.setBusy(false, "服务器运行中 · 端口 \(pollPort)")
                        self.enterHosting(port: pollPort)
                    } else {
                        self.setBusy(false, "服务器启动失败，详见「文件」App →卫戍协议 → logs/node.log")
                    }
                }
            }
        }
    }

    /** Switch to the hosting screen: address + browser bridge + keep-alive. */
    private func enterHosting(port: Int) {
        hostingPort = port
        hostButton.isHidden = true
        joinButton.isHidden = true

        let lan = NodeRuntime.localIPv4Addresses().map { "http://\($0):\(port)" }
        urlLabel.text = "本机地址：\n" + lan.joined(separator: "\n")
        hintLabel.text = "把上面的地址发给朋友（浏览器打开即可加入）；或用下面的按钮在本机打开游戏。\n后台时保持静音播放以维持服务器运行。"

        UIView.animate(withDuration: 0.2) {
            self.view.layoutIfNeeded()
        }
        hostingBoxVisible(true)
        SilentAudioKeeper.shared.start()
        HostAdvertiser.shared.start(port: port)
        DebugLog.i("host", "hosting on port \(port) — keep-alive + advertiser on")
    }

    private func hostingBoxVisible(_ visible: Bool) {
        hostingBox?.isHidden = !visible
        // in-app play stays available in both hosting and join flows
        inAppButton?.isHidden = !visible && hostingPort == nil
    }

    @objc private func openInApp() {
        let url: String
        if let port = hostingPort { url = "http://127.0.0.1:\(port)/" }
        else if let raw = prefs.string(forKey: "last_host"), !raw.isEmpty { url = raw.hasPrefix("http") ? raw : "http://\(raw)" }
        else { statusLabel.text = "请先开服或加入对局"; return }
        DebugLog.i("bridge", "opening in-app webview: \(url)")
        let game = GameViewController(url: url)
        game.modalPresentationStyle = .fullScreen
        present(game, animated: false)
    }

    @objc private func openInSafari() {
        guard let url = gameURL ?? joinedURL() else { return }
        // Safari plays this game perfectly; the shell stays alive in the background
        UIApplication.shared.open(url, options: [:]) { ok in
            DebugLog.i("bridge", "opened in browser: \(ok)")
        }
    }

    private func joinedURL() -> URL? {
        guard let raw = prefs.string(forKey: "last_host"), !raw.isEmpty else { return nil }
        return URL(string: raw.hasPrefix("http") ? raw : "http://\(raw)")
    }

    @objc private func copyAddress() {
        guard let text = urlLabel.text else { return }
        UIPasteboard.general.string = text.replacingOccurrences(of: "本机地址：\n", with: "")
        Toast("已复制")
    }

    @objc private func stopServerTapped() {
        let alert = UIAlertController(title: nil, message: "停止服务器并退出 App？朋友会断开连接。", preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "停止并退出", style: .destructive) { _ in
            SilentAudioKeeper.shared.stop()
            HostAdvertiser.shared.stop()
            exit(0)
        })
        alert.addAction(UIAlertAction(title: "取消", style: .cancel))
        present(alert, animated: true)
    }

    private func Toast(_ text: String) {
        let alert = UIAlertController(title: nil, message: text, preferredStyle: .alert)
        present(alert, animated: true)
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) { alert.dismiss(animated: true) }
    }

    // ---------------------------------------------------------------- join

    @objc private func joinTapped() {
        if busy { return }
        let alert = UIAlertController(
            title: "加入对局",
            message: "正在搜索同一 Wi-Fi 的房主…\n（也可手动输入地址）",
            preferredStyle: .alert)

        let added = NSMutableSet()
        browser = LanBrowser()
        browser?.onHosts = { [weak self, weak alert] hosts in
            guard let self, let alert else { return }
            DispatchQueue.main.async {
                for host in hosts {
                    let key = "\(host.host):\(host.port)"
                    guard !added.contains(key) else { continue }
                    added.add(key)
                    alert.addAction(UIAlertAction(title: "\(host.name)  ·  \(key)", style: .default) { [weak self] _ in
                        self?.browser?.stop()
                        self?.prefs.set(key, forKey: "last_host")
                        DispatchQueue.main.async {
                            self?.joinInBrowser(key: key)
                        }
                    })
                }
                if added.count > 0 {
                    alert.message = "发现房主：点击在 Safari 中打开"
                }
            }
        }
        browser?.onError = { [weak alert] message in
            DispatchQueue.main.async {
                alert?.message = message
            }
        }

        alert.addAction(UIAlertAction(title: "手动输入地址", style: .default) { [weak self] _ in
            self?.showManualEntry()
        })
        alert.addAction(UIAlertAction(title: "取消", style: .cancel) { [weak self] _ in
            self?.browser?.stop()
        })

        browser?.start()
        present(alert, animated: true)
    }

    private func showManualEntry() {
        browser?.stop()
        let alert = UIAlertController(title: "手动输入房主地址", message: nil, preferredStyle: .alert)
        alert.addTextField { field in
            field.placeholder = "192.168.x.x:3000"
            field.text = UserDefaults.standard.string(forKey: "last_host")
            field.keyboardType = .URL
            field.autocorrectionType = .no
            field.autocapitalizationType = .none
        }
        alert.addAction(UIAlertAction(title: "在 Safari 中打开", style: .default) { [weak self] _ in
            self?.connect(from: alert.textFields?.first?.text)
        })
        alert.addAction(UIAlertAction(title: "取消", style: .cancel))
        present(alert, animated: true)
    }

    private func connect(from raw: String?) {
        let trimmed = (raw ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            statusLabel.text = "请输入房主地址"
            return
        }
        prefs.set(trimmed, forKey: "last_host")
        joinInBrowser(key: trimmed)
    }

    /** Hand the game URL to Safari — the shell stays out of the render path. */
    private func joinInBrowser(key: String) {
        let withScheme = key.hasPrefix("http://") || key.hasPrefix("https://") ? key : "http://\(key)"
        guard let url = URL(string: withScheme), url.host != nil else {
            statusLabel.text = "地址无效，示例：192.168.1.5:3000"
            return
        }
        DebugLog.i("join", "opening in browser: \(withScheme)")
        UIApplication.shared.open(url, options: [:])
    }
}
