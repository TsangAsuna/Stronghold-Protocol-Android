// DebugLog.swift — on-device file logging (same contract as the Android shell).
// Distribution channels for unsigned ipa builds make console output inaccessible;
// files under Documents/logs/ are the source of truth.

import Foundation

enum LogLevel: String { case info = "I", warn = "W", error = "E" }

final class DebugLog {
    static let shared = DebugLog()

    let logDir: URL
    private let queue = DispatchQueue(label: "sp.debuglog")
    private let fmt: DateFormatter

    var nodeLogURL: URL { logDir.appendingPathComponent("node.log") }

    private init() {
        let docs = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        logDir = docs.appendingPathComponent("logs", isDirectory: true)
        try? FileManager.default.createDirectory(at: logDir, withIntermediateDirectories: true)
        fmt = DateFormatter()
        fmt.dateFormat = "yyyy-MM-dd HH:mm:ss.SSS"
    }

    static func i(_ tag: String, _ msg: String) { shared.write(.info, tag, msg) }
    static func w(_ tag: String, _ msg: String) { shared.write(.warn, tag, msg) }
    static func e(_ tag: String, _ msg: String) { shared.write(.error, tag, msg) }

    /** WebView console (console.log/warn/error from the game) → file. */
    static func console(_ level: String, _ message: String, _ source: String) {
        let lv: LogLevel = (level == "error") ? .error : (level == "warning") ? .warn : .info
        shared.write(lv, "webview", "\(message)  (\(source))")
    }

    private func write(_ level: LogLevel, _ tag: String, _ msg: String) {
        let line = "\(fmt.string(from: Date())) [\(level.rawValue)/\(tag)] \(msg)\n"
        queue.async {
            let url = self.logDir.appendingPathComponent("debug.log")
            if let handle = try? FileHandle(forWritingTo: url) {
                defer { try? handle.close() }
                _ = try? handle.seekToEnd()
                handle.write(line.data(using: .utf8)!)
            } else {
                try? line.data(using: .utf8)!.write(to: url)
            }
        }
    }
}
