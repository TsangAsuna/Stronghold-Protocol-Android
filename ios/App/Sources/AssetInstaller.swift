// AssetInstaller.swift — first-run copy of the packed nodejs-project from the
// app bundle to Documents/node. iOS bundles are read-only and the server needs
// a writable directory; unlike Android there are no zips here — the resources
// ship as a real folder (folder reference) and get copied verbatim. A copy is
// skipped while the recorded bundle version matches; app updates re-copy once.

import Foundation

enum AssetInstaller {

    private static var nodeRoot: URL { NodeRuntime.documentsNodeRoot }

    static var bundledProjectURL: URL? {
        // folder reference keeps the directory structure: Bundle/nodejs-project/…
        Bundle.main.url(forResource: "nodejs-project", withExtension: nil)
    }

    private static var installedVersion: String? {
        UserDefaults.standard.string(forKey: "installed_bundle_version")
    }

    static func isInstalled() -> Bool {
        let current = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "0"
        guard installedVersion == current,
              FileManager.default.fileExists(atPath: nodeRoot.appendingPathComponent("server/index.js").path),
              FileManager.default.fileExists(atPath: nodeRoot.appendingPathComponent("public/index.html").path),
              FileManager.default.fileExists(atPath: nodeRoot.appendingPathComponent("node_modules/ws/index.js").path)
        else { return false }
        return true
    }

    /** Copy synchronously; call on a worker thread. Reports (doneItems, approxTotal). */
    static func install(onProgress: @escaping (Int, Int) -> Void) throws {
        guard let src = bundledProjectURL else {
            throw NSError(domain: "AssetInstaller", code: 1,
                          userInfo: [NSLocalizedDescriptionKey: "bundle 内缺少 nodejs-project 资源（先运行 scripts/pack-ios.mjs）"])
        }
        let fm = FileManager.default
        let tmp = nodeRoot.deletingLastPathComponent().appendingPathComponent("node-staging")
        try? fm.removeItem(at: tmp)
        try fm.createDirectory(at: tmp, withIntermediateDirectories: true)

        let items = fm.enumerator(at: src, includingPropertiesForKeys: [.isRegularFileKey])?.allObjects ?? []
        let total = max(items.count, 1)
        var done = 0

        for case let file as URL in items {
            let rel = file.path.relativePath(from: src)
            let dest = tmp.appendingPathComponent(rel)
            let isDir = (try? file.resourceValues(forKeys: [.isRegularFileKey]))?.isRegularFile == false
            if isDir {
                try fm.createDirectory(at: dest, withIntermediateDirectories: true)
            } else {
                try fm.createDirectory(at: dest.deletingLastPathComponent(), withIntermediateDirectories: true)
                try? fm.removeItem(at: dest)
                try fm.copyItem(at: file, to: dest)
            }
            done += 1
            if done % 100 == 0 { onProgress(done, total) }
        }
        onProgress(done, total)

        // swap
        if fm.fileExists(atPath: nodeRoot.path) {
            try fm.removeItem(at: nodeRoot)
        }
        try fm.moveItem(at: tmp, to: nodeRoot)

        let version = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "0"
        UserDefaults.standard.set(version, forKey: "installed_bundle_version")
        DebugLog.i("install", "nodejs-project copied: \(done) items")
    }
}

private extension String {
    func relativePath(from base: URL) -> String {
        let prefix = base.path + "/"
        return hasPrefix(prefix) ? String(dropFirst(prefix.count)) : self
    }
}
