import Foundation

public struct AppConfig: Sendable, Equatable {
    public let apiURL: URL
    public let authURL: URL

    public enum Problem: Error, Equatable {
        case missing(String)
        case insecure(String)
    }

    public init(values: [String: Any]) throws {
        apiURL = try Self.url("APP_API_URL", in: values)
        authURL = try Self.url("APP_AUTH_URL", in: values)
    }

    public static func fromBundle(_ bundle: Bundle = .main) throws -> AppConfig {
        try AppConfig(values: bundle.infoDictionary ?? [:])
    }

    private static func url(_ key: String, in values: [String: Any]) throws -> URL {
        guard let raw = values[key] as? String, let url = URL(string: raw), url.host() != nil else {
            throw Problem.missing(key)
        }
        guard url.scheme == "https" || url.host() == "localhost" else {
            throw Problem.insecure(key)
        }
        return url
    }
}
