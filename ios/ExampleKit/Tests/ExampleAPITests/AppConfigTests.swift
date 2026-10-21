import ExampleAPI
import Foundation
import HTTPTypes
import OpenAPIRuntime
import Testing

@Test func configNeedsHTTPSOutsideLocalhost() {
    #expect(throws: AppConfig.Problem.insecure("APP_API_URL")) {
        try AppConfig(values: ["APP_API_URL": "http://api.example.com", "APP_AUTH_URL": "https://api.example.com/auth/v1"])
    }
    #expect(throws: AppConfig.Problem.missing("APP_AUTH_URL")) {
        try AppConfig(values: ["APP_API_URL": "https://api.example.com"])
    }
}

@Test func bearerIsSetOnlyWithToken() async throws {
    let request = HTTPRequest(method: .get, scheme: "https", authority: "api.test", path: "/livez")
    let base = URL(string: "https://api.test")!
    let echo: @Sendable (HTTPRequest, HTTPBody?, URL) async throws -> (HTTPResponse, HTTPBody?) = { req, _, _ in
        (HTTPResponse(status: .ok, headerFields: [.authorization: req.headerFields[.authorization] ?? "none", HTTPField.Name("X-Client-Version")!: req.headerFields[HTTPField.Name("X-Client-Version")!] ?? "none"]), nil)
    }
    let (with, _) = try await BearerMiddleware(clientVersion: "ios/1.2.3", token: { "abc" }).intercept(request, body: nil, baseURL: base, operationID: "livez", next: echo)
    #expect(with.headerFields[.authorization] == "Bearer abc")
    #expect(with.headerFields[HTTPField.Name("X-Client-Version")!] == "ios/1.2.3")
    let (without, _) = try await BearerMiddleware(clientVersion: "ios/1.2.3", token: { nil }).intercept(request, body: nil, baseURL: base, operationID: "livez", next: echo)
    #expect(without.headerFields[.authorization] == "none")
}
