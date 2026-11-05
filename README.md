# Astrum

A **Dynamic Island for your desktop**: a small black pill at the top of the screen for **Spotify**, **YouTube** and **Discord**.

- **The pill** shows the icon and what is playing (with a little equaliser), whichever of Spotify or YouTube started last. When nothing plays it shows **Discord** and how many new messages there are.
- **Hover, click or drag it down** and it opens into **three tabs** (Spotify · YouTube · Discord) with what is playing and its controls, or Discord's latest messages and whether your profile shows what you play.
- **Open it further** (drag down again, or ⌄) for the full player (queue, search, library with playlists to open and shuffle, devices, likes, the DJ) or your Discord channels.
- **Cover the whole screen** (⛶) with any of the three: the music's full view (the cover as a card that tilts toward the mouse), DJ mode, or Discord.
- **Drag up**, press **Esc**, or use the close button to return to the smaller view.

## Set-up happens in your browser

Anything not connected yet shows a **Set up** button in the island; it opens a guide in your browser (also from the tray icon, and on first start). The guides connect each service and hand the result to the app:

- **Spotify**: an app of your own in the Spotify developer dashboard, with the redirect address `http://127.0.0.1:43210/spotify/callback`; you then sign in on Spotify's own page in your browser (its Google / Apple buttons work there). Add your Spotify account under the app's *User Management*.
- **YouTube** uses a Google *Web application* client with `http://localhost:43210` as an authorized JavaScript origin. Sign in through the guide for video search, playlists, liked videos, and Discover. Discover shows popular videos and mixes from your likes because the Data API does not expose your personal YouTube Home feed.
- **Discord**: one Discord application of your own for three optional things. **Rich Presence** (its Application ID) shows *Listening to* on your profile through the Discord app. **Messages**: Discord does not let apps read your own messages or DMs, so a **bot** of yours (token, *Message Content* intent, invited to your server) reads the channels you pick, and the island shows the latest. **Share**: a channel webhook for the *Share to Discord* buttons.

The guides and sign-ins are served by the app on this computer only (`127.0.0.1` / `localhost`, port 43210). Sign-ins stay on this computer; the bot token is encrypted with the system keychain where there is one.

In **Spotify → Devices**, select a Spotify Connect player to move playback. To use your computer’s audio, open Spotify on the computer, refresh the device list, and select its desktop app or web player. Playback controls require Spotify Premium.

In **YouTube → Search**, paste a video link to watch it without signing in. The expanded player fills the viewing area. Use **Back to tablet** or drag the bottom handle up to shrink it. Some videos can only be watched on YouTube.

Lower **Settings → Full-screen backdrop** to see more of the desktop behind Spotify and Discord.

## Run it

Requires Node.js 20 or newer.

```sh
npm install
npm start
```

## Build installers

```sh
npm run dist:win     # Windows: installer and portable .exe
npm run dist:mac     # macOS: .dmg (build on a Mac)
npm run dist:linux   # Linux: AppImage
```

Installers go to `dist/`. The setup page detects the Windows installer when Astrum runs from this checkout. The default builds are unsigned. On a Mac, run Astrum from source with `npm ci` and `npm start`, or build a DMG on that Mac.

Run **Test desktop installers** in GitHub Actions to build and smoke-test a Windows x64 installer and separate DMGs for Apple silicon and Intel. Successful runs attach test artifacts. The workflow does not publish them as releases. For public distribution, configure GitHub Actions signing secrets. A supported Windows signing certificate uses `WIN_CSC_LINK` and `WIN_CSC_KEY_PASSWORD`. macOS uses a Developer ID Application certificate (`MAC_CSC_LINK`, `MAC_CSC_KEY_PASSWORD`) and App Store Connect notarization credentials (`APPLE_API_KEY_B64`, `APPLE_API_KEY_ID`, `APPLE_API_ISSUER`). The Mac test builds use ad-hoc signing when those credentials are absent. [Electron Builder signing documentation](https://www.electron.build/docs/features/code-signing/)

## Host the product page on Dokploy

1. Commit and push this checkout to GitHub, including the new `deploy/` files and the landing page assets. Verify that `deploy/Dockerfile` appears on the branch in GitHub. Publish a GitHub Release tagged `v1.0.0` with the Windows installer attached as `Astrum-Setup-1.0.0.exe`. Use `dist/Astrum Setup 1.0.0.exe` from the verified build and rename the upload copy. The installer is unsigned.
2. In Dokploy, create an **Application** and select **GitHub**. Choose `GaryMcflarry/intergrationApp`, branch `main` or the branch you pushed, and **Build Path** `/`.
3. Set **Build Type** to `Dockerfile`, **Dockerfile Path** to `deploy/Dockerfile`, and **Docker Context Path** to `.`. In **Environment**, turn off **Create Environment File** and leave runtime variables empty. Leave **Docker Build Stage** empty. Deploy after the release asset is publicly downloadable.
4. Point your domain's DNS at your Dokploy server. In **Domains**, enter the hostname, set **Path** to `/` and **Container Port** to `8080`, then enable **HTTPS** with **Let's Encrypt**. Open the domain and test **Download for Windows**.

The container serves the product page, public setup instructions, and a checksum-verified installer at `/download/windows`. The page uses relative links, so a Dokploy domain variable is unnecessary. Account connections and OAuth callbacks use the desktop app on each computer. For a different installer, set `ASTRUM_WINDOWS_URL` and `ASTRUM_WINDOWS_SHA256` under Dokploy **Build Arguments** before redeploying. The URL must be an HTTPS download that the build server can access without credentials. Use the checksum of the exact file you upload, for example `Get-FileHash -Algorithm SHA256` on Windows.

[Dokploy build settings](https://docs.dokploy.com/docs/core/applications/build-type) · [Domain setup](https://docs.dokploy.com/docs/core/domains)

## Layout

```text
main.js              the app: the island window, the tray, guides in the browser, sign-ins, Discord
preload.js           what the island may ask of the app
lib/server.js        serves app/ on 127.0.0.1 and localhost, port 43210 (and hands /api, /spotify to lib/api.js)
lib/api.js           the local API the guide pages use
lib/spotify-auth.js  Spotify sign-in through your browser (PKCE)
lib/discord.js       Rich Presence and webhook sharing
lib/discordbot.js    the latest messages from your channels, through your bot
lib/store.js         settings and sign-ins (a JSON file in the app's data folder)
app/island.html      the island
app/nowplaying.js    the player (Spotify, the full view, DJ mode); app/ytmusic.js: YouTube
app/guide/           the set-up guides
```

## Checks

```sh
npm test
npm run check
```
