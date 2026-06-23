# ChemLingo

Chemlingo is a gamified chemistry practice platform that keeps students revising every day and gives coaching institutes visibility into who is practicing, who is struggling, and which concepts need reinforcement.

Teacher teaches → Student practices daily through games → Teacher monitors completion and weak concepts → Student maintains streak and progresses through curriculum.
---

## What We Have vs What's a Prototype

### Solid — works end-to-end

| Layer | Status | Notes |
|---|---|---|
| Go backend (auth + duel hub) | ✅ Working | Runs on `:8080` |
| React Native app (Android) | ✅ Working | Native APK build, embedded JS bundle |
| Login → DuelScreen flow | ✅ Working | JWT stored in AsyncStorage |
| WebSocket matchmaking | ✅ Working | 2-player queue, auto-pairs |
| Round start / equation display | ✅ Working | Slots, chips, separator |
| HP bar animations | ✅ Working | Reanimated `withTiming` |
| Submit answer + validation | ✅ Working | Damage formula, wrong-attempt penalty |
| Round end / match end overlay | ✅ Working | Win/lose screen with final HP |
| Profile screen + XP history | ✅ Working | `GET /api/v1/profile`, `GET /api/v1/profile/history` |
| Global Leaderboard | ✅ Working | `GET /api/v1/leaderboard`, public profile view |
| Home screen with game cards | ✅ Working | Reaction Duel, Periodic Sprint, Molecule Builder, Global Leaderboard |
| **Daily Challenge** | ✅ Working | Full flow: intro → quiz (5 Qs) → results + leaderboard |
| Daily Challenge — seeded question selection | ✅ Working | FNV32a hash of UTC date → `math/rand.Perm(15)` — same 5 questions for all players |
| Daily Challenge — server-side validation | ✅ Working | Answers never sent to client; re-validated on submit |
| Daily Challenge — score + XP rewards | ✅ Working | `score = correct×200 + speed_bonus(300 − elapsed_secs)` |
| Daily Challenge — global leaderboard | ✅ Working | Score tab + Fastest (100% accuracy) tab |
| HomeScreen DC card with live countdown | ✅ Working | Amber "Not started yet" → Green "Completed · X%" after submission |

### Prototype — not production-safe

| Gap | Risk | Fix (see roadmap) |
|---|---|---|
| In-memory match state (`Hub.matches` is a Go map) | Server crash = all live matches die. Can't run 2 pods. | Redis pub/sub (Phase 1) |
| Redis in docker-compose but unused | Horizontal scaling is impossible | Redis pub/sub (Phase 1) |
| 5 hardcoded equations in `equations.go` | Content team can't add equations without a code deploy | `equations` DB table (Phase 2) |
| No rate limiting or input validation | `/auth/login` and WS frames can be hammered | Middleware (Phase 1) |
| No registration endpoint | Users must be inserted directly into the DB | Register screen (Phase 1) |
| Manual 4-step rebuild cycle | Shipping a JS change takes minutes, not seconds | EAS Build + CI (Phase 1) |
| App has only one screen | After match ends, user is stuck | Home + progression (Phase 3) |
| No observability | No logs, no metrics, no error tracking | Sentry + structured logs (Phase 1) |
| `JWT_SECRET = "change-me-in-production"` | Hardcoded secret in config | Secrets manager (Phase 1) |
| No DB migrations | Schema changes are manual SQL | `golang-migrate` (Phase 1) |

### Not started

| Feature | Notes |
|---|---|
| Drill screens (old) | Removed — will be reimplemented as a separate content type |
| Streak system | DB schema has `current_streak`, `catalysts` — no cron job yet |
| AI hint service | FastAPI scaffold exists in `ai_service/`, not wired |
| iOS build | Only Android emulator tested |
| Push notifications | Not started |
| Registration screen | Users must be inserted directly into DB |

---

## Architecture

```
chemlingo/
├── backend/                  # Go (Gin) — REST + WebSocket
│   ├── internal/
│   │   ├── challenge/
│   │   │   └── challenge.go  # 15-equation pool, ForDate() seeded selection, Validate(), Score(), XPReward()
│   │   ├── duel/             # Match hub, game loop, WS handlers
│   │   │   ├── types.go      # MatchState, Equation, Client, Match structs
│   │   │   ├── equations.go  # 5 seeded equations (easy/medium/hard) — hardcoded for now
│   │   │   ├── hub.go        # Matchmaking queue, round lifecycle, broadcast
│   │   │   └── handler.go    # POST /duel/match, GET /ws/duel
│   │   ├── handler/
│   │   │   ├── auth.go           # POST /auth/login (bcrypt + JWT)
│   │   │   ├── profile.go        # GET /api/v1/profile, GET /api/v1/profile/history
│   │   │   ├── leaderboard.go    # GET /api/v1/leaderboard, GET /api/v1/players/:id/profile
│   │   │   └── daily_challenge.go # GET/POST /api/v1/daily-challenge, GET /leaderboard
│   │   ├── middleware/       # JWT middleware
│   │   ├── model/model.go    # Student struct
│   │   └── store/store.go    # Postgres queries (profile, history, leaderboard, daily challenge)
│   ├── cmd/
│   │   ├── migrate/main.go   # Creates tables including daily_challenge_submissions
│   │   └── seed/main.go      # Inserts test@chemlingo.com + player2@chemlingo.com
│   ├── config/config.go      # Env var loading
│   └── main.go               # Route wiring
│
├── rn_app/                   # React Native (Expo SDK 51, old-arch)
│   ├── index.js              # Entry — AppRegistry.registerComponent('main', ...)
│   ├── App.jsx               # Root: View + StatusBar + AppNavigator
│   ├── metro.config.js       # Required for react-native bundle command
│   ├── android/              # Generated native Android project
│   │   └── app/src/main/
│   │       ├── java/com/chemlingo/app/
│   │       │   ├── MainActivity.kt     # getMainComponentName = "main"
│   │       │   └── MainApplication.kt # getUseDeveloperSupport = false (embedded bundle)
│   │       └── assets/
│   │           └── index.android.bundle  # Pre-bundled JS — must regen on every JS change
│   └── src/
│       ├── core/
│       │   ├── api.js           # Axios client (BASE_URL = http://10.0.2.2:8080)
│       │   ├── duelApi.ts       # createOrJoinMatch, getToken, WS_BASE
│       │   ├── profileApi.ts    # fetchProfile, fetchHistory, fetchLeaderboard, daily challenge API
│       │   └── navigation/      # Stack navigator: Login → Home → Duel/Profile/Leaderboard/DailyChallenge
│       ├── features/
│       │   ├── auth/
│       │   │   └── LoginScreen.tsx
│       │   ├── home/
│       │   │   └── HomeScreen.tsx       # Cards: Daily Challenge (live countdown), Reaction Duel, coming-soon
│       │   ├── duel/
│       │   │   ├── DuelScreen.tsx
│       │   │   └── components/
│       │   │       ├── HealthBar.tsx
│       │   │       ├── EquationDisplay.tsx
│       │   │       └── NumberChips.tsx
│       │   ├── daily/
│       │   │   └── DailyChallengeScreen.tsx  # intro → quiz (5 Qs) → results + leaderboard
│       │   ├── profile/
│       │   │   └── ProfileScreen.tsx
│       │   └── leaderboard/
│       │       └── LeaderboardScreen.tsx
│       ├── hooks/
│       │   └── useDuelSocket.ts  # WebSocket lifecycle + state reducer
│       └── types/
│           └── duel.ts           # TypeScript mirrors of Go types
│
├── infra/
│   └── db/init.sql           # Full schema (needs pgvector — not used yet)
│
└── scripts/
    └── play_as_p2.py         # Bot: simulates Player 2 for local multiplayer testing
```

---

## Production Roadmap

The DB schema already models the full Duolingo loop (streaks, XP, catalysts, institute multi-tenancy, SRS, homework). The game design is right. Below is the execution plan to get there.

---

### Phase 1 — Foundation *(prerequisite for any real users)*

**Backend**
- [ ] **Redis pub/sub for the WS hub** — serialize `MatchState` to Redis so any pod can handle any player. Use Redis keyspace events for match timeouts. Without this, can't run more than one server.
- [ ] **DB migrations** — adopt `golang-migrate` or `goose`. Versioned SQL files applied on deploy, never by hand.
- [ ] **Rate limiting** — middleware on `/auth/login` and `/duel/match` (token bucket per IP).
- [ ] **Refresh tokens** — 15-min access token + 7-day refresh token. Current JWTs never expire meaningfully.
- [ ] **Structured logging** — replace `log.Printf` with `slog` shipped to Loki or Datadog.
- [ ] **Liveness + readiness probes** — `/health/live` and `/health/ready` for Kubernetes.

**App**
- [ ] **Registration screen** — name, email, password, institute picker.
- [ ] **Onboarding** — pick JEE / NEET, set daily goal (5 / 10 / 15 min).
- [ ] **Error boundary + Sentry** — catch JS crashes, report with device context.
- [ ] **EAS Build** — replace the 4-step manual rebuild with Expo Application Services. Push a commit → CI builds APK/IPA. OTA JS updates for minor changes without a store re-submit.

**Infrastructure**
- [ ] **Dockerfile** for backend (multi-stage Go build, non-root user).
- [ ] **GitHub Actions pipeline** — lint → unit test → build image → push to registry.
- [ ] **Secrets management** — Doppler or AWS Secrets Manager. Remove hardcoded defaults.

---

### Phase 2 — Content System *(equations stop being hardcoded)*

**DB**
- [ ] `equations` table: `id, display, raw, labels (jsonb), answers (jsonb), difficulty, topic_id, chip_max`
- [ ] Admin CSV seeder script → DB.

**Backend**
- [ ] `Hub.pickEquation()` reads from DB, result cached in Redis (TTL 1 h).
- [ ] `GET /api/v1/equations?difficulty=easy` for future drill mode.

**App**
- [ ] Equations load from server, not compiled into the APK.
- [ ] Offline cache: last 20 equations stored in MMKV for no-network play.

---

### Phase 3 — Progression Loop *(the Duolingo hook — what makes users return)*

**Backend**
- [ ] `POST /api/v1/duel/result` — called by hub on `match_end`. Awards XP (winner more), updates streak, handles catalyst (streak freeze) consumption.
- [x] `GET /api/v1/profile` — student stats (XP, level, streak, match history).
- [x] `GET /api/v1/leaderboard` — global leaderboard by XP.
- [x] **Daily Challenge** — `GET/POST /api/v1/daily-challenge` + `/leaderboard`. 15-equation pool, deterministic date-seeded selection, server-side answer validation, score + XP rewards.
- [ ] Streak cron job — Redis sorted set, daily job resets broken streaks at midnight.

**App**
- [x] **Home screen** — Daily Challenge card (live countdown, completion state), Reaction Duel CTA, coming-soon game cards, Global Leaderboard entry.
- [x] **Profile screen** — XP, rating, match history.
- [x] **Daily Challenge screen** — intro (difficulty mix, rewards, countdown) → quiz (5 equations, number pad, elapsed timer) → results (score hero, rank badge, stats, per-question breakdown, leaderboard with Score/Fastest tabs).
- [ ] **Match end → XP animation → back to Home** (currently the user is stuck after a match).
- [ ] **Push notifications** via Expo Notifications + FCM
  - "Your streak is at risk!" at 8 PM if no activity that day
  - "Challenge from [name]!" when a specific player queues against you

---

### Phase 4 — Social + B2B *(institute layer)*

**Backend**
- [ ] Friend system — follow / direct-challenge a specific player.
- [ ] `POST /api/v1/homework` — teacher assigns an equation set with a deadline.
- [ ] Institute admin dashboard API — class average XP, weakest topics, student activity heatmap.
- [ ] Match replay storage — store move timeline in Postgres JSONB for post-game review.

**App**
- [ ] Friends tab — invite by username or QR code scan.
- [ ] Homework screen — assigned drills, due-date countdown.
- [ ] Full institute leaderboard with your rank highlighted.

---

### Phase 5 — AI Layer *(the moat)*

- [ ] **Hint engine** — wrong answer 3× → contextual hint ("Remember: O₂ is diatomic…") via Claude / Gemini with equation context. FastAPI scaffold already exists in `ai_service/`.
- [ ] **Adaptive difficulty** — track per-student wrong-attempt history, serve harder equations as accuracy improves. SM-2 spaced repetition table already in DB schema (`srs_schedule`).
- [ ] **Weekly weakness report** — "You struggle with combustion reactions" pushed as a notification + shown on profile.

---

## Tech Decisions to Lock In Now

| Decision | Current | Change To |
|---|---|---|
| WS match state store | In-memory Go map | Redis pub/sub |
| DB migrations | Manual SQL | `golang-migrate` |
| App builds | Manual 4-step | EAS Build + GitHub Actions |
| Error tracking | None | Sentry (Go + RN) |
| OTA JS updates | None | EAS Update (no APK re-submit for JS changes) |
| Push notifications | None | Expo Push + FCM |
| Secrets | Hardcoded defaults | Doppler or AWS Secrets Manager |
| Logging | `log.Printf` | `slog` → Loki / Datadog |

**Priority top 3** — ship these before anything else:
1. **Redis pub/sub hub** — without it, you cannot run more than one server instance
2. **EAS Build / CI** — without it, iteration is too slow to build a product
3. **Registration + Home screen** — without it, no real user can use the app

---

## Local Setup

### Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Go | 1.21+ | `go run` / `go build` |
| Node.js | 18+ | npm for RN deps |
| Java | 21 (exactly) | Use Android Studio's bundled JDK — NOT system Java |
| Android Studio | Latest | NDK 26.1.10909125, SDK 34 |
| Android Emulator | API 34 (Android 14) | API 35+ breaks Expo native libs (16 KB page alignment) |
| Python 3.13 | Optional | Only for `play_as_p2.py` bot script |
| PostgreSQL | Any | Must be running locally on port 5432 |

### Critical Java path

Gradle 8.8 requires Java ≤ 22. System Java is often newer. Always set:
```bash
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
```
Add to `~/.zshrc` or prefix every Gradle command.

### 1. Start Postgres

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

> `infra/db/init.sql` requires the `pgvector` extension (not available in plain Postgres).
> The migrate script applies only the tables the duel feature needs.

### 3. Start Backend

```bash
cd backend
go run main.go
```
Verify: `curl http://localhost:8080/health` → `{"status":"ok"}`

### 4. Build and Install Android APK

Run every time you change JS or TypeScript:

```bash
cd rn_app

# 1 — bundle JS into APK assets
npx react-native bundle \
  --platform android \
  --dev true \
  --entry-file index.js \
  --bundle-output android/app/src/main/assets/index.android.bundle \
  --assets-dest android/app/src/main/res \
  --reset-cache

# 2 — compile APK
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
cd android && ./gradlew assembleDebug && cd ..

# 3 — install
adb -s emulator-5554 install -r \
  android/app/build/outputs/apk/debug/app-debug.apk

# 4 — launch
adb -s emulator-5554 shell am force-stop com.chemlingo.app
adb -s emulator-5554 shell am start -n com.chemlingo.app/.MainActivity
```

> Native Kotlin changes (in `android/`) need only steps 2–4.
> JS/TS changes need all 4 steps.

---

## Test Credentials

| | Value |
|---|---|
| Player 1 email | `test@chemlingo.com` |
| Player 2 email | `player2@chemlingo.com` |
| Both passwords | `password123` |

---

## Testing Multiplayer

One emulator is enough. Player 2 is a Python bot script.

1. Launch the app → shows "Waiting for opponent…"
2. In a separate terminal:
   ```bash
   python3 scripts/play_as_p2.py
   ```
3. Bot joins, match starts, auto-submits the correct answer after 3 seconds
4. Tap slots on the emulator to play as Player 1 before the bot does

Increase `await asyncio.sleep(3)` in [scripts/play_as_p2.py](scripts/play_as_p2.py) to give yourself more time.

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
| GET | `/api/v1/profile` | — | `{name, email, rating, total_xp, current_streak, …}` |
| GET | `/api/v1/profile/history` | — | `[{opponent, result, xp_earned, played_at}]` |
| GET | `/api/v1/leaderboard` | — | `[{player_id, name, rating, total_xp, rank}]` |
| GET | `/api/v1/players/:id/profile` | — | Public profile view |
| GET | `/api/v1/daily-challenge` | — | `{date, questions, my_submission, secs_to_reset}` |
| POST | `/api/v1/daily-challenge/submit` | `{answers:[{question_id, coefficients}]}` | `{score, correct_answers, question_results, rewards, rank}` |
| GET | `/api/v1/daily-challenge/leaderboard` | — | `{entries, my_player_id, my_rank, total_players}` |

> WebSocket uses `?token=` query param — React Native cannot set headers on WebSocket connections.

> `daily-challenge` answers are validated **server-side only** — the client never receives correct coefficients, preventing cheating.

### WebSocket Protocol

**Client → Server**
```json
{ "type": "submit_answer", "payload": { "coefficients": [2, 1, 2] } }
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

> `match_joined` sends a zero-value `Equation` (labels is null). The UI guards
> with `if (!matchState?.equation?.labels?.length) return` before building slots.

---

## Game Rules

- 3 rounds per match, 60 seconds per round
- Round 1 → easy, Round 2 → medium, Round 3 → hard
- Damage: `(30 + remaining_seconds × 0.5) × (1 − wrong_attempts × 0.1)`, floor 5
- First player to drop the opponent to 0 HP wins early
- Round timer expiry → no damage dealt that round, next round begins

---

## Equation Banks

### Reaction Duel (5 equations — hardcoded, Phase 2 moves to DB)

| ID | Display | Answer | Difficulty |
|---|---|---|---|
| `eq_h2o` | H₂ + O₂ → H₂O | [2, 1, 2] | easy |
| `eq_nh3` | N₂ + H₂ → NH₃ | [1, 3, 2] | easy |
| `eq_fe2o3` | Fe + O₂ → Fe₂O₃ | [4, 3, 2] | medium |
| `eq_alcl3` | Al + HCl → AlCl₃ + H₂ | [2, 6, 2, 3] | medium |
| `eq_propane` | C₃H₈ + O₂ → CO₂ + H₂O | [1, 5, 3, 4] | hard |

### Daily Challenge pool (15 equations — 5 selected daily via FNV32a date seed)

| ID | Display | Answer | Difficulty |
|---|---|---|---|
| `dc_h2o` | H₂ + O₂ → H₂O | [2, 1, 2] | easy |
| `dc_nh3` | N₂ + H₂ → NH₃ | [1, 3, 2] | easy |
| `dc_na2o` | Na + O₂ → Na₂O | [4, 1, 2] | easy |
| `dc_methane` | CH₄ + O₂ → CO₂ + H₂O | [1, 2, 1, 2] | easy |
| `dc_mgo` | Mg + O₂ → MgO | [2, 1, 2] | easy |
| `dc_fe2o3` | Fe + O₂ → Fe₂O₃ | [4, 3, 2] | medium |
| `dc_alcl3` | Al + HCl → AlCl₃ + H₂ | [2, 6, 2, 3] | medium |
| `dc_ca_h2o` | Ca + H₂O → Ca(OH)₂ + H₂ | [1, 2, 1, 1] | medium |
| `dc_ethanol` | C₂H₅OH + O₂ → CO₂ + H₂O | [1, 3, 2, 3] | medium |
| `dc_kclo3` | KClO₃ → KCl + O₂ | [2, 2, 3] | medium |
| `dc_naoh_h2so4` | NaOH + H₂SO₄ → Na₂SO₄ + H₂O | [2, 1, 1, 2] | medium |
| `dc_p2o5` | P₄ + O₂ → P₂O₅ | [1, 5, 2] | medium |
| `dc_propane` | C₃H₈ + O₂ → CO₂ + H₂O | [1, 5, 3, 4] | hard |
| `dc_fe3o4` | Fe₃O₄ + H₂ → Fe + H₂O | [1, 4, 3, 4] | hard |
| `dc_acetylene` | C₂H₂ + O₂ → CO₂ + H₂O | [2, 5, 4, 2] | hard |

Add duel equations in [backend/internal/duel/equations.go](backend/internal/duel/equations.go) and daily challenge equations in [backend/internal/challenge/challenge.go](backend/internal/challenge/challenge.go). Phase 2 moves both to a DB table.

---

## Known Hard Constraints

| Constraint | Why |
|---|---|
| API 34 emulator only | API 35+ (Android 15) enforces 16 KB page alignment. Expo `.so` libs are not yet compliant. |
| NDK 26.1.10909125 exactly | NDK 30 causes C++ compile errors in expo-modules-core. Install via Android Studio SDK Manager → Show Package Details. |
| `expo-dev-client` removed | It intercepts launch and times out reaching Metro. Removed in favour of embedded bundle. |
| `getUseDeveloperSupport = false` | Forces embedded bundle. Don't revert to `BuildConfig.DEBUG` without restoring Metro tunnel. |
| `index.js` uses `AppRegistry.registerComponent('main', ...)` | Must match `getMainComponentName()` in `MainActivity.kt`. `registerRootComponent` registers as "ChemLingo", not "main", and will crash. |
| pgvector not in plain Postgres | Full `init.sql` won't run without the extension. Use `cmd/migrate/main.go` instead. |

---

## React Native vs React Web

| Web | React Native |
|---|---|
| `<div>` | `<View>` |
| `<p>`, `<span>` | `<Text>` — all text must live inside `<Text>` |
| `<button>` | `<TouchableOpacity>` or `<Pressable>` |
| `<input>` | `<TextInput>` |
| CSS files | `StyleSheet.create({})` — same properties, camelCase |
| `onClick` | `onPress` |
| `localStorage` | `AsyncStorage` (async — always await) |
| React Router | React Navigation |
| `10.0.2.2` | Android emulator alias for `localhost` on the host Mac |
