// NodeRuntime.swift — embedded Node.js server (nodejs-mobile libnode, in-process).
//
// The C++ shim (NodeStart.cpp) links node::Start and redirects stdout/stderr to
// files/logs/node.log. Same rules as the Android shell: dedicated 16 MB-stack
// thread, HOST/PORT via setenv, health check against every local address,
// port fallback when the preferred port is taken.

import Foundation

/// Swift-friendly wrapper around the C shim (see NodeStart.cpp / bridge.h).
private func spNodeStart(_ args: [String], logPath: String) -> Int32 {
    let cLog = strdup(logPath)
    defer { free(cLog) }
    var cArgs: [UnsafeMutablePointer<CChar>?] = args.map { strdup($0) }
    defer { for p in cArgs { free(p) } }
    return sp_node_start(&cArgs, Int32(cArgs.count), cLog)
}

final class NodeRuntime {
    static let shared = NodeRuntime()

    enum State {
        case idle
        case starting(port: Int)
        case running(port: Int)
        case exited(String?)
    }

    private var stateValue: State = .idle
    private let lock = NSLock()

    /// Committed lifecycle state (readable from UI controllers).
    var state: State {
        get { lock.lock(); defer { lock.unlock() }; return stateValue }
        set { lock.lock(); stateValue = newValue; lock.unlock() }
    }

    static var documentsNodeRoot: URL {
        FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("node", isDirectory: true)
    }

    func isHealthy(_ port: Int, timeoutMs: Int = 700) -> Bool {
        for host in ["127.0.0.1"] + Self.localIPv4Addresses() {
            if probeHealth(host, port: port, timeoutMs: timeoutMs) { return true }
        }
        return false
    }

    private func probeHealth(_ host: String, port: Int, timeoutMs: Int) -> Bool {
        guard let url = URL(string: "http://\(host):\(port)/healthz") else { return false }
        var request = URLRequest(url: url)
        request.timeoutInterval = Double(timeoutMs) / 1000.0
        request.httpMethod = "GET"
        var ok = false
        let semaphore = DispatchSemaphore(value: 0)
        let task = URLSession.shared.dataTask(with: request) { data, _, _ in
            if let data = data, let body = String(data: data, encoding: .utf8) {
                ok = body.contains("\"ok\":true")
            }
            semaphore.signal()
        }
        task.resume()
        _ = semaphore.wait(timeout: .now() + .milliseconds(timeoutMs + 300))
        return ok
    }

    static func localIPv4Addresses() -> [String] {
        var out: [String] = []
        var ifaddr: UnsafeMutablePointer<ifaddrs>?
        guard getifaddrs(&ifaddr) == 0 else { return out }
        defer { freeifaddrs(ifaddr) }
        var ptr: UnsafeMutablePointer<ifaddrs>? = ifaddr
        while let p = ptr {
            defer { ptr = p.pointee.ifa_next }
            guard let sa = p.pointee.ifa_addr, sa.pointee.sa_family == UInt8(AF_INET) else { continue }
            var host = [CChar](repeating: 0, count: Int(NI_MAXHOST))
            if getnameinfo(sa, socklen_t(sa.pointee.sa_len), &host, socklen_t(host.count), nil, 0, NI_NUMERICHOST) == 0 {
                let ip = String(cString: host)
                if ip != "127.0.0.1" { out.append(ip) }
            }
        }
        return out
    }

    /// Pick a free port starting at `preferred` (iOS has squatters too — e.g.
    /// AirPlay on 7000; we start at 3000 and move up). SO_REUSEADDR keeps
    /// TIME_WAIT sockets from faking "busy".
    static func freePort(_ preferred: Int, tries: Int = 20) -> Int {
        for offset in 0..<tries {
            let candidate = Int32(preferred + offset)
            let sock = socket(AF_INET, SOCK_STREAM, 0)
            guard sock >= 0 else { continue }
            defer { close(sock) }
            var yes: Int32 = 1
            setsockopt(sock, SOL_SOCKET, SO_REUSEADDR, &yes, socklen_t(MemoryLayout<Int32>.size))
            var addr = sockaddr_in()
            addr.sin_family = sa_family_t(AF_INET)
            addr.sin_port = in_port_t(candidate).bigEndian
            addr.sin_addr = in_addr(s_addr: INADDR_ANY)
            let bindResult = withUnsafePointer(to: &addr) {
                $0.withMemoryRebound(to: sockaddr.self, capacity: 1) {
                    bind(sock, $0, socklen_t(MemoryLayout<sockaddr_in>.size))
                }
            }
            if bindResult == 0 { return preferred + offset }
        }
        DebugLog.e("net", "freePort exhausted \(tries) candidates from \(preferred) — returning preferred (node will fail visibly)")
        return preferred
    }

    /// Start the server if not already running/starting. Returns the committed state.
    /// NOTE: node::Start may run exactly once per process (upstream tears down the
    /// V8 platform on return) — after `.exited` a restart must be refused.
    @discardableResult
    func ensureStarted(root: URL, port: Int) -> State {
        switch state {
        case .starting, .running:
            return state
        case .exited(let reason):
            DebugLog.e("node", "refusing to restart node in-process (previous exit: \(reason ?? "?")) — relaunch the app")
            return state
        case .idle:
            break
        }
        if isHealthy(port) {
            state = .running(port: port)
            return state
        }

        setenv("HOST", "0.0.0.0", 1)
        setenv("PORT", String(port), 1)
        setenv("TRUST_PROXY", "0", 1)

        let entry = root.appendingPathComponent("server/index.js").path
        let logPath = DebugLog.shared.nodeLogURL.path

        let thread = Thread {
            NodeRuntime.shared.state = .starting(port: port)
            let rc = spNodeStart(["node", entry], logPath: logPath)
            DebugLog.i("node", "runtime exited rc=\(rc)")
            NodeRuntime.shared.state = .exited("rc=\(rc)")
        }
        thread.name = "node-server"
        thread.stackSize = 16 * 1024 * 1024
        thread.start()
        state = .starting(port: port)
        return state
    }

    func awaitHealthy(port: Int, timeoutMs: Int, completion: @escaping (Bool) -> Void) {
        let deadline = Date().addingTimeInterval(Double(timeoutMs) / 1000.0)
        DispatchQueue.global(qos: .userInitiated).async {
            while Date() < deadline {
                // a crashed node (EADDRINUSE etc.) must not keep the user waiting
                if case .exited = self.state { completion(false); return }
                if self.isHealthy(port) {
                    self.state = .running(port: port)
                    completion(true)
                    return
                }
                Thread.sleep(forTimeInterval: 0.25)
            }
            completion(false)
        }
    }
}
