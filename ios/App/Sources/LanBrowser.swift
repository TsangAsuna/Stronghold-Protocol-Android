// LanBrowser.swift — Bonjour discovery for game hosts advertising
// `_stronghold._tcp.` (same service type the Android shell registers via NSD).
// NetServiceBrowser is deprecated on newer OSes but is the only API on iOS 15
// that hands over resolved IPv4 addresses without extra dance.

import Foundation

final class LanBrowser: NSObject, NetServiceBrowserDelegate, NetServiceDelegate {

    struct Host: Equatable {
        let name: String
        let host: String
        let port: Int
    }

    private let browser = NetServiceBrowser()
    private var pending: [NetService] = []
    private var hosts: [Host] = []
    var onHosts: (([Host]) -> Void)?
    var onError: ((String) -> Void)?

    func start() {
        browser.delegate = self
        browser.searchForServices(ofType: "_stronghold._tcp.", inDomain: "local.")
        DebugLog.i("bonjour", "search started")
    }

    func stop() {
        browser.stop()
        pending.removeAll()
        hosts.removeAll()
    }

    func netServiceBrowser(_ browser: NetServiceBrowser, didNotStartBrowsingForDomain errorDict: [String: NSNumber]) {
        // denied local-network permission / blocked multicast — without this the
        // join alert claims to be searching forever
        DebugLog.e("bonjour", "browse failed to start: \(errorDict)")
        DispatchQueue.main.async { [weak self] in
            self?.onError?("搜索失败：请允许「本地网络」权限，或手动输入房主地址")
        }
    }

    func netServiceBrowser(_ browser: NetServiceBrowser, didFind service: NetService, moreComing: Bool) {
        DebugLog.i("bonjour", "found: \(service.name)")
        service.delegate = self
        pending.append(service)
        service.resolve(withTimeout: 5)
    }

    func netServiceBrowser(_ browser: NetServiceBrowser, didRemove service: NetService, moreComing: Bool) {
        hosts.removeAll { $0.name == service.name }
        publish()
    }

    func netServiceDidResolveAddress(_ service: NetService) {
        pending.removeAll { $0 === service }
        var ip: String?
        for data in service.addresses ?? [] {
            if let v4 = Self.ipv4(from: data) { ip = v4; break }
        }
        guard let ip, service.port > 0 else { return }
        hosts.removeAll { $0.name == service.name }
        hosts.append(Host(name: service.name, host: ip, port: service.port))
        DebugLog.i("bonjour", "resolved: \(service.name) -> \(ip):\(service.port)")
        publish()
    }

    func netService(_ sender: NetService, didNotResolve errorDict: [String: NSNumber]) {
        pending.removeAll { $0 === sender }
    }

    private func publish() {
        let snapshot = hosts
        DispatchQueue.main.async { [weak self] in
            self?.onHosts?(snapshot)
        }
    }

    private static func ipv4(from data: Data) -> String? {
        let bytes = [UInt8](data)
        guard bytes.count >= 16 else { return nil }
        // struct sockaddr_in on iOS: sa_len (0), sa_family (1), sin_port (2..3), sin_addr (4..7)
        guard bytes[1] == UInt8(AF_INET) else { return nil }
        return bytes[4...7].map { String($0) }.joined(separator: ".")
    }
}
