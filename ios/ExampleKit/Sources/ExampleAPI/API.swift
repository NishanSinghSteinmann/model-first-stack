import Foundation
import OpenAPIURLSession

public enum API {
    public static func client(config: AppConfig, version: String = Self.appVersion, token: @escaping @Sendable () async -> String?) -> Client {
        Client(
            serverURL: config.apiURL,
            transport: URLSessionTransport(),
            middlewares: [BearerMiddleware(clientVersion: "ios/\(version)", token: token)]
        )
    }

    public static var appVersion: String {
        Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "0.0.0"
    }

    public static func idempotencyKey() -> String {
        UUID().uuidString
    }
}
