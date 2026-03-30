// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "AudioCapture",
    platforms: [.macOS(.v13)],
    targets: [
        .executableTarget(
            name: "AudioCapture",
            path: "Sources",
            linkerSettings: [
                .linkedFramework("ScreenCaptureKit"),
                .linkedFramework("CoreMedia"),
                .linkedFramework("AVFoundation"),
                .linkedFramework("Accelerate"),
                .linkedFramework("Foundation")
            ]
        )
    ]
)
