// HomeViewController.swift — launcher: install resources, host, join by address.
// Same flows as the Android MainActivity, in plain UIKit (no storyboards).

import UIKit

final class HomeViewController: UIViewController {

    private let prefs = UserDefaults.standard

    private let statusLabel = UILabel()
    private let activity = UIActivityIndicatorView(style: .medium)
    private let hostButton = UIButton(type: .system)
    private let joinButton = UIButton(type: .system)
    private let addressField = UITextField()
    private let hintLabel = UILabel()
    private var busy = false

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
        subtitle.text = "内置服务器 · 局域网联机 · 未签名构建（自签/ TrollStore 安装）"
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

        func styled(_ title: String, _ filled: Bool) -> UIButton {
            let b = UIButton(type: .system)
            b.setTitle(title, for: .normal)
            b.titleLabel?.font = .boldSystemFont(ofSize: 16)
            b.layer.cornerRadius = 10
            b.heightAnchor.constraint(equalToConstant: 48).isActive = true
            if filled {
                b.backgroundColor = UIColor(red: 0.208, green: 0.816, blue: 0.729, alpha: 1)
                b.setTitleColor(UIColor(red: 0.03, green: 0.07, blue: 0.06, alpha: 1), for: .normal)
            } else {
                b.backgroundColor = UIColor(white: 1, alpha: 0.08)
                b.setTitleColor(.label, for: .normal)
            }
            b.translatesAutoresizingMaskIntoConstraints = false
            return b
        }

        hostButton.setTitle("开始游戏（本机开服）", for: .normal)
        styleButton(hostButton, filled: true)
        joinButton.setTitle("加入对局（输入房主地址）", for: .normal)
        styleButton(joinButton, filled: false)

        addressField.placeholder = "192.168.x.x:3000"
        addressField.borderStyle = .roundedRect
        addressField.autocorrectionType = .no
        addressField.autocapitalizationType = .none
        addressField.keyboardType = .URL
        addressField.text = prefs.string(forKey: "last_host") ?? ""
        addressField.translatesAutoresizingMaskIntoConstraints = false

        hintLabel.numberOfLines = 0
        hintLabel.font = .systemFont(ofSize: 11)
        hintLabel.textColor = .secondaryLabel
        hintLabel.translatesAutoresizingMaskIntoConstraints = false

        for v in [title, subtitle, statusLabel, activity, hostButton, joinButton, addressField, hintLabel] {
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

            joinButton.topAnchor.constraint(equalTo: hostButton.bottomAnchor, constant: 12),
            joinButton.leadingAnchor.constraint(equalTo: hostButton.leadingAnchor),
            joinButton.trailingAnchor.constraint(equalTo: hostButton.trailingAnchor),

            addressField.topAnchor.constraint(equalTo: joinButton.bottomAnchor, constant: 16),
            addressField.leadingAnchor.constraint(equalTo: hostButton.leadingAnchor),
            addressField.trailingAnchor.constraint(equalTo: hostButton.trailingAnchor),

            hintLabel.topAnchor.constraint(equalTo: addressField.bottomAnchor, constant: 10),
            hintLabel.leadingAnchor.constraint(equalTo: hostButton.leadingAnchor),
            hintLabel.trailingAnchor.constraint(equalTo: hostButton.trailingAnchor),
        ])

        hostButton.addTarget(self, action: #selector(startHost), for: .touchUpInside)
        joinButton.addTarget(self, action: #selector(joinTapped), for: .touchUpInside)
    }

    private func styleButton(_ b: UIButton, filled: Bool) {
        b.titleLabel?.font = .boldSystemFont(ofSize: 16)
        b.layer.cornerRadius = 10
        b.heightAnchor.constraint(equalToConstant: 48).isActive = true
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
        let pollPort: Int
        switch state {
        case .running(let p), .starting(let p): pollPort = p
        default: pollPort = port
        }
        NodeRuntime.shared.awaitHealthy(port: pollPort, timeoutMs: 20_000) { ok in
            DispatchQueue.main.async {
                if ok {
                    self.setBusy(false, "服务器已就绪 · 端口 \(pollPort)")
                    self.hintLabel.text = "朋友的浏览器打开 \(NodeRuntime.localIPv4Addresses().map { "http://\($0):\(pollPort)" }.joined(separator: " 或 ")) 即可加入"
                    self.openGame(port: pollPort)
                } else {
                    self.setBusy(false, "服务器启动失败，详见 Documents/logs/node.log")
                }
            }
        }
    }

    @objc private func joinTapped() {
        if busy { return }
        let raw = (addressField.text ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        guard !raw.isEmpty else {
            statusLabel.text = "请输入房主地址"
            return
        }
        let withScheme = raw.hasPrefix("http://") || raw.hasPrefix("https://") ? raw : "http://\(raw)"
        guard let url = URL(string: withScheme), let host = url.host, !host.isEmpty else {
            statusLabel.text = "地址无效，示例：192.168.1.5:3000"
            return
        }
        prefs.set(raw, forKey: "last_host")
        DebugLog.i("join", "connecting to \(withScheme)")
        presentGame(url: withScheme)
    }

    private func openGame(port: Int) {
        presentGame(url: "http://127.0.0.1:\(port)/")
    }

    private func presentGame(url: String) {
        let game = GameActivity(url: url)
        game.modalPresentationStyle = .fullScreen
        present(game, animated: false)
    }
}
