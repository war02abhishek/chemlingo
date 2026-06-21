#!/usr/bin/env python3
"""
Simulate Player 2 for Chemlingo parallel-race duel testing.
Run this after the app has tapped PLAY on the emulator.

Usage: python3 scripts/play_as_p2.py
"""
import asyncio, json, urllib.request, urllib.error

API = "http://localhost:8080"
WS  = "ws://localhost:8080"

# Correct answers for each equation (keyed by equation id)
ANSWERS = {
    "eq_h2o":     [2, 1, 2],
    "eq_nh3":     [1, 3, 2],
    "eq_fe2o3":   [4, 3, 2],
    "eq_alcl3":   [2, 6, 2, 3],
    "eq_propane": [1, 5, 3, 4],
}
BOT_DELAY_S = 24  # seconds per equation

def post(path, body, token=None):
    data = json.dumps(body).encode()
    req  = urllib.request.Request(f"{API}{path}", data=data,
                                  headers={"Content-Type": "application/json"})
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())

def login():
    try:
        r = post("/auth/login", {"email": "player2@chemlingo.com", "password": "password123"})
        return r["token"]
    except urllib.error.HTTPError as e:
        print(f"Login failed ({e.code}). Make sure backend is running and player2 exists.")
        raise

async def play(token):
    import websockets

    print("Joining match as P2-Bot (retrying until P1 is in queue)...")
    match_id = None
    for attempt in range(30):
        match = post("/api/v1/duel/match", {"name": "P2-Bot"}, token)
        match_id = match["match_id"]
        if match["status"] == "ready":
            print(f"  Paired!  match_id={match_id}")
            break
        print(f"  Queue empty (attempt {attempt+1}/30) — retrying in 2s...")
        await asyncio.sleep(2)
    else:
        print("  Gave up after 60 s. Make sure P1 has tapped PLAY.")
        return

    url = f"{WS}/ws/duel?match_id={match_id}&token={token}"
    print(f"Connecting WebSocket to {url}")

    async with websockets.connect(url) as ws:
        print("  Connected.\n")
        equations = []      # filled from match_joined
        solved_count = 0

        while True:
            try:
                raw = await asyncio.wait_for(ws.recv(), timeout=180)
            except asyncio.TimeoutError:
                print("No message for 180 s — exiting.")
                break

            msg = json.loads(raw)
            t   = msg["type"]
            p   = msg.get("payload", {})

            if t == "match_joined":
                equations = p.get("equations", [])
                total     = p.get("total_rounds", len(equations))
                print(f"[match_joined]  Match active — {total} equations in race mode")
                for i, eq in enumerate(equations):
                    print(f"  {i+1}. {eq.get('display','?')}  id={eq.get('id')}")

                # Submit answers for each equation with a delay between each
                async def run_bot():
                    nonlocal solved_count
                    for idx, eq in enumerate(equations):
                        eq_id  = eq.get("id", "")
                        ans    = ANSWERS.get(eq_id)
                        print(f"\n[bot] Starting equation {idx+1}/{len(equations)}: {eq.get('display','?')}")
                        if ans is None:
                            print(f"  Unknown equation '{eq_id}' — skipping.")
                            continue
                        print(f"  Waiting {BOT_DELAY_S}s before submitting {ans}...")
                        await asyncio.sleep(BOT_DELAY_S)
                        payload = json.dumps({"type": "submit_answer",
                                              "payload": {"coefficients": ans}})
                        try:
                            await ws.send(payload)
                            print(f"  Submitted: {ans}")
                        except Exception:
                            print("  WS closed before submit (match ended) — stopping bot.")
                            return
                    print("\n[bot] All equations submitted.")

                asyncio.ensure_future(run_bot())

            elif t == "validation_result":
                ms = p.get("solve_time_ms", 0)
                if p.get("correct"):
                    solved_count += 1
                    print(f"[validation]  correct  time={ms/1000:.1f}s  (solved {solved_count})")
                else:
                    print(f"[validation]  wrong  attempts={p.get('wrong_attempts',0)}")

            elif t == "state_update":
                prog = p.get("progress", [{}, {}])
                p0   = prog[0]
                p1   = prog[1]
                print(f"[state_update]  "
                      f"P0: {p0.get('rounds_solved',0)}/{p.get('total_rounds','?')} "
                      f"({p0.get('total_time_ms',0)/1000:.1f}s)  "
                      f"P1: {p1.get('rounds_solved',0)}/{p.get('total_rounds','?')} "
                      f"({p1.get('total_time_ms',0)/1000:.1f}s)")

            elif t == "match_end":
                fs   = p.get("final_state", {})
                prog = fs.get("progress", [{}, {}])
                t0   = prog[0].get("total_time_ms", 0) / 1000
                t1   = prog[1].get("total_time_ms", 0) / 1000
                winner = p.get("winner_id", "?")
                print(f"\n[match_end]  winner={winner}")
                print(f"  P0 total={t0:.1f}s  P1 total={t1:.1f}s")
                break

            elif t == "error":
                print(f"[error]  {p}")

        print("\nMatch finished.")

async def main():
    try:
        import websockets  # noqa: F401
    except ImportError:
        print("Install websockets: pip3 install websockets")
        return
    token = login()
    await play(token)

asyncio.run(main())
