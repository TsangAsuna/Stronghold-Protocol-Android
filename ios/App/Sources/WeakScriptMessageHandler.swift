// WeakScriptMessageHandler.swift — breaks the WKUserContentController →
// handler retain cycle (the controller strongly retains its handlers, so a
// bare `add(self)` would keep the whole view controller alive forever).

import WebKit

final class WeakScriptMessageHandler: NSObject, WKScriptMessageHandler {

    private weak let target: WKScriptMessageHandler?

    init(_ target: WKScriptMessageHandler) {
        self.target = target
        super.init()
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        target?.userContentController(userContentController, didReceive: message)
    }
}
