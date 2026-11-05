# integrationApp

A **Dynamic Island for your desktop**: a small black pill at the top of the screen for **Spotify**, **YouTube Music** and **Discord**.

- **The pill** shows the icon and what is playing (with a little equaliser), whichever of Spotify or YouTube Music started last. When nothing plays it shows **Discord** and how many new messages there are.
- **Hover, click or drag it down** and it opens into **three tabs** (Spotify · YouTube Music · Discord) with what is playing and its controls, or Discord's latest messages and whether your profile shows what you play.
- **Open it further** (drag down again, or ⌄) for the full player (queue, search, library with playlists to open and shuffle, devices, likes, the DJ) or your Discord channels.
- **Cover the whole screen** (⛶) with any of the three: the music's full view (the cover as a card that tilts toward the mouse), DJ mode, or Discord.
- **Pin** keeps it open; **drag up**, **Esc**, the pill button, or clicking elsewhere closes it.

## Set-up happens in your browser

Anything not connected yet shows a **Set up** button in the island; it opens a guide in your browser (also from the tray icon, and on first start). The guides connect each service and hand the result to the app:

- **Spotify**: an app of your own in the Spotify developer dashboard, with the redirect address `http://127.0.0.1:43210/spotify/callback`; you then sign in on Spotify's own page in your browser (its Google / Apple buttons work there). Add your Spotify account under the app's *User Management*.
- **YouTube Music**: a Google *Web application* client with `http://localhost:43210` as an authorized JavaScript origin; sign in on the guide (read-only) to bring in your playlists and liked songs.
- **Discord**: one Discord application of your own for three optional things. **Rich Presence** (its Application ID) shows *Listening to* on your profile through the Discord app. **Messages**: Discord does not let apps read your own messages or DMs, so a **bot** of yours (token, *Message Content* intent, invited to your server) reads the channels you pick, and the island shows the latest. **Share**: a channel webhook for the *Share to Discord* buttons.

The guides and sign-ins are served by the app on this computer only (`127.0.0.1` / `localhost`, port 43210). Sign-ins stay on this computer; the bot token is encrypted with the system keychain where there is one.

**Playback** happens on your Spotify devices (phone, the Spotify app, a web player); the island controls them. Controlling playback needs Spotify Premium. YouTube Music plays in YouTube's own player inside the island.

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

Installers go to `dist/`. They are unsigned, so Windows SmartScreen and macOS Gatekeeper will ask before the first launch.

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
app/nowplaying.js    the player (Spotify, the full view, DJ mode); app/ytmusic.js: YouTube Music
app/guide/           the set-up guides
```

## Checks

```sh
npm test
npm run check
```
