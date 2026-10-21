import Foundation
import HTTPTypes
import OpenAPIRuntime

public struct BearerMiddleware: ClientMiddleware {
    private let token: @Sendable () async -> String?
    private let clientVersion: String

    public init(clientVersion: String, token: @escaping @Sendable () async -> String?) {
        self.clientVersion = clientVersion
        self.token = token
    }

    public func intercept(
        _ request: HTTPRequest,
        body: HTTPBody?,
        baseURL: URL,
        operationID: String,
        next: @Sendable (HTTPRequest, HTTPBody?, URL) async throws -> (HTTPResponse, HTTPBody?)
    ) async throws -> (HTTPResponse, HTTPBody?) {
        var request = request
        request.headerFields[HTTPField.Name("X-Client-Version")!] = clientVersion
        if let token = await token() {
            request.headerFields[.authorization] = "Bearer \(token)"
        }
        return try await next(request, body, baseURL)
    }
}
