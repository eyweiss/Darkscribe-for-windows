import ScreenCaptureKit
import CoreMedia
import Accelerate
import Foundation

// AudioCapture — ScreenCaptureKit system audio → stdout (raw Int16 PCM, 24kHz, mono)
//
// Protocol: raw little-endian Int16 bytes written to stdout.
// No framing headers — Electron accumulates bytes into fixed 100ms chunks (4800 bytes).
//
// Shutdown: close stdin (Electron closes it on audio:stop). The process exits cleanly.

// Keep stream alive at module scope — if stored as a local, ARC deallocates it
// and the SCStreamDelegate callbacks never fire.
var activeStream: SCStream?

class AudioDelegate: NSObject, SCStreamDelegate, SCStreamOutput {
    // Pre-allocated conversion buffer — reused each callback to avoid per-chunk alloc
    private var convBuffer: [Int16] = []

    func stream(
        _ stream: SCStream,
        didOutputSampleBuffer sampleBuffer: CMSampleBuffer,
        of outputType: SCStreamOutputType
    ) {
        guard outputType == .audio else { return }

        // Extract AudioBufferList from CMSampleBuffer
        var bufferList = AudioBufferList()
        var blockBuffer: CMBlockBuffer?

        let status = CMSampleBufferGetAudioBufferListWithRetainedBlockBuffer(
            sampleBuffer,
            bufferListSizeNeededOut: nil,
            bufferListOut: &bufferList,
            bufferListSize: MemoryLayout<AudioBufferList>.size,
            blockBufferAllocator: nil,
            blockBufferMemoryAllocator: nil,
            flags: kCMSampleBufferFlag_AudioBufferList_Assure16ByteAlignment,
            blockBufferOut: &blockBuffer
        )

        // blockBuffer is managed by ARC in Swift — no manual CFRelease needed

        guard status == noErr,
              let dataPtr = bufferList.mBuffers.mData else { return }

        let byteCount = Int(bufferList.mBuffers.mDataByteSize)
        let frameCount = byteCount / MemoryLayout<Float>.size

        guard frameCount > 0 else { return }

        let floatPtr = dataPtr.bindMemory(to: Float.self, capacity: frameCount)

        // Grow conversion buffer only when needed
        if convBuffer.count < frameCount {
            convBuffer = [Int16](repeating: 0, count: frameCount)
        }

        // vDSP vectorized Float32 → Int16 conversion using Accelerate SIMD
        // vDSP_vsmul:  scaled[i] = floatPtr[i] * 32767.0
        // vDSP_vfix16: convBuffer[i] = Int16(scaled[i])  (with rounding + clamp)
        var scale: Float = 32767.0
        var scaled = [Float](repeating: 0, count: frameCount)
        vDSP_vsmul(floatPtr, 1, &scale, &scaled, 1, vDSP_Length(frameCount))
        vDSP_vfix16(&scaled, 1, &convBuffer, 1, vDSP_Length(frameCount))

        // Write raw Int16 bytes to stdout — Electron reads via child_process pipe
        convBuffer.withUnsafeBytes { ptr in
            let data = Data(bytes: ptr.baseAddress!, count: frameCount * MemoryLayout<Int16>.size)
            FileHandle.standardOutput.write(data)
        }
    }

    func stream(_ stream: SCStream, didStopWithError error: Error) {
        fputs("[AudioCapture] Stream stopped: \(error.localizedDescription)\n", stderr)
        exit(1)
    }
}

// MARK: - Main

let delegate = AudioDelegate()
let startSemaphore = DispatchSemaphore(value: 0)

SCShareableContent.getWithCompletionHandler { content, error in
    if let error = error {
        fputs("[AudioCapture] Permission denied or error: \(error.localizedDescription)\n", stderr)
        exit(1)
    }

    guard let content = content, let display = content.displays.first else {
        fputs("[AudioCapture] No display found\n", stderr)
        exit(1)
    }

    // Capture all system audio — no app exclusions
    let filter = SCContentFilter(
        display: display,
        excludingApplications: [],
        exceptingWindows: []
    )

    let config = SCStreamConfiguration()
    config.capturesAudio = true
    config.sampleRate = 24000     // OpenAI Realtime API requirement
    config.channelCount = 1       // Mono

    // Set minimal video dimensions — we only want audio, but SCStream requires a video config
    config.width = 2
    config.height = 2
    config.minimumFrameInterval = CMTime(value: 1, timescale: 1)  // 1 fps

    let stream = SCStream(filter: filter, configuration: config, delegate: delegate)
    activeStream = stream  // Retain at module scope — critical to keep alive

    do {
        try stream.addStreamOutput(
            delegate,
            type: .audio,
            sampleHandlerQueue: DispatchQueue.global(qos: .userInteractive)
        )
    } catch {
        fputs("[AudioCapture] addStreamOutput failed: \(error.localizedDescription)\n", stderr)
        exit(1)
    }

    stream.startCapture { error in
        if let error = error {
            fputs("[AudioCapture] startCapture failed: \(error.localizedDescription)\n", stderr)
            exit(1)
        }
        fputs("[AudioCapture] Capture started\n", stderr)
        startSemaphore.signal()
    }
}

startSemaphore.wait()

// Block until Electron closes stdin (audio:stop IPC → captureProcess.stdin.end())
// This is the clean shutdown signal — do not use SIGKILL
FileHandle.standardInput.readDataToEndOfFile()

fputs("[AudioCapture] Stdin closed, exiting\n", stderr)
activeStream?.stopCapture { _ in }
activeStream = nil
exit(0)
