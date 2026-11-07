# Discord personal integration

Astrum currently uses desktop RPC for Rich Presence, webhooks for track sharing, and an optional bot for a server-message feed. These do not authorize personal messaging or voice controls.

## Verified locally

Run `npm run discord:check` with Discord open. This reads Astrum's saved application ID, opens a separate desktop RPC connection, and checks friends and voice-settings access. It does not send messages, change voice settings, set activity, or persist personal data. Output contains capability booleans and numeric error codes only.

The November 7, 2026 check connected successfully. Friends and voice settings both returned code `4006` (not authenticated). This verifies transport, not Social SDK eligibility or account authorization. An unauthenticated failure does not establish that an authorized integration is impossible.

## Social SDK prototype

The official 1.10.19337 C++ SDK has been extracted locally into ignored `dist/discord-sdk`. The Windows x64 helper builds with `npm run discord:build:win`; it requires Visual Studio C++ tools. Only headers, the import library, and the release runtime are extracted. The helper and runtime are about 10 MB together. SDK binaries are not committed to Git.

The live SDK test completed authorization, token exchange, and connection, and returned 22 Discord friends. The Friends section in both Discord views now uses this integration. It shows names and online/offline/idle status, sorts online friends first, and offers Connect account / Disconnect. Authorization and token exchange happen inside the native helper with PKCE. Tokens and friend data are not persisted. Disconnecting or quitting ends the helper and clears the in-app list; restarting requires connecting again. Friends are only sent to the island window, not setup pages.

This is a local Windows prototype, not an installer release. Packaged distributions and macOS need their own SDK runtime build and packaging validation. Missing helpers produce an explicit setup error.

## Custom overlay workspace

The Discord tab now opens a custom Friends & chats workspace. **Open overlay** expands the workspace using Astrum's existing full-screen window; the header brings it back to the tablet. Server feed remains a separate optional view.

The next connection requests `openid sdk.social_layer`, adding Discord's communication permissions. The sidebar combines friends with the SDK's conversation summaries. Selecting someone requests up to 50 recent messages; incoming SDK events refresh the selected conversation. History availability is constrained by the SDK (including its requirement that both users have used the application). This is not the complete Discord inbox.

The expanded communications authorization was verified live on November 7: the SDK connected, returned 22 friends, and returned zero conversation summaries. A read-only history request returned HTTP 404; Astrum displayed the SDK history-availability explanation. No messages were sent and no voice rooms were joined during that check.

Messages are sent only through the user's Send action. Drafts stay separate per recipient and clear only after success; failure preserves the draft. Ambiguous timeouts do not trigger automatic retries. Rate-limit responses stop further requests until the indicated delay passes. Unsupported content can open in Discord using the SDK's supported handoff. Remote names and messages are rendered as text.

Voice uses SDK app-managed lobbies. **Create room** generates a private random join code; another Astrum user can paste it under **Join**. Codes are shared manually, never sent to anyone automatically. New calls start muted and expose Unmute, Deafen, Leave, and participant names. These rooms do not represent existing Discord group calls or arbitrary server voice channels. The expanded workspace, messaging failures, drafts, and voice command flow are checked with simulated responses. Real message delivery and voice audio require user-directed live testing; no test messages or calls are sent automatically.

## Setup on another machine

Follow Discord's official [C++ getting-started guide](https://docs.discord.com/developers/discord-social-sdk/getting-started/using-c%2B%2B):

1. Open the Discord application configured in Astrum in the developer portal. The SDK guide requires an application assigned to a developer team.
2. Under **Discord Social SDK → Getting Started**, complete the setup using an accurate description of Astrum. Discord's documentation and release requirements target games; support for a desktop companion is not established by the local probe.
3. Download the official **C++ Social SDK** under **Downloads**. Its headers and runtime binaries are not included in this repository; extract them into `dist/discord-sdk` or pass `-SdkPath` to `scripts/build-discord-social.ps1`.
4. For the initial local prototype, the guide requires **OAuth2 → Public Client** enabled, and `http://127.0.0.1/callback` as the redirect URL. The native SDK should handle authorization with PKCE and token exchange; do not ship a client secret in the desktop app.

The first verified connection used `openid sdk.social_layer_presence`. The custom workspace now requests `openid sdk.social_layer` for the messaging and voice controls. Existing Rich Presence and the server feed remain independent.

## Scope of later work

Discord's [communication features](https://docs.discord.com/developers/discord-social-sdk/core-concepts/communication-features) include one-to-one DMs, app-managed lobby voice, and linked server channels. Production communications have additional requirements and review. Existing group DMs, arbitrary existing calls, linked server chat, and complete native-overlay parity are not implemented.

`npm run discord:check` remains a separate unauthenticated RPC diagnostic. Its 4006 result does not contradict the successfully authenticated Social SDK session.
