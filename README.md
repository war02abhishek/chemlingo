# ChemLingo — Phase 1 MVP

Duolingo-style micro-learning platform for 12th Grade Inorganic Chemistry (JEE/NEET).

## Architecture

```
ChemLingo/
├── rn_app/          # React Native (Expo) student app
├── backend/         # Go (Gin) REST + WebSocket API
├── ai_service/      # Python (FastAPI + LangChain) hint microservice
└── infra/           # Docker Compose (Postgres + pgvector + Redis)
```

### React Native App Structure
```
rn_app/
├── App.jsx                          # Entry point
└── src/
    ├── core/
    │   ├── api.js                   # Axios API client (JWT via AsyncStorage)
    │   ├── navigation/index.jsx     # React Navigation stack + bottom tabs
    │   └── store/drillStore.js      # Zustand global state
    └── features/
        ├── auth/LoginScreen.jsx
        ├── drill/
        │   ├── DrillScreen.jsx
        │   └── widgets/
        │       ├── ReactionMatcher.jsx
        │       ├── TrendSlider.jsx
        │       ├── ColorPrecipitateId.jsx
        │       └── ExceptionBossFight.jsx
        ├── leaderboard/LeaderboardScreen.jsx
        └── streak/StreakScreen.jsx
```

## React Native vs React Web — Key Differences

If you know React web, here's what changes in React Native:

| Web | React Native |
|---|---|
| `<div>` | `<View>` |
| `<p>`, `<span>` | `<Text>` (ALL text must be inside `<Text>`) |
| `<button>` | `<TouchableOpacity>` or `<Pressable>` |
| `<input>` | `<TextInput>` |
| `<ul>` / `<li>` | `<FlatList>` |
| `<img>` | `<Image>` |
| CSS files | `StyleSheet.create({})` — same properties, camelCase |
| `onClick` | `onPress` |
| `localStorage` | `AsyncStorage` (async!) |
| React Router | React Navigation |
| Redux / Zustand | Same Zustand works ✅ |
| `fetch` / axios | Same axios works ✅ |

> No browser, no DOM. Everything renders to native iOS/Android views.

## Quick Start (Local Dev)

### Prerequisites
- [Node.js](https://nodejs.org) 18+
- [Expo CLI](https://docs.expo.dev/get-started/installation/): `npm install -g expo-cli`
- For Android: Android Studio + emulator **or** [Expo Go](https://expo.dev/go) app on your phone
- For iOS (Mac only): Xcode + simulator **or** Expo Go app

### 1. Start Infrastructure
```bash
cd infra
docker compose up -d
```
Postgres runs on `localhost:5432`, Redis on `localhost:6379`.
Schema and seed data are applied automatically via `db/init.sql`.

### 2. Start Backend
```bash
cd backend
go mod tidy
go run main.go
```
Runs on `http://localhost:8080`.

### 3. Start AI Service
```bash
cd ai_service
python -m venv .venv
.venv\Scripts\Activate.ps1
.venv\Scripts\activate.bat
pip install -r requirements.txt

# Set your LLM key
export GOOGLE_API_KEY=your_key        # for Gemini (default)
# OR
export OPENAI_API_KEY=your_key
export LLM_PROVIDER=openai

uvicorn main:app --reload --port 8000
```

### 4. Run React Native App
```bash
cd rn_app
npm install
npm start          # opens Expo dev server
```

Then:
- Press `a` to open Android emulator
- Press `i` to open iOS simulator (Mac only)
- Scan the QR code with **Expo Go** app on your phone (easiest for first run)

#### API URL for physical device
If running on a real phone (not emulator), update the base URL in `src/core/api.js`:
```js
// Replace with your machine's local IP
const BASE_URL = 'http://192.168.x.x:8080';
```
Android emulator uses `10.0.2.2` to reach host `localhost` — this is already the default.

## Environment Variables (Backend)

| Variable | Default | Description |
|---|---|---|
| `PORT` | `8080` | Server port |
| `DATABASE_URL` | `postgres://chemlingo:chemlingo_secret@localhost:5432/chemlingo` | Postgres DSN |
| `REDIS_URL` | `redis://localhost:6379` | Redis address |
| `JWT_SECRET` | `change-me-in-production` | JWT signing key |
| `AI_SERVICE_URL` | `http://localhost:8000` | AI microservice URL |

## API Reference

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/auth/login` | ❌ | Login, returns JWT |
| GET | `/api/v1/drills/due` | ✅ | Fetch SRS-scheduled drills |
| POST | `/api/v1/drills/attempt` | ✅ | Submit answer, updates SRS + XP |
| GET | `/api/v1/leaderboard` | ✅ | Institute-scoped leaderboard |
| GET | `/api/v1/ws` | ✅ | WebSocket (Time-Attack mode) |

## Drill Types (Phase 1)

| Type | Widget File | Description |
|---|---|---|
| `reaction_matcher` | `ReactionMatcher.jsx` | Pick the correct product for a given reaction |
| `trend_slider` | `TrendSlider.jsx` | Reorder elements by a periodic property |
| `color_precipitate_id` | `ColorPrecipitateId.jsx` | Identify compound from its color |
| `exception_boss_fight` | `ExceptionBossFight.jsx` | 60-second rapid-fire exceptions round |

## Extensibility Notes

- **New drill types**: Add to `drill_type` enum in DB + new widget in `rn_app/src/features/drill/widgets/` + entry in `DRILL_WIDGETS` map in `DrillScreen.jsx`
- **New AI features**: Add endpoints to `ai_service/main.py`
- **New backend features**: Add handler in `backend/internal/handler/`, register route in `main.go`
- **Multi-tenancy**: All student data is isolated via Postgres Row-Level Security — new institutes just need a row in `institutes` table
