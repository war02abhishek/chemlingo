# ChemLingo

Duolingo-style micro-learning platform for 12th Grade Inorganic Chemistry (JEE/NEET).
Real-time 1v1 equation-balancing duels over WebSocket.

---

## Project Status

| Layer | Status | Notes |
|---|---|---|
| Go backend (auth + duel hub) | Working | Runs on `:8080` |
| React Native app (Android) | Working | Native APK build, embedded JS bundle |
| Login → DuelScreen flow | Working | JWT stored in AsyncStorage |
| WebSocket matchmaking | Working | 2-player queue, auto-pairs |
| Round start / equation display | Working | Slots, chips, separator |
| HP bar animations | Working | Reanimated `withTiming` |
| Submit answer + validation | Working | Damage formula, wrong-attempt penalty |
| Round end / match end overlay | Working | Win/lose screen with final HP |
| Drill screens (old) | Removed | Replaced by Reaction Duel |
| Leaderboard / Streak screens | Removed | Not yet reimplemented |
| AI hint service | Not wired | FastAPI scaffold exists in `ai_service/` |
| iOS build | Not tested | Only Android emulator tested |

---

## Architecture

```
chemlingo/
├── backend/                  # Go (Gin) — REST + WebSocket
│   ├── internal/
│   │   ├── duel/             # Match hub, game loop, WS handlers
│   │   │   ├── types.go      # MatchState, Equation, Client, Match structs
│   │   │   ├── equations.go  # 5 seeded equations (easy/medium/hard)
│   │   │   ├── hub.go        # Matchmaking queue, round lifecycle, broadcast
│   │   │   └── handler.go    # POST /duel/match, GET /ws/duel
│   │   ├── handler/auth.go   # POST /auth/login (bcrypt + JWT)
│   │   ├── middleware/       # JWT middleware
│   │   ├── model/model.go    # Student struct
│   │   └── store/store.go    # Postgres queries
│   ├── cmd/
│   │   ├── migrate/main.go   # Creates tables (run once)
│   │   └── seed/main.go      # Inserts test@chemlingo.com student
│   ├── config/config.go      # Env var loading
│   └── main.go               # Route wiring
│
├── rn_app/                   # React Native (Expo SDK 51, old-arch)
│   ├── index.js              # Entry point — AppRegistry.registerComponent('main', ...)
│   ├── App.jsx               # Root: View + StatusBar + AppNavigator
│   ├── metro.config.js       # Required for react-native bundle command
│   ├── android/              # Generated native Android project
│   │   └── app/src/main/
│   │       ├── java/com/chemlingo/app/
│   │       │   ├── MainActivity.kt     # getMainComponentName = "main"
│   │       │   └── MainApplication.kt # getUseDeveloperSupport = false (embedded bundle)
│   │       └── assets/
│   │           └── index.android.bundle  # Pre-bundled JS (must regenerate on code changes)
│   └── src/
│       ├── core/
│       │   ├── api.js           # Axios client (BASE_URL = http://10.0.2.2:8080)
│       │   ├── duelApi.ts       # createOrJoinMatch, getToken, WS_BASE
│       │   └── navigation/      # Stack navigator: Login → Duel
│       ├── features/
│       │   └── duel/
│       │       ├── DuelScreen.tsx
│       │       └── components/
│       │           ├── HealthBar.tsx
│       │           ├── EquationDisplay.tsx
│       │           └── NumberChips.tsx
│       ├── hooks/
│       │   └── useDuelSocket.ts  # WebSocket lifecycle + state reducer
│       └── types/
│           └── duel.ts           # TypeScript mirrors of Go types
│
├── infra/
│   └── db/init.sql           # Full schema (requires pgvector — not used currently)
│
└── scripts/
    └── play_as_p2.py         # Bot script: simulates Player 2 for local testing
```

---

## Local Setup

### Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Go | 1.21+ | `go run` / `go build` |
| Node.js | 18+ | npm for RN deps |
| Java | 21 (exactly) | Use Android Studio's bundled JDK — NOT system Java |
| Android Studio | Latest | NDK 26.1.10909125, SDK 34 |
| Android Emulator | API 34 (Android 14) | API 35+ breaks Expo native libs (16 KB page size) |
| Python 3.13 | Optional | Only for `play_as_p2.py` bot script |
| PostgreSQL | Any | Must be running locally on port 5432 |

### Important Java path

Gradle 8.8 requires Java ≤ 22. The system Java may be too new. Always set:
```bash
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
```
Add this to your `~/.zshrc` or run it before every Gradle command.

### 1. Start Postgres

The project expects Postgres at `localhost:5432` with:
- User: `chemlingo`
- Password: `chemlingo_secret`
- Database: `chemlingo`

If using Docker:
```bash
docker run -d \
  --name chemlingo-pg \
  -e POSTGRES_USER=chemlingo \
  -e POSTGRES_PASSWORD=chemlingo_secret \
  -e POSTGRES_DB=chemlingo \
  -p 5432:5432 \
  postgres:15
```

### 2. Initialize Database (first time only)

```bash
cd backend
go run cmd/migrate/main.go   # creates institutes + students tables
go run cmd/seed/main.go      # inserts test@chemlingo.com / password123
```

> The full `infra/db/init.sql` requires the `pgvector` extension which is not
> available in plain Postgres. The migrate script creates only the tables the
> duel feature needs.

### 3. Start Backend

```bash
cd backend
go run main.go
# → ChemLingo backend running on :8080
```

Verify: `curl http://localhost:8080/health` → `{"status":"ok"}`

### 4. Build and Install Android APK

Run these steps **every time you change JS or TypeScript files**:

```bash
cd rn_app

# Step 1 — bundle JS into the APK assets
npx react-native bundle \
  --platform android \
  --dev true \
  --entry-file index.js \
  --bundle-output android/app/src/main/assets/index.android.bundle \
  --assets-dest android/app/src/main/res \
  --reset-cache

# Step 2 — compile the native APK
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
cd android && ./gradlew assembleDebug && cd ..

# Step 3 — install on emulator
adb -s emulator-5554 install -r \
  android/app/build/outputs/apk/debug/app-debug.apk

# Step 4 — launch
adb -s emulator-5554 shell am force-stop com.chemlingo.app
adb -s emulator-5554 shell am start -n com.chemlingo.app/.MainActivity
```

> Native Go/Kotlin code changes (in `android/`) require only steps 2–4.
> Pure JS/TS changes require all 4 steps.

---

## Test Credentials

| Field | Value |
|---|---|
| Email | `test@chemlingo.com` |
| Password | `password123` |
| Player 2 email | `player2@chemlingo.com` |
| Player 2 password | `password123` |

---

## Testing Multiplayer

You only need one emulator. Player 2 is simulated by a script.

**Flow:**
1. Launch the app (it joins as Player 1, shows "Waiting for opponent…")
2. In a separate terminal, run:
   ```bash
   python3 scripts/play_as_p2.py
   ```
3. The bot joins, the match starts, and it auto-submits the correct answer after 3 seconds
4. You can tap the equation slots on the emulator and submit before the bot does

**To give yourself more time**, increase the delay in [scripts/play_as_p2.py](scripts/play_as_p2.py):
```python
await asyncio.sleep(3)   # increase this
```

The script prints every WS message it receives (match_joined, round_start,
validation_result, state_update, round_end, match_end) so you can see exactly
what the server is sending.

---

## API Reference

### Public

| Method | Endpoint | Body | Response |
|---|---|---|---|
| POST | `/auth/login` | `{email, password}` | `{token, student}` |
| GET | `/health` | — | `{status:"ok"}` |

### Protected (Bearer JWT)

| Method | Endpoint | Body | Response |
|---|---|---|---|
| POST | `/api/v1/duel/match` | `{name}` | `{match_id, player_index, status}` |
| GET | `/ws/duel?match_id=&token=` | — | WebSocket upgrade |

> WebSocket uses `?token=` query param because React Native cannot set headers
> on WebSocket connections.

### WebSocket Message Protocol

**Client → Server**
```json
{ "type": "submit_answer", "payload": { "coefficients": [2, 1, 2] } }
{ "type": "ping" }
```

**Server → Client**
```json
{ "type": "match_joined",      "payload": MatchState }
{ "type": "round_start",       "payload": MatchState }
{ "type": "state_update",      "payload": MatchState }
{ "type": "validation_result", "payload": { "correct": true, "damage": 58.5, "wrong_attempts": 0 } }
{ "type": "round_end",         "payload": { "winner_id": "...", "next_round_in": 3 } }
{ "type": "match_end",         "payload": { "winner_id": "...", "final_state": MatchState } }
```

---

## Game Rules

- 3 rounds per match, 60 seconds per round
- Round 1 → easy equation, Round 2 → medium, Round 3 → hard
- Damage formula: `(30 + remaining_seconds × 0.5) × (1 - wrong_attempts × 0.1)`, minimum 5
- First player to deal enough damage to drop opponent to 0 HP wins
- If neither player solves in 60 s, the round timer fires and no damage is dealt
- Match ends early if any player's HP reaches 0

---

## Equation Bank

| ID | Display | Answer | Difficulty |
|---|---|---|---|
| `eq_h2o` | H₂ + O₂ → H₂O | [2, 1, 2] | easy |
| `eq_nh3` | N₂ + H₂ → NH₃ | [1, 3, 2] | easy |
| `eq_fe2o3` | Fe + O₂ → Fe₂O₃ | [4, 3, 2] | medium |
| `eq_alcl3` | Al + HCl → AlCl₃ + H₂ | [2, 6, 2, 3] | medium |
| `eq_propane` | C₃H₈ + O₂ → CO₂ + H₂O | [1, 5, 3, 4] | hard |

Add more in [backend/internal/duel/equations.go](backend/internal/duel/equations.go).

---

## Known Constraints and Gotchas

### Android build

- **API 34 emulator only** — API 35+ (Android 15) enforces 16 KB page alignment.
  Expo's native `.so` libraries are not yet compliant. Use the `Pixel_8_API34` AVD.
- **NDK 26.1.10909125** — must be installed via Android Studio → SDK Manager →
  SDK Tools → Show Package Details → NDK. NDK 30 causes C++ compile errors in
  expo-modules-core.
- **No expo-dev-client** — removed because it intercepts the launch and times out
  trying to reach Metro. The app uses an embedded JS bundle instead.
- **No Metro hot-reload** — every JS change needs a full rebundle + reinstall
  (steps 1–4 above). Gradle incremental build means steps 2–4 take ~10 s after
  the first build.

### Navigation

- `MainApplication.kt` has `getUseDeveloperSupport = false` — this forces the
  embedded bundle. Do not change this back to `BuildConfig.DEBUG` unless you
  restore a working Metro connection.
- `getJSMainModuleName` returns `"index"` (not `.expo/.virtual-metro-entry`) to
  match the bundle entry point.
- `index.js` uses `AppRegistry.registerComponent('main', ...)` — must match
  `getMainComponentName()` in `MainActivity.kt`.

### Database

- The `infra/db/init.sql` schema uses the `pgvector` extension for semantic
  search (AI features). This extension is not available in vanilla Postgres.
  The `cmd/migrate/main.go` script applies a minimal schema without it.
- Row-Level Security is defined in `init.sql` but NOT in the migrate script.
  The backend connects as the table owner, so RLS is bypassed regardless.
- There is no registration endpoint — add students via `cmd/seed/main.go` or
  by extending it.

### WebSocket

- The `match_joined` message arrives before `startRound` is called, so its
  `MatchState.Equation` is a zero-value struct (`labels: null`). The
  `useDuelSocket` state reducer stores it as-is. DuelScreen guards against this
  with `if (!matchState?.equation?.labels?.length) return` before building slots.

---

## Future Development

### High priority

- [ ] **Register endpoint** — `POST /auth/register` so users can sign up without
  DB access
- [ ] **Rematch button** — after match_end overlay, let the same two players
  queue again immediately
- [ ] **Round timer countdown** — show remaining seconds in the UI; use
  `round_ends_at` from MatchState
- [ ] **Hot-reload dev workflow** — either restore Metro connection via
  `adb reverse tcp:8081 tcp:8081` + `getUseDeveloperSupport = true`, or add an
  EAS build pipeline

### Medium priority

- [ ] **More equations** — expand the bank in `equations.go`; consider loading
  from a JSON file or Postgres table
- [ ] **Correct answer reveal** — after a round ends, show the balanced equation
  (`Equation.Raw`) to both players
- [ ] **XP / streak integration** — award XP on win and update `total_xp` /
  `current_streak` in the students table
- [ ] **Leaderboard screen** — re-add institute-scoped leaderboard using
  `total_xp` ordering
- [ ] **AI hint** — wire `ai_service/` to provide a hint when a player submits
  3+ wrong attempts

### Low priority / future phases

- [ ] **iOS build** — the native Android project was the only one tested; an
  iOS Xcode project needs to be generated and tested
- [ ] **Real device testing** — change `BASE_URL` in `api.js` from `10.0.2.2`
  to the Mac's LAN IP for physical Android devices
- [ ] **Push notifications** — notify a player when a match is found
- [ ] **Spectator mode** — allow third clients to receive `state_update` messages
  as read-only observers
- [ ] **pgvector / AI similarity** — restore the full `init.sql` schema once
  pgvector is available; enables semantic drill search
- [ ] **Multi-institute** — the DB schema already supports multi-tenancy via
  `institute_id`; the frontend just needs an institute selector at login

---

## React Native vs React Web — Quick Reference

| Web | React Native |
|---|---|
| `<div>` | `<View>` |
| `<p>`, `<span>` | `<Text>` (all text must be inside `<Text>`) |
| `<button>` | `<TouchableOpacity>` or `<Pressable>` |
| `<input>` | `<TextInput>` |
| CSS files | `StyleSheet.create({})` — camelCase properties |
| `onClick` | `onPress` |
| `localStorage` | `AsyncStorage` (async!) |
| React Router | React Navigation |
| `fetch` / axios | Same axios works |
| `10.0.2.2` | Android emulator alias for `localhost` on the host machine |




Production Roadmap — 5 Phases
Phase 1 — Foundation (make what exists not break)
Prerequisite for any real users


Backend
├── Redis pub/sub for WS hub
│   Match state serialised to Redis.
│   Any pod can receive a WS from any player.
│   Use Redis keyspace events for match timeout.
├── DB migrations (golang-migrate or goose)
│   Versioned SQL files, applied on deploy, not by hand.
├── Rate limiting (middleware on /auth/login + /duel/match)
├── Refresh tokens (15 min access + 7 day refresh)
├── Structured logging (zerolog / slog) → shipped to Loki or Datadog
└── Health + readiness endpoints (/health/live, /health/ready)

App
├── Registration screen (name, email, password, institute select)
├── Onboarding (pick JEE / NEET, set daily goal)
├── Error boundary + Sentry crash reporting
└── EAS Build (Expo Application Services)
    Replaces the 4-step manual build.
    Push a commit → CI builds APK/IPA → OTA JS update for minor changes.

Infrastructure
├── Dockerfile for backend (multi-stage Go build)
├── GitHub Actions: lint → test → build → push image
└── Secrets in environment, not hardcode
Phase 2 — Content System (equations stop being hardcoded)

DB
├── equations table
│   id, display, raw, labels (jsonb), answers (jsonb),
│   difficulty, topic_id, chip_max
└── Admin seeder script (CSV → DB)

Backend
├── GET /api/v1/equations?difficulty=easy  (for future drill mode)
└── Hub.pickEquation() reads from DB, cached in Redis (TTL 1h)

App
├── Equation content loads from server, not compiled into APK
└── Offline cache: last 20 equations stored in SQLite / MMKV
Phase 3 — Progression Loop (the "Duolingo hook")
This is what makes users come back. Without it the app is a demo.


Backend
├── POST /api/v1/duel/result
│   Called by hub on match_end.
│   Awards XP (winner gets more), updates streak, handles streak freeze.
├── GET /api/v1/profile  → student stats
├── GET /api/v1/leaderboard?scope=institute&period=week
└── Streak cron (Redis sorted set, daily job resets broken streaks)

App
├── Home screen
│   Daily goal progress bar
│   Streak counter + flame icon (your mascot lives here)
│   Quick "Find Match" CTA
│   Leaderboard preview (top 3 of institute)
├── Profile screen
│   XP, level, streak, catalysts, match history
├── Match end → XP gained animation → back to Home
└── Push notifications (Expo Notifications)
    "Your streak is at risk!" at 8 PM if no activity
    "Challenge from [name]!" when someone queues
Phase 4 — Social + B2B (institute layer)

Backend
├── Friend system (follow/challenge a specific player)
├── POST /api/v1/homework  (teacher assigns equation set + deadline)
├── Institute admin dashboard API
│   Class average XP, weakest topics, student activity heatmap
└── Match replay storage (store move timeline in Postgres JSONB)

App
├── Friends tab (invite by username / QR)
├── Homework screen (assigned drills, due date countdown)
└── Institute leaderboard (full list, your rank highlighted)
Phase 5 — AI Layer (the moat)

AI service (already scaffolded in ai_service/)
├── Hint engine
│   Wrong answer 3 times → "Remember: O₂ is diatomic, so it needs at least 2..."
│   Uses Claude / Gemini with equation context
├── Adaptive difficulty
│   Track per-student wrong-attempt history
│   Serve harder equations as accuracy improves
│   Spaced repetition (SM-2 already in DB schema as srs_schedule)
└── Weakness report (weekly summary: "You struggle with combustion reactions")
Priority Stack Rank
If you ship nothing else first, these 3 unlock everything:


1. Redis pub/sub hub       — without this, can't run > 1 server
2. EAS Build / CI          — without this, shipping is too slow to iterate
3. Registration + Home     — without this, no real user can use the app
Everything else (leaderboard, streaks, AI) builds on top of these.

Tech Decisions to Lock In Now
Decision	Current	Recommended
WS state store	In-memory Go map	Redis pub/sub
DB migrations	Manual SQL	golang-migrate
App builds	Manual 4-step	EAS Build + GitHub Actions
Error tracking	None	Sentry (both Go + RN)
OTA updates	None	EAS Update (JS-only changes, no APK re-submit)
Push notifications	None	Expo Push + FCM
Secrets	Hardcoded defaults	Doppler or AWS Secrets Manager
Logging	log.Printf	slog → Loki or Datadog
The bones are good — multi-tenant schema, WebSocket game loop, correct game design. Phase 1 is the critical unlock. Want to start with Redis pub/sub (the scalability fix) or EAS Build setup (the iteration speed fix)?

