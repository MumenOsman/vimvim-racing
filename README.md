# Multiplayer Web Game

A fast-paced, real-time web-browser multiplayer game supporting 2 to 4 simultaneous players. Built exclusively with pure DOM elements (zero HTML Canvas) maintaining 60 FPS animation.


## Setup & Running Locally

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the game server once:
   ```bash
   npm start
   ```

3. Open `http://localhost:8080` in one or more browser windows. Solo and multiplayer use this same server and port; do not start a second server for multiplayer.

4. Choose **Start Solo Race** for a local game. For multiplayer, one player creates a room and shares its code; the other players open the same URL and join with that code.
