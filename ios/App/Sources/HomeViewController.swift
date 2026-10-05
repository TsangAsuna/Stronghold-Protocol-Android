// HomeViewController.swift — launcher: install resources, host, join.
// 「加入对局」 presents a standard alert with Bonjour-discovered hosts (tap to
// fill) plus a manual address field — same interaction contract as Android.

import UIKit

final class HomeViewController: UIViewController {

    private let prefs = UserDefaults.standard

    private let statusLabel = UILabel()
    private let activity = UIActivityIndicatorView(style: .medium)
    private let hostButton = UIButton(type: .system)
    private let joinButton = UIButton(type: .system)
    private let hintLabel = UILabel()
    private var busy = false
    private var browser: LanBrowser?

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
        subtitle.text = "内置服务器 · 局域网联机 · 未签名构建（TrollStore 直装 / 自签）"
        subtitle.font = .systemFont(ofSize: 12)
        subtitle.textColor = .secondaryLabel
        subtitle.translatesAutoresizingMaskIntoConstraints = false

        statusLabel.text = "正在检查资源…"
        statusLabel.font = .monospacedSystemFont(ofSize: 12, weight: .regular)
        statusLabel.textColor = .label
        statusLabel.numberOfLines = 0
        statusLabel.translatesAutoresizingMaskIntoConstraints = false

        activity.isHidden = true
        activity.translatesAutoresizingMaskIntoConstraints = false

        hostButton.setTitle("开始游戏（本机开服）", for: .normal)
        joinButton.setTitle("加入对局（自动发现 / 输入地址）", for: .normal)
        styleButton(hostButton, filled: true)
        styleButton(joinButton, filled: false)

        hintLabel.numberOfLines = 0
        hintLabel.font = .systemFont(ofSize: 11)
        hintLabel.textColor = .secondaryLabel
        hintLabel.translatesAutoresizingMaskIntoConstraints = false

        for v in [title, subtitle, statusLabel, activity, hostButton, joinButton, hintLabel] {
            view.addSubview(v)
        }

        NSLayoutConstraint.activate([
            title.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 20),
            title.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 24),

            subtitle.topAnchor.constraint(equalTo: title.bottomAnchor, constant: 4),
            subtitle.leadingAnchor.constraint(equalTo: title.leadingAnchor),

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

            hintLabel.topAnchor.constraint(equalTo: joinButton.bottomAnchor, constant: 12),
            hintLabel.leadingAnchor.constraint(equalTo: hostButton.leadingAnchor),
            hintLabel.trailingAnchor.constraint(equalTo: hostButton.trailingAnchor),
        ])

        hostButton.addTarget(self, action: #selector(startHost), for: .touchUpInside)
        joinButton.addTarget(self, action: #selector(joinTapped), for: .touchUpInside)
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

    // ------------------------------------------------------------ flows

    @objc private func startHost() {
        if busy { return }
        // reuse a server left running from the previous game
        if case let .running(port) = NodeRuntime.shared.state, NodeRuntime.shared.isHealthy(port) {
            openGame(port: port)
            return
        }
        setBusy(true, "正在启动本机服务器…")
        let port = NodeRuntime.freePort(3000)
        DebugLog.i("host", "host flow started (port=\(port))")
        let state = NodeRuntime.shared.ensureStarted(root: NodeRuntime.documentsNodeRoot, port: port)
        var pollPort = port
        if case let .starting(p) = state { pollPort = p }
        if case let .running(p) = state { pollPort = p }
        NodeRuntime.shared.awaitHealthy(port: pollPort, timeoutMs: 20_000) { ok in
            DispatchQueue.main.async {
                if ok {
                    self.setBusy(false, "服务器已就绪 · 端口 \(pollPort)")
                    self.hintLabel.text = "朋友的浏览器打开 \(NodeRuntime.localIPv4Addresses().map { "http://\($0):\(pollPort)" }.joined(separator: " 或 ")) 即可加入"
                    self.openGame(port: pollPort)
                } else {
                    self.setBusy(false, "服务器启动失败，详见「文件」App →卫戍协议 → logs/node.log")
                }
            }
        }
    }

    // ---------------------------------------------------------------- join

    @objc private func joinTapped() {
        if busy { return }
        let alert = UIAlertController(
            title: "加入对局",
            message: "自动发现同一 Wi-Fi 的房主（点选即填），或手动输入地址",
            preferredStyle: .alert)
        alert.addTextField { field in
            field.placeholder = "192.168.x.x:3000"
            field.text = UserDefaults.standard.string(forKey: "last_host")
            field.keyboardType = .URL
            field.autocorrectionType = .no
            field.autocapitalizationType = .none
        }
        alert.addAction(UIAlertAction(title: "连接", style: .default) { [weak self] _ in
            self?.connect(from: alert.textFields?.first?.text)
        })
        alert.addAction(UIAlertAction(title: "取消", style: .cancel) { [weak self] _ in
            self?.browser?.stop()
        })

        let added = NSMutableSet()
        browser = LanBrowser()
        browser?.onHosts = { [weak alert] hosts in
            guard let alert else { return }
            for host in hosts {
                let key = "\(host.host):\(host.port)"
                guard !added.contains(key) else { continue }
                added.add(key)
                alert.addAction(UIAlertAction(title: "\(host.name)  ·  \(key)", style: .default) { _ in
                    alert.textFields?.first?.text = key
                })
            }
        }
        browser?.start()
        present(alert, animated: true)
    }

    private func connect(from raw: String?) {
        browser?.stop()
        let trimmed = (raw ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            statusLabel.text = "请输入房主地址"
            return
        }
        let withScheme = trimmed.hasPrefix("http://") || trimmed.hasPrefix("https://") ? trimmed : "http://\(trimmed)"
        guard let url = URL(string: withScheme), let host = url.host, !host.isEmpty else {
            statusLabel.text = "地址无效，示例：192.168.1.5:3000"
            return
        }
        prefs.set(trimmed, forKey: "last_host")
        DebugLog.i("join", "connecting to \(withScheme)")
        presentGame(url: withScheme)
    }

    private func openGame(port: Int) {
        presentGame(url: "http://127.0.0.1:\(port)/")
    }

    private func presentGame(url: String) {
        let game = GameViewController(url: url)
        game.modalPresentationStyle = .fullScreen
        present(game, animated: false)
    }
}
