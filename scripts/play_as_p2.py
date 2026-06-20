#!/usr/bin/env python3
"""
Simulate Player 2 for Chemlingo duel testing.
Run this after launching the app on the emulator.

Usage: python3 scripts/play_as_p2.py
"""
import asyncio, json, urllib.request, urllib.error

API = "http://localhost:8080"
WS  = "ws://localhost:8080"

# Correct answers for each equation (keyed by equation id)
ANSWERS = {
    "eq_h2o":    [2, 1, 2],
    "eq_nh3":    [1, 3, 2],
    "eq_fe2o3":  [4, 3, 2],
    "eq_alcl3":  [2, 6, 2, 3],
    "eq_propane":[1, 5, 3, 4],
}

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
        print(f"Login failed ({e.code}). Make sure the backend is running and player2 exists.")
        raise

async def play(token):
    import websockets

    print("Joining match as Player 2...")
    match = post("/api/v1/duel/match", {"name": "P2-Bot"}, token)
    match_id = match["match_id"]
    status   = match["status"]
    print(f"  match_id={match_id}  status={status}")

    if status == "waiting":
        print("  No opponent in queue yet. Launch the app first, then run this script.")
        return

    url = f"{WS}/ws/duel?match_id={match_id}&token={token}"
    print(f"Connecting WebSocket...")

    async with websockets.connect(url) as ws:
        print("  Connected.\n")
        while True:
            try:
                raw = await asyncio.wait_for(ws.recv(), timeout=90)
            except asyncio.TimeoutError:
                print("No message for 90 s — exiting.")
                break

            msg = json.loads(raw)
            t   = msg["type"]
            p   = msg.get("payload", {})

            if t == "match_joined":
                print(f"[match_joined]  Match is active. Waiting for round_start...")

            elif t == "round_start":
                eq     = p.get("equation", {})
                labels = eq.get("labels", [])
                eq_id  = eq.get("id", "")
                rnd    = p.get("current_round", "?")
                print(f"\n[round_start]  Round {rnd}  |  {eq.get('display', '?')}")
                print(f"  Labels: {labels}  |  eq_id: {eq_id}")

                ans = ANSWERS.get(eq_id)
                if ans:
                    await asyncio.sleep(3)   # slight delay so it's not instant
                    payload = json.dumps({"type": "submit_answer",
                                          "payload": {"coefficients": ans}})
                    await ws.send(payload)
                    print(f"  Submitted: {ans}")
                else:
                    print(f"  Unknown equation '{eq_id}' — skipping auto-submit.")

            elif t == "validation_result":
                print(f"[validation]  correct={p.get('correct')}  damage={p.get('damage', 0):.1f}")

            elif t == "state_update":
                prog = p.get("progress", [{}, {}])
                print(f"[state_update]  HP: {prog[0].get('hp',0):.0f} vs {prog[1].get('hp',0):.0f}")

            elif t == "round_end":
                print(f"[round_end]  winner={p.get('winner_id','nobody')}  next in {p.get('next_round_in',0):.0f}s")

            elif t == "match_end":
                fs = p.get("final_state", {})
                prog = fs.get("progress", [{}, {}])
                print(f"\n[match_end]  winner={p.get('winner_id')}")
                print(f"  Final HP: {prog[0].get('hp',0):.0f} vs {prog[1].get('hp',0):.0f}")
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
