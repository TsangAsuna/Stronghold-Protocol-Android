// AppDelegate.swift — window + root view controller setup.

import AVFoundation
import UIKit

/// Last-resort crash capture: everything lands in Documents/logs/crash.log so a
/// device crash report survives to be read from the Files app (no Mac needed).
enum CrashLog {
    static func install() {
        NSSetUncaughtExceptionHandler { exception in
            let text = """
            \n==== \(Date()) NSException ====
            \(exception.name.rawValue): \(exception.reason ?? "?")
            \(exception.callStackSymbols.joined(separator: "\n"))
            """
            try? text.write(to: DebugLog.shared.logDir.appendingPathComponent("crash.log"), atomically: true, encoding: .utf8)
        }
        for sig in [SIGABRT, SIGSEGV, SIGBUS, SIGILL, SIGFPE, SIGTRAP] {
            signal(sig) { s in
                let text = "\n==== \(Date()) signal \(s) ====\n"
                try? text.write(to: DebugLog.shared.logDir.appendingPathComponent("crash.log"), atomically: true, encoding: .utf8)
                signal(s, SIG_DFL)
                raise(s)
            }
        }
    }
}

final class AppDelegate: NSObject, UIApplicationDelegate {

    var window: UIWindow?

    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        CrashLog.install()
        DebugLog.i("app", "==== Stronghold Protocol iOS \(Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "?") ====")
        let window = UIWindow(frame: UIScreen.main.bounds)
        window.backgroundColor = UIColor(red: 0.043, green: 0.063, blue: 0.075, alpha: 1)
        window.rootViewController = HomeViewController()
        window.makeKeyAndVisible()
        self.window = window
        return true
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // after the window is up — never during launch (a throw here would white-screen)
        try? AVAudioSession.sharedInstance().setCategory(.playback, options: [.mixWithOthers])
        try? AVAudioSession.sharedInstance().setActive(true)
    }

    // iPad / iPhone: the game is landscape-first but adapts itself — the plist
    // constrains the actual set; allow everything here to keep them in sync.
    func application(
        _ application: UIApplication,
        supportedInterfaceOrientationsFor window: UIWindow?
    ) -> UIInterfaceOrientationMask {
        return .all
    }
}
