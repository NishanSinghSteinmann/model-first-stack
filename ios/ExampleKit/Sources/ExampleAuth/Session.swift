import Auth
import Foundation

public final class Session: Sendable {
    private let client: AuthClient

    public init(authURL: URL) {
        client = AuthClient(url: authURL, localStorage: KeychainLocalStorage(), logger: nil)
    }

    public func token() async -> String? {
        try? await client.session.accessToken
    }

    public var isGuest: Bool {
        get async { (try? await client.session.user.isAnonymous) ?? false }
    }

    public func guest() async throws {
        _ = try await client.signInAnonymously()
    }

    public func sendEmailCode(to email: String) async throws {
        try await client.signInWithOTP(email: email, shouldCreateUser: true)
    }

    public func verifyEmailCode(_ code: String, for email: String) async throws {
        _ = try await client.verifyOTP(email: email, token: code, type: .email)
    }

    public func apple(idToken: String, nonce: String) async throws {
        _ = try await client.signInWithIdToken(credentials: OpenIDConnectCredentials(provider: .apple, idToken: idToken, nonce: nonce))
    }

    public func google(idToken: String, accessToken: String) async throws {
        _ = try await client.signInWithIdToken(credentials: OpenIDConnectCredentials(provider: .google, idToken: idToken, accessToken: accessToken))
    }

    public func signOut() async throws {
        try await client.signOut()
    }
}
