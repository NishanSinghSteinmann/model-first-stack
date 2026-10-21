// swift-tools-version: 6.2
import PackageDescription

let package = Package(
    name: "ExampleKit",
    platforms: [.iOS(.v26), .macOS(.v15)],
    products: [
        .library(name: "ExampleAPI", targets: ["ExampleAPI"]),
        .library(name: "ExampleAuth", targets: ["ExampleAuth"]),
        .library(name: "ExampleDesign", targets: ["ExampleDesign"]),
    ],
    dependencies: [
        .package(url: "https://github.com/apple/swift-openapi-generator", from: "1.14.0"),
        .package(url: "https://github.com/apple/swift-openapi-runtime", from: "1.13.0"),
        .package(url: "https://github.com/apple/swift-openapi-urlsession", from: "1.3.0"),
        .package(url: "https://github.com/supabase/supabase-swift", from: "2.55.0"),
    ],
    targets: [
        .target(
            name: "ExampleAPI",
            dependencies: [
                .product(name: "OpenAPIRuntime", package: "swift-openapi-runtime"),
                .product(name: "OpenAPIURLSession", package: "swift-openapi-urlsession"),
            ],
            plugins: [.plugin(name: "OpenAPIGenerator", package: "swift-openapi-generator")]
        ),
        .target(name: "ExampleAuth", dependencies: [.product(name: "Auth", package: "supabase-swift")]),
        .target(name: "ExampleDesign"),
        .testTarget(name: "ExampleAPITests", dependencies: ["ExampleAPI"]),
    ]
)
