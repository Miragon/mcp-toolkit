import { randomUUID } from "node:crypto"
import type { OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js"
import type {
  OAuthClientInformationMixed,
  OAuthClientMetadata,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js"

export interface ServerSideOAuthProviderOptions {
  callbackUrl: string
  clientName?: string
}

/**
 * Server-side OAuth client provider that never opens a browser.
 *
 * The MCP SDK's `auth()` helper calls `redirectToAuthorization()` to hand the
 * user off to their IdP. On a headless server we can't do that, so this
 * provider captures the URL instead. The caller surfaces it to the end user
 * (e.g. via an MCP tool response), the user opens it in a browser, and the
 * resulting redirect lands on a callback route that calls `auth()` a second
 * time with the returned authorization code.
 */
export class ServerSideOAuthProvider implements OAuthClientProvider {
  private _tokens?: OAuthTokens
  private _clientInformation?: OAuthClientInformationMixed
  private _codeVerifier?: string
  private _authorizationUrl?: URL

  private readonly callbackUrl: string
  private readonly clientName: string

  constructor(options: ServerSideOAuthProviderOptions) {
    this.callbackUrl = options.callbackUrl
    this.clientName = options.clientName ?? "MCP Proxy"
  }

  get redirectUrl(): string {
    return this.callbackUrl
  }

  get clientMetadata(): OAuthClientMetadata {
    return {
      // SDK types expect a tuple, but the underlying OAuth spec accepts any
      // non-empty array of redirect URIs.
      redirect_uris: [this.callbackUrl],
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      client_name: this.clientName,
    }
  }

  clientInformation(): OAuthClientInformationMixed | undefined {
    return this._clientInformation
  }

  saveClientInformation(info: OAuthClientInformationMixed): void {
    this._clientInformation = info
  }

  tokens(): OAuthTokens | undefined {
    return this._tokens
  }

  saveTokens(tokens: OAuthTokens): void {
    this._tokens = tokens
  }

  /** Authorization URL captured during the current auth() call. */
  get authorizationUrl(): URL | undefined {
    return this._authorizationUrl
  }

  // Without this, no `state` parameter is appended and upstream servers (e.g.
  // Notion) don't return one in the callback, so we can't look up the pending
  // flow keyed by state.
  state(): string {
    return randomUUID()
  }

  redirectToAuthorization(authorizationUrl: URL): Promise<void> {
    this._authorizationUrl = authorizationUrl
    return Promise.resolve()
  }

  saveCodeVerifier(codeVerifier: string): void {
    this._codeVerifier = codeVerifier
  }

  codeVerifier(): string {
    if (!this._codeVerifier) {
      throw new Error("No code verifier saved")
    }
    return this._codeVerifier
  }
}
