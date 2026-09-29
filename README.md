# VimVim Racing

A real-time, multiplayer 2D top-down racing game for 2 to 4 players, running entirely in the browser with no plugins or installations required on the player side.

Built using Node.js and WebSockets on the server, and pure HTML/CSS/JavaScript on the client. Every vehicle, road, and UI element is rendered using standard DOM elements — no HTML Canvas is used anywhere in the codebase.

---

## Table of Contents

1. [What Is This?](#1-what-is-this)
2. [Game Features](#2-game-features)
3. [How to Install and Run the Server](#3-how-to-install-and-run-the-server)
4. [How to Play](#4-how-to-play)
5. [Keyboard Controls](#5-keyboard-controls)
6. [Multiplayer and Networking](#6-multiplayer-and-networking)
7. [Game Modes and Interface Options](#7-game-modes-and-interface-options)
8. [Architecture and Technical Choices](#8-architecture-and-technical-choices)
9. [Project File Structure](#9-project-file-structure)
10. [Audio System](#10-audio-system)
11. [Asset Attributions](#11-asset-attributions)
12. [License](#12-license)

---

## 1. What Is This?

VimVim Racing is a competitive, real-time browser-based racing game. Up to 4 human players race around a circuit simultaneously, each connected from their own computer or browser tab. The host player starts the race once the lobby is filled, and all players race in real time with synchronized lap counting, collision physics, hazards, and power-ups.

If fewer than 4 human players are present, AI-controlled bot vehicles fill the remaining grid slots so that every race always has a full grid.

The game was built as a group project with a hard technical constraint: HTML Canvas is strictly prohibited. All rendering must use standard browser DOM elements and CSS transforms only. This constraint was enforced to demonstrate that complex, high-performance animation is achievable through the DOM without relying on a drawing surface.

---

## 2. Game Features

### Core Racing

- 2D top-down perspective with two hand-crafted race circuits
- Smooth vehicle physics including acceleration, braking, steering, and momentum
- Multi-surface friction: asphalt (full grip), kerbs (reduced grip), and gravel/grass (significantly reduced grip)
- Soft cushion collision bounce between cars: vehicles push apart on impact with a moderate speed penalty rather than grinding to a halt
- Collision sound plays on initial contact only and does not loop during sustained proximity

### Lap and Scoring System

- Configurable lap count: choose 1, 2, 3, 5, 7, or 10 laps from the lobby before the race starts
- Eight-point checkpoint gate system that validates correct circuit direction and prevents shortcutting
- Real-time race position display (1st through 4th) updated every frame
- Best lap time tracking for each player
- Final race standings and winner announcement at the end

### Hazards and Power-Ups

- Oil slick zones: driving over one causes your vehicle to lose traction and spin out briefly
- Boost pad: a pickup item that spawns at a fixed strategic location on the track; collecting it grants a temporary speed boost
- UFO Abduction perk: a rare item that teleports your vehicle forward two checkpoint sectors, skipping road ahead of you
- Rocket perk: fires a projectile forward that causes a spin-out on impact with another vehicle

### AI Opponents

- Bot vehicles use waypoint navigation to follow the racing line autonomously
- Bots participate in all physics and collision systems equally with human players
- Bots also receive perks and item pickups on a timed random interval

### Multiplayer

- Supports 2, 3, or 4 simultaneous human players
- Each player joins from their own browser
- All player positions, angles, and speeds are synchronized in real time over WebSockets
- 30 Hz server-to-client state broadcasting with 60 FPS client-side interpolation to keep movement smooth between updates
- Players can join from any network using an internet tunnel (ngrok or localtunnel) without needing to configure firewalls or port forwarding

### In-Game Menu (Pause System)

- Any player can pause the game during a race
- A banner is broadcast to all players showing who paused, resumed, or quit
- The pause overlay does not interrupt the animation loop; requestAnimationFrame continues unaffected
- Settings are accessible from the pause menu with volume sliders for music and sound effects
- Restart Match Voting: any player can call a vote to restart; the vote passes if more than 50% of connected players agree within 15 seconds

### Timer and Scoreboard

- A match timer counts up from the moment the race starts
- All connected players see the same synchronized timer value
- The scoreboard HUD displays live positions, lap counts, and player nicknames in real time

### Audio

- Background music in menus and during races, with separate volume controls
- Countdown audio synced to the pre-race countdown seconds
- Engine sound with pitch that rises and falls with vehicle speed
- Crash sound plays once on initial impact, not continuously
- Button click, boost, lap completion, game over, and oil spin-out effects

### Visual Design

- Dark arcade aesthetic with a layered DOM track rendering system
- Overpass road intersections rendered using ascending CSS z-index layers
- Animated background with moving car sprites during menus
- Glassmorphism-style modal overlays
- Smooth CSS transitions throughout the UI

---

## 3. How to Install and Run the Server

### Prerequisites

You need Node.js installed on the machine that will run the server. Any version 18 or newer is supported. You can check if Node.js is installed by running:

```bash
node --version
```

If it is not installed, download it from https://nodejs.org.

### Steps

**Step 1 — Clone the repository**

```bash
git clone https://github.com/MumenOsman/vimvim-racing.git
cd vimvim-racing
```

**Step 2 — Install dependencies**

The server has a single runtime dependency (ws, a WebSocket library). Install it with:

```bash
npm install
```

**Step 3 — Start the server**

```bash
npm start
```

The server starts on port 8080. You will see:

```
Server running at http://localhost:8080
```

**Step 4 — Open the game**

Open your browser and go to:

```
http://localhost:8080
```

That is all. No build step is needed. The server serves all client files statically.

### Development Mode (auto-restart on file changes)

```bash
npm run dev
```

This uses Node's built-in --watch flag and restarts the server automatically whenever a server-side file changes.

---

## 4. How to Play

### Starting a Solo Race

1. Open `http://localhost:8080` in your browser.
2. On the interface selection screen, choose either the graphical menu or the terminal command interface.
3. Select "Start Solo Race" (or type `:solo` in terminal mode).
4. Choose your vehicle, a race circuit, and the number of laps.
5. The race starts with a countdown. Press accelerate when "GO" appears.
6. Race against AI bots. The game ends when you complete the configured number of laps.

### Starting a Multiplayer Race

**Host player:**

1. Open the game and choose "Create Room" (or type `:create` in terminal mode).
2. Enter a unique nickname and select your vehicle.
3. Share the room code shown in the lobby with the other players.
4. Wait for 2 to 4 total players to join.
5. When ready, press "Start Race". The host is the only one who can start the race.

**Joining players:**

1. Open the same server URL (for example `http://localhost:8080` or the tunnel URL if connecting over the internet).
2. Choose "Join Room" (or type `:join <code>` in terminal mode).
3. Enter the room code given by the host and choose a nickname and vehicle.
4. Wait in the lobby until the host starts the race.

### During a Race

- All vehicles start from a grid. Movement is locked until the countdown finishes.
- Drive around the circuit passing through all eight checkpoint gates in order.
- Complete the set number of laps to finish. Your final position and lap time are recorded.
- If you drive off the circuit into gravel or grass, your vehicle will slow significantly.
- Hitting an oil slick causes a spin-out. Collecting the boost pad gives you a temporary burst of speed.
- Press the assigned action key to use a collected perk item.

### Pausing the Race

Press Escape at any time to open the in-game menu. All other players will see a notification with your name. From the pause menu you can resume, adjust settings, vote to restart, or quit to the main menu.

### End of Race

Once a player completes all laps, a podium screen displays the finishing order, final lap times, and the match winner. From the results screen you can return to the menu or vote to restart with the same players.

---

## 5. Keyboard Controls

Three control presets are available, selectable from the Settings menu under Controls.

### Standard Arrow Keys

| Key | Action |
| :--- | :--- |
| Arrow Up | Accelerate |
| Arrow Down | Brake / Reverse |
| Arrow Left | Steer left |
| Arrow Right | Steer right |
| Space | Use collected perk item |

### WASD Keys

| Key | Action |
| :--- | :--- |
| W | Accelerate |
| S | Brake / Reverse |
| A | Steer left |
| D | Steer right |
| Space | Use collected perk item |

### Vim Keys

| Key | Action |
| :--- | :--- |
| K | Accelerate |
| J | Brake / Reverse |
| H | Steer left |
| L | Steer right |
| Space | Use collected perk item |

All key inputs are tracked via a key-down / key-up Set rather than direct event-handler movement. This means holding a key feels completely smooth with no long-press activation delays or repeated-key artifacts.

---

## 6. Multiplayer and Networking

### Local Network

If all players are on the same local network (for example the same Wi-Fi), any player can connect by navigating to the host machine's local IP address:

```
http://<host-ip-address>:8080
```

Find your local IP with `ip a` on Linux, `ifconfig` on macOS, or `ipconfig` on Windows.

### Over the Internet (Tunnel)

To allow players on different networks to connect, use a tunneling service to expose port 8080 publicly. Two common options are:

**ngrok:**

```bash
ngrok http 8080
```

ngrok provides a public URL such as `https://abc123.ngrok.io`. Share this URL with other players.

**localtunnel:**

```bash
npx localtunnel --port 8080
```

Provides a public URL in a similar format.

No server-side configuration changes are needed. The WebSocket server works transparently behind both tools.

### How Synchronization Works

- The host player's browser runs the authoritative physics simulation
- Every 33 milliseconds (approximately 30 times per second), the host sends a snapshot of all vehicle positions, angles, and speeds to the server
- The server relays this snapshot to all other connected clients
- Each client applies client-side interpolation between received snapshots to produce smooth 60 FPS motion even on slower connections

Player inputs (keyboard state) are sent from each client to the server and forwarded to the host, so that the host can simulate all vehicles including remote players.

---

## 7. Game Modes and Interface Options

### Interface Selection

When you first open the game, you choose between two interface styles:

**Graphical Menu (GUI Mode)**
A standard visual menu with clickable buttons. Suitable for most players.

**Terminal Mode**
A command-line style interface where all navigation is done by typing commands into the prompt bar at the bottom of the screen. Available commands:

| Command | Description |
| :--- | :--- |
| `:help` | Show all available commands |
| `:solo` | Start a solo race |
| `:create` | Create a multiplayer room |
| `:join <code>` | Join a room with a code |
| `:name <nickname>` | Set your player nickname |
| `:car <number>` | Choose a vehicle by number |
| `:laps <number>` | Set lap count (1, 2, 3, 5, 7, or 10) |
| `:start` | Start the race (host only) |

When you finish a race or leave a room, the game remembers whether you used the GUI or Terminal interface and returns you to the same mode rather than the interface selection screen.

---

## 8. Architecture and Technical Choices

### No HTML Canvas

The project requirement explicitly prohibits HTML Canvas. All game graphics are produced using:

- `div` and `img` elements positioned with CSS
- `transform: translate3d(x, y, 0) rotate(deg)` for vehicle movement and rotation
- `will-change: transform` applied to active vehicles for GPU compositing
- CSS `z-index` layering for track overpass depth ordering

This approach is viable at 60+ FPS because all transforms are GPU-composited and no layout recalculation is triggered during the game loop.

### Fixed Physics Timestep with Variable Render Rate

The game loop runs two separate update cycles:

**Physics tick** runs at a fixed interval (approximately 60 Hz). Handles vehicle acceleration, steering, collision detection and resolution, checkpoint tracking, and hazard interaction. The fixed timestep ensures simulation consistency regardless of display refresh rate.

**Render tick** runs every `requestAnimationFrame` callback. Reads the current vehicle positions from the physics state and applies CSS transforms to the corresponding DOM elements. No physics logic runs here.

This separation means the animation loop is never blocked by game logic, and pausing the game (which stops physics ticks) has no effect on the smoothness of the animation.

### DOM Object Pooling

Vehicle and projectile DOM elements are created once at initialization and reused throughout the session. No `createElement` or `removeChild` calls happen inside the game loop. This eliminates garbage collection pauses that would cause dropped frames.

### Event-Driven Module Communication

All game modules communicate through a central EventBus rather than importing each other directly. No module holds a direct reference to another module. For example:

- `InputManager` emits input change events; it knows nothing about the physics or network layers
- `SoundManager` listens for game events (collision, boost, lap completion) and plays the corresponding audio; it has no access to player state
- `HUD` listens for score and timer events; it does not call physics or network functions directly

This architecture means each module can be developed, tested, and modified independently without risk of side effects in unrelated systems.

### WebSocket Relay Architecture

The server (`server/server.js`) acts as a message relay and room manager. It does not run game physics. The host client is the authoritative simulation. This design keeps the server stateless with respect to game logic, meaning:

- The server has minimal CPU overhead
- Room management is handled in `server/rooms.js`
- The server supports any number of simultaneous rooms limited only by available memory and bandwidth

### Collision Sound Deduplication

Car-to-car collision pairs are tracked as string keys (`id1:id2`) in a Set that persists between physics frames. The crash sound only plays on the first frame a new pair enters contact. While those two cars remain touching or overlapping, no further sound events are emitted. The sound can only play again after the pair separates and makes contact again.

The same principle applies to obstacle collisions: a `car.inObstacleContact` flag is stored on the car object and cleared only when the car leaves the obstacle boundary.

---

## 9. Project File Structure

```
vimvim-racing/
├── package.json                   Node.js project configuration and scripts
├── README.md                      This file
├── server/
│   ├── server.js                  HTTP static file server and WebSocket relay
│   └── rooms.js                   Room creation, join validation, and session management
└── client/
    ├── index.html                 Single-page application entry point
    ├── index.css                  All styling, layout, z-index system, and animations
    ├── main.js                    Game bootstrap, module coordinator, and main game loop
    ├── favicon.svg                Browser tab icon
    ├── assets/
    │   ├── cars/                  15 pre-rendered vehicle sprite images (PNG)
    │   └── tracks/
    │       ├── hourglass/         Hourglass Raceway track image and preview
    │       └── canyon_slalom/     Canyon Slalom track image and preview
    ├── audio/
    │   ├── sound.js               Web Audio API sound manager
    │   └── assets/                Audio files (music, SFX, engine, countdown, crash)
    ├── core/
    │   ├── events.js              Central EventBus and all event name constants
    │   └── module_manager.js      Module registry and lifecycle coordinator
    ├── engine/
    │   ├── game_loop.js           requestAnimationFrame loop with fixed physics timestep
    │   ├── track.js               Circuit boundary data, checkpoint gates, hazards, pickups
    │   ├── physics.js             Vehicle physics, collision detection and resolution, NPC AI
    │   ├── renderer.js            DOM-only rendering engine with pre-allocated element pools
    │   ├── state.js               Match state machine (Lobby, Playing, Paused, GameOver)
    │   └── tracks/
    │       ├── hourglass.js       Hourglass Raceway waypoints, checkpoints, and boundaries
    │       └── canyon_slalom.js   Canyon Slalom waypoints, checkpoints, and boundaries
    ├── network/
    │   └── client.js              WebSocket connection wrapper and event dispatcher
    ├── input/
    │   └── keyboard.js            Key state tracking (WASD, Arrow, Vim presets)
    └── ui/
        ├── lobby.js               Join screen, vehicle selector, lap count picker
        ├── hud.js                 Race HUD: scoreboard, positions, timer
        ├── menu.js                Pause modal, settings, restart voting
        └── chat.js                In-game chat panel and quick reaction system
```

---

## 10. Audio System

Audio is entirely synthesized or loaded at runtime using the Web Audio API. There are no external audio CDN dependencies. All audio assets are served locally from the `client/audio/assets/` folder.

| Sound | Trigger |
| :--- | :--- |
| Menu music | Plays on loop during menus and lobby |
| Race music | Plays on loop when the race starts |
| Countdown audio | Synchronized to pre-race countdown seconds |
| Engine noise | Loops during a race; pitch scales with vehicle speed |
| Car crash | Plays once on initial car-to-car or car-to-obstacle impact |
| Boost pickup | Plays when a boost pad or UFO item is collected |
| Oil spin-out | Plays when a vehicle drives over an oil slick |
| Button click | Plays on UI button interactions |
| Lap complete | Plays when a player crosses the finish line |
| Game over | Plays when the race results screen appears |

Volume for music and sound effects can be adjusted independently from the Settings panel in the pause menu. Changes persist for the session duration.

---

## 11. Asset Attributions

### Vehicle Sprites

The 15 vehicle sprites used in the game are from the Free Racing Game Kit (PNG) asset pack. The assembled track background images were constructed from tiles and road segments included in the same asset pack.

### Audio

- Menu music, race music, countdown audio, and engine noise were sourced and adapted for use in this project.
- The car crash sound effect is sourced from a free sound library under a free-to-use license (dragon-studio-car-crash-sound).
- Button click sound and synthesized UI effects were created using the Web Audio API oscillator synthesis pipeline within `sound.js`.

### Fonts

No external web fonts are loaded. The terminal mode interface uses monospace system fonts to maintain the command-line aesthetic without any external dependencies.

---

## 12. License

This project is distributed under the ISC License.

Copyright 2024 VimVim Racing Contributors

Permission to use, copy, modify, and/or distribute this software for any purpose with or without fee is hereby granted, provided that the above copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.

---

## Contributing

This project was built as a collaborative course assignment by a three-person team:

- **Mumen** — Core game engine, DOM rendering pipeline, physics system, collision, game state machine, host orchestration
- **Ville** — Audio system, keyboard input manager, pause/resume modal, HUD, vehicle and item styling
- **Rene** — WebSocket networking, lobby join flow, nickname validation, relay server, in-game chat

If you are forking or extending this project, please review the architecture notes in Section 8 and keep feature modules decoupled through the EventBus system.
