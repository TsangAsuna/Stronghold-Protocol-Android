// HostAdvertiser.swift — publishes `_stronghold._tcp.` via Bonjour while this
// device hosts a room, so Android/PC/iOS guests can discover it (same service
// type as the Android shell's NSD registration).

import Foundation
import UIKit

final class HostAdvertiser: NSObject, NetServiceDelegate {

    static let shared = HostAdvertiser()
    private var service: NetService?

    func start(port: Int) {
        stop()
        let name = "卫戍协议·" + UIDevice.current.name
        let service = NetService(domain: "", type: "_stronghold._tcp.", name: name, port: Int32(port))
        service.delegate = self
        service.publish()
        self.service = service
        DebugLog.i("bonjour", "publishing: \(name):\(port)")
    }

    func stop() {
        service?.stop()
        service = nil
    }

    func netService(_ sender: NetService, didNotPublish errorDict: [String: NSNumber]) {
        DebugLog.e("bonjour", "publish failed: \(errorDict)")
    }

    func netServiceDidPublish(_ sender: NetService) {
        DebugLog.i("bonjour", "published: \(sender.name):\(sender.port)")
    }
}
