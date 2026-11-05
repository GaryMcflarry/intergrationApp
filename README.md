# integrationApp

A desktop music widget for **Spotify** and **YouTube Music**, with **Discord**. It is the music player from the Worlds wallpapers, as an Electron app that sits on your desktop.

- **Spotify**: what is playing, with controls, seek, volume, shuffle, repeat and like; Queue, Search, Library (playlists open so you can pick a song inside, with Play and Shuffle; Liked Songs) and Devices. Each song's ⛶ button opens the **full view**: the cover as a card that tilts toward the mouse, over the whole screen. **DJ mode** finds new songs in a vibe (from your own playlists' genres, a genre and era, or any typed genre) and keeps adding them. Liked songs show a filled heart.
- **YouTube Music**: a tab beside Spotify in the same layout: your liked songs, YouTube's mixes from them, your playlists and search. Starting one pauses the other.
- **Discord**: **Rich Presence** shows *Listening to* the song and artist on your profile, with the cover, the time and a button to open it; **Share to Discord** posts the song to a channel through a webhook.
- **The widget**: a small frameless window that fits the player, always on top if you like, with a tray icon (show / hide, always on top, start with the computer, settings, quit). The full view and DJ mode cover the screen.

## Run it

Requires Node.js 20 or newer.

```sh
npm install
npm start
```

## Set up (once)

Open the tray icon's menu (or the widget's ⚙):

1. **Spotify sign-in**: create an app in the [Spotify developer dashboard](https://developer.spotify.com/dashboard) (tick *Web API*), add the redirect address the page shows (`http://127.0.0.1:43210/spotify.html`), paste its Client ID and sign in. If you use the Worlds wallpapers, add this address to the same Spotify app.
2. **YouTube Music sign-in**: in the Google Cloud console enable *YouTube Data API v3*, add yourself as a test user, create a *Web application* OAuth client with `http://localhost:43210` under *Authorized JavaScript origins*, paste its Client ID and sign in. It is read-only.
3. **Settings → Discord**: for Rich Presence, create an application in the [Discord developer portal](https://discord.com/developers/applications) (its name is what Discord shows, e.g. *Music*) and paste its Application ID; the Discord app must be running on this computer. For sharing, create a channel webhook (Edit Channel → Integrations → Webhooks) and paste its URL.

The app's pages are served on this computer only, at `127.0.0.1:43210` (Spotify's sign-in must return to a `127.0.0.1` address) and `localhost:43210` (where Google allows signing in). Sign-ins stay on this computer.

**Playback** happens on your Spotify devices (phone, the Spotify app, a web player): the app controls them. Playing inside the app itself would need Widevine, which Electron does not include. Playing, skipping and DJ mode need Spotify Premium.

## Build installers

```sh
npm run dist:win     # Windows: installer and portable .exe
npm run dist:mac     # macOS: .dmg (build on a Mac)
npm run dist:linux   # Linux: AppImage
```

Installers go to `dist/`. They are unsigned, so Windows SmartScreen and macOS Gatekeeper will ask before the first launch.

## Layout

```text
main.js           the app: widget window, tray, sign-in windows, settings, Discord
preload.js        what the pages may ask of the app
lib/server.js     serves app/ on 127.0.0.1 and localhost, port 43210
lib/store.js      settings and the values shared between windows (a JSON file in the app's data folder)
lib/discord.js    Rich Presence and webhook sharing
app/              the widget (index.html), the player (nowplaying.js, ytmusic.js), sign-in and settings pages
```

## Checks

```sh
npm test
npm run check
```
