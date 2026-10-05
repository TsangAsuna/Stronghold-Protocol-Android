// AppDelegate.swift — window + root view controller setup.

import AVFoundation
import UIKit

final class AppDelegate: NSObject, UIApplicationDelegate {

    var window: UIWindow?

    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        DebugLog.i("app", "==== Stronghold Protocol iOS \(Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "?") ====")
        // BGM/SFX must play even with the silent switch on (Android behaviour)
        try? AVAudioSession.sharedInstance().setCategory(.playback, options: [.mixWithOthers])
        try? AVAudioSession.sharedInstance().setActive(true)
        let window = UIWindow(frame: UIScreen.main.bounds)
        window.backgroundColor = UIColor(red: 0.043, green: 0.063, blue: 0.075, alpha: 1)
        window.rootViewController = HomeViewController()
        window.makeKeyAndVisible()
        self.window = window
        return true
    }

    // iPad / iPhone: the game is landscape-first but adapts itself — allow all orientations.
    func application(
        _ application: UIApplication,
        supportedInterfaceOrientationsFor window: UIWindow?
    ) -> UIInterfaceOrientationMask {
        return .allButUpsideDown
    }
}
