// SilentAudioKeeper.swift — keeps the process alive in the background while
// hosting. iOS suspends backgrounded apps within seconds unless they play
// audible audio with the `audio` background mode; a looping silent track with
// an active .playback session counts, so the embedded server keeps serving
// friends while the user reads something else (or plays in Safari/Reynard).

import AVFoundation

final class SilentAudioKeeper {

    static let shared = SilentAudioKeeper()
    private var player: AVAudioPlayer?

    func start() {
        guard player == nil else { return }
        // 1 s of true silence (Int16 zeros), generated in memory
        let sampleRate = 44_100
        let frames = sampleRate
        var pcm = Data(capacity: frames * 2)
        for _ in 0..<frames {
            pcm.append(contentsOf: [0x00, 0x00])
        }
        let wav = Self.wavContainer(pcm: pcm, sampleRate: sampleRate)
        do {
            let player = try AVAudioPlayer(data: wav, fileTypeHint: "wav")
            player.numberOfLoops = -1
            player.volume = 1.0 // silent samples; the session is what matters
            player.prepareToPlay()
            player.play()
            self.player = player
            DebugLog.i("keepalive", "silent audio keeper started")
        } catch {
            DebugLog.e("keepalive", "failed to start: \(error)")
        }
    }

    func stop() {
        player?.stop()
        player = nil
        DebugLog.i("keepalive", "silent audio keeper stopped")
    }

    private static func wavContainer(pcm: Data, sampleRate: Int) -> Data {
        var out = Data()
        let channels: UInt16 = 1
        let bits: UInt16 = 16
        let byteRate = UInt32(sampleRate) * UInt32(channels) * UInt32(bits / 8)
        func le32(_ v: UInt32) -> [UInt8] { [UInt8(v & 0xff), UInt8((v >> 8) & 0xff), UInt8((v >> 16) & 0xff), UInt8((v >> 24) & 0xff)] }
        func le16(_ v: UInt16) -> [UInt8] { [UInt8(v & 0xff), UInt8((v >> 8) & 0xff)] }
        out.append(contentsOf: Array("RIFF".utf8))
        out.append(contentsOf: le32(UInt32(36 + pcm.count)))
        out.append(contentsOf: Array("WAVE".utf8))
        out.append(contentsOf: Array("fmt ".utf8))
        out.append(contentsOf: le32(16))
        out.append(contentsOf: le16(1)) // PCM
        out.append(contentsOf: le16(channels))
        out.append(contentsOf: le32(UInt32(sampleRate)))
        out.append(contentsOf: le32(byteRate))
        out.append(contentsOf: le16(UInt16(channels * bits / 8)))
        out.append(contentsOf: le16(bits))
        out.append(contentsOf: Array("data".utf8))
        out.append(contentsOf: le32(UInt32(pcm.count)))
        out.append(pcm)
        return out
    }
}
