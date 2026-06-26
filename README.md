# Flasky — Gamified Chemistry Learning Platform

Flasky is a structured **Learn + Compete** platform for chemistry students and coaching institutes. Students progress through a curriculum-aligned lesson path, earn XP and coins, and compete in real-time games. Teachers get a dedicated dashboard to monitor progress, identify weak concepts, and manage student batches.

```
Teacher teaches → Students practice daily through games → Teacher monitors weak concepts
                ↓
Student advances through Adventure Path → earns XP/coins → unlocks next lessons
```

---

## What Works End-to-End

### Student App

| Feature | Status | Notes |
|---|---|---|
| Login (student role) | ✅ | JWT stored in AsyncStorage |
| Dashboard | ✅ | XP, coins, streak stats; next lesson CTA; today's tasks |
| Adventure Path | ✅ | Winding node map — completed (green ✓), current (unlocked), locked nodes |
| Lesson Intro | ✅ | Concept text, XP/coin preview, Flasky mascot |
| Reaction Predictor game | ✅ | 5 MCQ questions per lesson; DuoLingo-style check/feedback bar |
| Lesson completion + unlock | ✅ | `POST /api/v1/lessons/:id/complete` marks done, awards XP+coins, unlocks next |
| Reward screen | ✅ | Confetti, XP/coins/accuracy tiles, streak card, CONTINUE → Adventure Path |
| Reaction Duel (real-time) | ✅ | WebSocket 2-player matchmaking, 3 rounds, HP bars |
| Duel result + rating update | ✅ | ELO-style rating, CONTINUE → Compete home |
| Periodic Sprint | ✅ | Timed periodic table element game |
| Compound Builder | ✅ | Balance chemical equations by dragging coefficients |
| Daily Challenge | ✅ | 5 seeded equations per day, server-side validation, score + leaderboard |
| Profile screen | ✅ | Rating, XP, wins/losses/win rate, recent matches — refreshes on every visit |
| Global Leaderboard | ✅ | Rankings with public profile view |
| Logout (student) | ✅ | Profile tab → scroll to bottom → Log Out |

### Teacher App

| Feature | Status | Notes |
|---|---|---|
| Login (teacher role) | ✅ | Same login screen, routes to teacher tab bar |
| Overview | ✅ | KPIs: active students, avg streak, lessons this week, at-risk count |
| Students roster | ✅ | List with streak, XP, lessons this week, last active |
| Insights | ✅ | Weak concept cards: lessons where avg score < 60% |
| Manage (batches) | ✅ | Create batches, view student count per batch |
| Logout (teacher) | ✅ | Manage tab → scroll to bottom → Log Out |

### Prototype / Not Production-Safe

| Gap | Risk |
|---|---|
| In-memory duel match state | Server crash kills all live matches; can't run 2 pods |
| JWT never expires meaningfully | No refresh token flow |
| No rate limiting | `/auth/login` and `/duel/match` can be hammered |
| No registration screen | Users must be inserted via seed script |
| Manual 4-step APK rebuild | JS change takes minutes to ship |
| Hardcoded `JWT_SECRET = "change-me-in-production"` | Must be replaced before real users |
| No push notifications | Streak reminders, duel invites not implemented |
| iOS not tested | Android emulator only |

---

## Architecture

### High-Level Design

```
┌─────────────────────────────────────────────────────────────────────┐
│                     Android App (React Native)                       │
│                                                                      │
│  ┌─────────────────┐  ┌──────────────────┐  ┌────────────────────┐  │
│  │   Learn Tab      │  │   Compete Tab    │  │   Teacher App      │  │
│  │                  │  │                  │  │                    │  │
│  │ Dashboard        │  │ Reaction Duel    │  │ Overview (KPIs)    │  │
│  │ Adventure Path   │  │ Periodic Sprint  │  │ Students roster    │  │
│  │ Lesson Intro     │  │ Compound Builder │  │ Insights           │  │
│  │ Reaction         │  │ Daily Challenge  │  │ Manage batches     │  │
│  │   Predictor      │  │ Leaderboard      │  │                    │  │
│  │ Reward Screen    │  │                  │  │                    │  │
│  └─────────────────┘  └──────────────────┘  └────────────────────┘  │
└───────────────────────────────┬─────────────────────────────────────┘
                                │
                    HTTPS (REST API)  +  WSS (WebSocket, duel only)
                                │
┌───────────────────────────────▼─────────────────────────────────────┐
│                     Go / Gin  —  :8080                               │
│                                                                      │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────────────┐  │
│  │ /auth/login  │  │ /curriculum  │  │ /teacher/overview         │  │
│  │              │  │ /lessons/:id │  │ /teacher/students         │  │
│  │              │  │   /complete  │  │ /teacher/insights         │  │
│  └──────────────┘  └──────────────┘  │ /teacher/batches          │  │
│  ┌──────────────┐  ┌──────────────┐  └───────────────────────────┘  │
│  │ /predictor   │  │ /profile     │  ┌───────────────────────────┐  │
│  │ /sprint      │  │ /leaderboard │  │     Duel Hub (WebSocket)  │  │
│  │ /compound    │  │ /daily-      │  │                           │  │
│  │              │  │  challenge   │  │  localClients map         │  │
│  └──────────────┘  └──────────────┘  │  (per-pod, in-memory)    │  │
│                                      └───────────────────────────┘  │
└────────────────────────┬────────────────────────┬────────────────────┘
                         │                        │
              ┌──────────▼──────────┐   ┌─────────▼──────────────┐
              │     PostgreSQL      │   │         Redis           │
              │                     │   │                         │
              │ students            │   │ Match queue    (LIST)   │
              │ topics / lessons    │   │ Match state    (HASH)   │
              │ lesson_completions  │   │ Pub/Sub events (ch)     │
              │ duel_results        │   │ Conn dedup     (SETNX)  │
              │ daily_challenge_    │   │ Round lock     (SETNX)  │
              │   submissions       │   │ Conn counter   (INCR)   │
              │ sprint / compound   │   │                         │
              └─────────────────────┘   └─────────────────────────┘
```

**What goes where:**
- **Postgres** — everything that needs to persist forever: users, curriculum progress, scores, match history
- **Redis** — everything the duel system needs to coordinate across pods in real-time: matchmaking queue, live match state, pub/sub event delivery, short-lived locks
- **In-memory (per pod)** — only the WebSocket connection handles (`localClients`), because WebSocket connections are OS-level file descriptors that can't be shared or serialized

---

### File Structure

```
flasky/  (repo root: chemlingo/)
├── backend/                        # Go (Gin) — REST + WebSocket
│   ├── internal/
│   │   ├── curriculum/
│   │   │   └── curriculum.go       # 3 topics × 5 lessons hardcoded; SeedTopics() on startup
│   │   ├── predictor/
│   │   │   └── predictor.go        # 26 MCQ questions; ForLesson(lessonID) → 5 seeded Qs
│   │   ├── challenge/
│   │   │   └── challenge.go        # 15-equation daily pool; ForDate() seeded selection
│   │   ├── duel/                   # Real-time match hub (WebSocket)
│   │   │   ├── types.go
│   │   │   ├── equations.go        # 5 hardcoded duel equations
│   │   │   ├── hub.go              # Matchmaking queue, round lifecycle, broadcast
│   │   │   └── handler.go
│   │   ├── handler/
│   │   │   ├── auth.go             # POST /auth/login
│   │   │   ├── curriculum.go       # GET /curriculum, GET /curriculum/progress, POST /lessons/:id/complete
│   │   │   ├── predictor.go        # GET /predictor/lesson/:id, POST /predictor/lesson/:id/submit
│   │   │   ├── teacher.go          # GET /teacher/overview|students|insights|batches, POST /teacher/batches
│   │   │   ├── profile.go          # GET /profile, GET /profile/history
│   │   │   ├── leaderboard.go      # GET /leaderboard, GET /players/:id/profile
│   │   │   ├── daily_challenge.go  # GET|POST /daily-challenge, GET /daily-challenge/leaderboard
│   │   │   ├── sprint.go           # GET|POST /sprint
│   │   │   └── compound.go         # GET|POST /compound
│   │   ├── middleware/
│   │   │   ├── auth.go             # JWT bearer middleware
│   │   │   └── role.go             # RequireRole("teacher") middleware
│   │   ├── model/model.go          # Shared structs
│   │   └── store/store.go          # All Postgres queries
│   ├── cmd/
│   │   ├── migrate/main.go         # Creates all tables
│   │   └── seed/main.go            # Seeds test student + teacher + curriculum
│   ├── config/config.go
│   └── main.go                     # Route wiring
│
├── rn_app/                         # React Native (Expo SDK 51, bare workflow)
│   ├── App.jsx                     # Font loading + AppNavigator root
│   ├── src/
│   │   ├── core/
│   │   │   ├── api.js              # Shared axios instance; JWT interceptor; BASE_URL=10.0.2.2:8080
│   │   │   ├── curriculumApi.ts    # fetchCurriculum, fetchMyProgress, completeLesson
│   │   │   ├── predictorApi.ts     # fetchLessonQuestions, submitLesson, fetchPracticeQuestion
│   │   │   ├── teacherApi.ts       # fetchTeacherOverview, fetchBatchStudents, fetchInsights, etc.
│   │   │   ├── profileApi.ts       # fetchProfile, fetchHistory, fetchLeaderboard, daily challenge
│   │   │   ├── duelApi.ts          # createOrJoinMatch, WS_BASE
│   │   │   ├── theme.ts            # Color tokens, Radius, Shadow3D helper
│   │   │   ├── components/
│   │   │   │   └── FlaskyMascot.tsx  # SVG Erlenmeyer flask mascot
│   │   │   └── navigation/index.jsx  # Role-based navigation tree
│   │   └── features/
│   │       ├── auth/LoginScreen.jsx
│   │       ├── learn/
│   │       │   ├── DashboardScreen.tsx   # Stats, next lesson CTA, today's tasks
│   │       │   ├── AdventurePathScreen.tsx  # Winding node map
│   │       │   ├── LessonIntroScreen.tsx    # Concept + Start Practice
│   │       │   ├── RewardScreen.tsx         # Confetti celebration post-lesson
│   │       │   └── BossBattleScreen.tsx     # Topic mastery check (10 Qs)
│   │       ├── predictor/
│   │       │   └── ReactionPredictorScreen.tsx  # 5 MCQ, check/feedback bar
│   │       ├── compete/
│   │       │   └── CompeteHomeScreen.tsx    # Game cards hub
│   │       ├── duel/DuelScreen.tsx
│   │       ├── sprint/SprintScreen.tsx
│   │       ├── compound/CompoundBuilderScreen.tsx
│   │       ├── daily/DailyChallengeScreen.tsx
│   │       ├── profile/ProfileScreen.tsx
│   │       ├── leaderboard/LeaderboardScreen.tsx
│   │       └── teacher/
│   │           ├── OverviewScreen.tsx
│   │           ├── StudentsScreen.tsx
│   │           ├── InsightsScreen.tsx
│   │           └── ManageScreen.tsx
│   └── android/                    # Native Android project
│
└── scripts/
    └── play_as_p2.py               # Python bot — simulates Player 2 for duel testing
```

### Navigation Tree

```
AppNavigator
├── not logged in  → LoginScreen
├── role = student → StudentTabs (Learn · Compete · Profile)
│   ├── Learn tab  → LearnStack
│   │   ├── DashboardScreen        ← tab root
│   │   ├── AdventurePathScreen
│   │   ├── LessonIntroScreen
│   │   ├── ReactionPredictorScreen
│   │   ├── RewardScreen
│   │   └── BossBattleScreen
│   ├── Compete tab → CompeteStack
│   │   ├── CompeteHomeScreen      ← tab root
│   │   ├── DuelScreen
│   │   ├── SprintScreen
│   │   ├── CompoundBuilderScreen
│   │   └── DailyChallengeScreen
│   └── Profile tab → ProfileScreen
└── role = teacher → TeacherTabs (Overview · Students · Insights · Manage)
    ├── OverviewScreen
    ├── StudentsScreen
    ├── InsightsScreen
    └── ManageScreen
```

---

## Curriculum

3 topics × 5 lessons each. All lessons use the **Reaction Predictor** game (MCQ).

| Topic | Lessons |
|---|---|
| Physical Chemistry | States of Matter · Atomic Structure · Chemical Bonding · Thermodynamics · Electrochemistry |
| Organic Chemistry | Hydrocarbons · Functional Groups · Organic Reactions · Polymers · Biomolecules |
| Inorganic Chemistry | Periodic Table · s-Block Elements · p-Block Elements · d-Block Elements · Coordination Compounds |

Lessons unlock sequentially. Complete all 5 → Boss Battle node unlocks (10 mixed questions, 70% to pass).

Question bank: 26 MCQ reactions across all three topics in `backend/internal/predictor/predictor.go`. Each lesson deterministically picks 5 using FNV32a seed on lesson UUID.

---

## Local Setup

### Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Go | 1.21+ | `go run` / `go build` |
| Node.js | 18+ | npm for RN deps |
| Java | 21 (exactly) | Use Android Studio's bundled JDK — NOT system Java |
| Android Studio | Latest | NDK 26.1.10909125, SDK 34 |
| Android Emulator | API 34 (Android 14) | API 35+ breaks Expo native `.so` libs (16 KB page alignment) |
| PostgreSQL | Any | Running locally on port 5432 |
| Redis | Any | Running locally on port 6379 (used by Sprint leaderboard) |

### Critical Java path

Gradle 8.8 requires Java ≤ 22. System Java is often newer. Always set:

```bash
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
```

Add to `~/.zshrc` or prefix every Gradle command.

### 1. Start Postgres + Redis

```bash
# Postgres
docker run -d --name flasky-pg \
  -e POSTGRES_USER=chemlingo \
  -e POSTGRES_PASSWORD=chemlingo_secret \
  -e POSTGRES_DB=chemlingo \
  -p 5432:5432 postgres:15

# Redis
docker run -d --name flasky-redis -p 6379:6379 redis:7
```

### 2. Initialize Database (first time only)

```bash
cd backend
go run cmd/migrate/main.go   # creates all tables
go run cmd/seed/main.go      # seeds test student + teacher + curriculum
```

### 3. Start Backend

```bash
cd backend
go run main.go
```

Verify: `curl http://localhost:8080/health` → `{"status":"ok"}`

The backend automatically upserts all topics and lessons on startup via `SeedTopics()`.

### 4. Build and Install Android APK

Run every time you change JS or TypeScript:

```bash
cd rn_app

# Step 1 — bundle JS
npx react-native bundle \
  --platform android \
  --dev false \
  --entry-file index.js \
  --bundle-output android/app/src/main/assets/index.android.bundle \
  --assets-dest android/app/src/main/res

# Step 2 — compile APK
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
cd android && ./gradlew assembleDebug && cd ..

# Step 3 — install
adb install -r android/app/build/outputs/apk/debug/app-debug.apk

# Step 4 — launch
adb shell am start -n com.chemlingo.app/.MainActivity
```

> Native Kotlin changes (in `android/`) need only steps 2–4.
> JS/TS changes need all 4 steps.

---

## Test Credentials

| Role | Email | Password |
|---|---|---|
| Student | `test@chemlingo.com` | `password123` |
| Teacher | `teacher@flasky.com` | `password123` |

---

## Testing Multiplayer Duel

One emulator is enough. Player 2 is a Python bot:

```bash
python3 scripts/play_as_p2.py
```

The bot joins the queue, auto-submits the correct answer after 3 seconds. Increase the `await asyncio.sleep(3)` delay in the script to give yourself more time.

---

## API Reference

### Public

| Method | Endpoint | Response |
|---|---|---|
| POST | `/auth/login` | `{token, student: {role, …}}` |
| GET | `/health` | `{status:"ok"}` |

### Protected (Bearer JWT)

#### Curriculum & Lessons
| Method | Endpoint | Notes |
|---|---|---|
| GET | `/api/v1/curriculum` | Topics with per-student `lessons_completed`, `boss_defeated` |
| GET | `/api/v1/curriculum/progress?topic=<slug>` | Full lesson list with completion status |
| POST | `/api/v1/lessons/:id/complete` | Awards XP + coins, unlocks next lesson |

#### Reaction Predictor
| Method | Endpoint | Notes |
|---|---|---|
| GET | `/api/v1/predictor/lesson/:lesson_id` | 5 seeded MCQ questions (correct_index included for feedback UI) |
| POST | `/api/v1/predictor/lesson/:lesson_id/submit` | `{answers, elapsed_ms}` → `{score, xp_earned, coins_earned, results}` |
| GET | `/api/v1/predictor/practice` | 1 random question (no correct_index) |

#### Duel
| Method | Endpoint | Notes |
|---|---|---|
| POST | `/api/v1/duel/match` | `{name}` → `{match_id, player_index}` |
| GET | `/ws/duel?match_id=&token=` | WebSocket upgrade |

#### Profile & Social
| Method | Endpoint | Notes |
|---|---|---|
| GET | `/api/v1/profile` | Student stats: rating, XP, streak, coins, hearts |
| GET | `/api/v1/profile/history` | Recent duel results |
| GET | `/api/v1/leaderboard` | Global ranking by rating |
| GET | `/api/v1/players/:id/profile` | Public profile + history |

#### Daily Challenge
| Method | Endpoint | Notes |
|---|---|---|
| GET | `/api/v1/daily-challenge` | `{questions, my_submission, secs_to_reset}` |
| POST | `/api/v1/daily-challenge/submit` | `{answers:[{question_id, coefficients}]}` |
| GET | `/api/v1/daily-challenge/leaderboard` | Score tab + Fastest tab |

#### Sprint & Compound
| Method | Endpoint | Notes |
|---|---|---|
| GET | `/api/v1/sprint` | Today's sprint questions |
| POST | `/api/v1/sprint/submit` | Submit sprint answers |
| GET | `/api/v1/compound/daily` | Today's compound puzzle |
| POST | `/api/v1/compound/daily/submit` | Submit compound answer |

#### Teacher (requires `role=teacher` in JWT)
| Method | Endpoint | Notes |
|---|---|---|
| GET | `/api/v1/teacher/overview` | KPIs: active_students, avg_streak, lessons_this_week, at_risk_count |
| GET | `/api/v1/teacher/students` | Full roster with XP, streak, last_active |
| GET | `/api/v1/teacher/insights` | Lessons with avg score < 60% |
| GET | `/api/v1/teacher/batches` | All batches for this teacher |
| POST | `/api/v1/teacher/batches` | `{name}` → create batch |

---

## Duel Architecture — WebSockets + Redis Pub/Sub

This is the trickiest part of the system. Here's exactly how it works and why.

### The Problem

WebSocket connections are persistent and live **inside a specific process**. If you run two server pods and Player 1 connects to Pod A while Player 2 connects to Pod B, Pod A has no direct way to send a message to Player 2 — it doesn't own that connection. You can't share a WebSocket across processes.

### The Solution: Each Pod Owns Its Local Connections, Redis Owns Everything Else

Every pod maintains one in-memory map:

```go
localClients map[string][]*Client  // matchID → WebSocket connections on THIS pod
```

This is the only in-memory state. All match state, matchmaking, and event delivery go through Redis.

### How It Works Step by Step

#### 1. Matchmaking — Redis LIST `chemlingo:queue`

```
Player 1 taps "Find Match"
  → Pod A: RPOP chemlingo:queue  →  empty (nobody waiting)
  → Pod A: creates matchID, writes initial MatchState to Redis HASH
  → Pod A: LPUSH chemlingo:queue  {playerID, name, matchID}

Player 2 taps "Find Match"
  → Pod B: RPOP chemlingo:queue  →  gets Player 1's entry
  → Pod B: reads MatchState from Redis, adds Player 2, saves back
  → Pod B: returns matchID to Player 2
```

`RPOP` is atomic — even if 100 players hit the queue simultaneously, each one either wins the pop or pushes themselves. No race condition, no locks needed here.

#### 2. WebSocket Connection — Redis counter `chemlingo:match:<matchID>:conncount`

Both players open a WebSocket to whatever pod they land on (could be the same, could be different):

```
Player 1 WebSocket → Pod A:
  INCR chemlingo:match:<matchID>:conncount  →  1
  Pod A adds Player 1 to localClients[matchID]

Player 2 WebSocket → Pod B:
  INCR chemlingo:match:<matchID>:conncount  →  2  ← triggers match start
  Pod B adds Player 2 to localClients[matchID]
  Pod B calls startMatch() → writes Active state to Redis → PUBLISH match_joined
```

The counter in Redis is the single source of truth for "are both players here?" It works regardless of which pods they connected to.

#### 3. Every Event Goes Through Pub/Sub — `chemlingo:match:<matchID>`

On startup every pod runs a background goroutine:

```go
func (h *Hub) subscribeLoop() {
    pubsub := h.rdb.PSubscribe(ctx, "chemlingo:match:*")  // pattern: ALL matches
    for msg := range pubsub.Channel() {
        matchID := msg.Channel[len("chemlingo:match:"):]
        h.deliverToLocalClients(matchID, msg.Payload)     // forward to local WebSockets
    }
}
```

When any pod calls `publish(matchID, event)`, Redis delivers that message to **every pod**. Each pod then checks its own `localClients[matchID]` — if it has WebSocket connections for that match, it forwards the message. If not, it ignores it.

#### 4. Full Flow: Player 1 Submits Answer

```
Player 1 → WebSocket → Pod A receives submit_answer
  Pod A validates answer, computes result
  Pod A updates MatchState in Redis HASH
  Pod A calls publish("match_abc", validation_result)
         ↓
    Redis Pub/Sub
    chemlingo:match:match_abc
         ↓              ↓
       Pod A           Pod B
  localClients      localClients
  has P1's conn     has P2's conn
       ↓                 ↓
  sends to P1       sends to P2
```

Both players receive the same event in real-time, even though their WebSockets live on different pods. **Every message goes through Redis Pub/Sub, even when both players happen to be on the same pod** — this keeps the code uniform with no special cases.

#### 5. Match End Lock — SETNX `chemlingo:match:<matchID>:endlock`

When a match ends, multiple things can trigger `commitMatchEnd` simultaneously — both players finishing their last round, a disconnect forfeit, a timer. Without a lock, two goroutines (or two pods) could both try to write the final result to Postgres.

```go
set, err := h.rdb.SetNX(ctx, lockKey, "1", 15*time.Second).Result()
if !set {
    return // another goroutine/pod already handling this
}
// Only one winner gets here — persist ratings to Postgres, publish match_end
```

`SetNX` (Set if Not eXists) is atomic in Redis. Exactly one caller gets `set=true`. Everyone else exits early.

#### 6. Reconnect Grace Window — `chemlingo:conn:<matchID>:<playerID>`

If a player's WebSocket drops (bad network), we don't immediately forfeit them:

```
Player drops  →  Pod deletes conn key from Redis
               →  Wait 30 seconds
               →  Check if keyConn still exists (player reconnected and re-set it)
               →  If still gone → forfeit, opponent wins
```

The conn key in Redis acts as a "player is alive" signal that any pod can check.

### Visual Summary

```
         Player 1                     Player 2
            │                            │
            ▼                            ▼
┌─────────── Pod A ───────────┐  ┌───── Pod B ──────────────────┐
│  localClients:              │  │  localClients:               │
│    match_abc → [P1 conn]    │  │    match_abc → [P2 conn]     │
│                             │  │                              │
│  subscribeLoop() listening  │  │  subscribeLoop() listening   │
└──────────────┬──────────────┘  └───────────────┬──────────────┘
               │    PUBLISH/SUBSCRIBE             │
               └──────────────┬───────────────────┘
                              │
                         ┌────▼────────────────────────────────┐
                         │              Redis                   │
                         │  chemlingo:queue          (LIST)     │
                         │  chemlingo:match:<id>     (HASH)     │
                         │  chemlingo:match:<id>:*   (counters) │
                         │  chemlingo:match:<id>     (Pub/Sub)  │
                         └─────────────────────────────────────┘
```

### What Is NOT in Redis

- The WebSocket connections themselves (can't be serialized — they're OS-level file descriptors)
- The `localClients` map (intentionally per-pod; that's the point)
- Curriculum, lessons, profiles, predictor scores — all in Postgres

---

## WebSocket Protocol (Duel)

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

> WebSocket uses `?token=` query param — React Native cannot set headers on WebSocket connections.

---

## Game Rules

### Reaction Duel
- 3 rounds per match, 60 seconds per round (easy → medium → hard)
- Damage: `(30 + remaining_seconds × 0.5) × (1 − wrong_attempts × 0.1)`, floor 5
- First player to drop opponent to 0 HP wins early

### Reaction Predictor (Lesson game)
- 5 MCQ questions per lesson, seeded by lesson UUID (consistent across sessions)
- DuoLingo-style: select answer → tap CHECK → green/red feedback bar → CONTINUE
- Submits to backend on last question; navigates to Reward screen

### Daily Challenge
- 5 equations selected daily from a 15-equation pool (FNV32a hash of UTC date)
- Same 5 questions for all players that day
- Answers validated server-side only — client never receives correct coefficients
- Score = `correct × 200 + speed_bonus(300 − elapsed_secs)`

---

## Known Hard Constraints

| Constraint | Why |
|---|---|
| API 34 emulator only | API 35+ (Android 15) enforces 16 KB page alignment; Expo `.so` libs are not yet compliant |
| NDK 26.1.10909125 exactly | NDK 30 causes C++ compile errors in expo-modules-core |
| `--dev false` in bundle command | Dev mode bundle is too large and slow for the emulator |
| `getUseDeveloperSupport = false` in MainApplication.kt | Forces embedded bundle; don't revert without restoring Metro |
| `index.js` registers as `'main'` | Must match `getMainComponentName()` in `MainActivity.kt`; `registerRootComponent` registers as `'ChemLingo'` and crashes |
| `pgvector` not in plain Postgres | Full `infra/db/init.sql` won't run without the extension; use `cmd/migrate/main.go` instead |

---

## Roadmap

### Immediate (before real users)
- [ ] Registration screen
- [ ] EAS Build + GitHub Actions CI (replace manual 4-step APK cycle)
- [ ] Refresh tokens (15 min access + 7 day refresh)
- [ ] Rate limiting on `/auth/login` and `/duel/match`
- [ ] Redis pub/sub for duel hub (horizontal scaling)
- [ ] Secrets manager (remove hardcoded `JWT_SECRET`)

### Content & Progression
- [ ] Boss Battle screen (10 mixed Qs, hearts gating, 70% pass threshold)
- [ ] Streak cron job (reset broken streaks at midnight)
- [ ] Push notifications — "Your streak is at risk!" at 8 PM
- [ ] Equations moved to DB (stop hardcoding in Go)

### Social & B2B
- [ ] Student profile drill-down for teachers
- [ ] Homework assignment (teacher assigns equation set with deadline)
- [ ] Institute leaderboard (class vs class)
- [ ] Friend system + direct duel challenge

### AI Layer
- [ ] Hint engine — wrong answer 3× → contextual hint via Claude
- [ ] Adaptive difficulty — SM-2 spaced repetition per student
- [ ] Weekly weakness report — "You struggle with combustion reactions"
