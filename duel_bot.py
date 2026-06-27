#!/usr/bin/env python3
"""
Flasky Duel Bot — joins as player 2 so you can test the duel feature solo.

Setup (one time):
  pip install websocket-client requests

Usage:
  python3 duel_bot.py                        # auto-join / create match
  python3 duel_bot.py --slow                 # adds 2-3s delay per answer (harder to beat)
  python3 duel_bot.py --match <match_id>     # join a specific match ID

The bot logs in as newstudent@flasky.com and immediately joins the matchmaking
queue. Open the Duel screen on your phone at the same time — they'll be paired.
"""

import json
import time
import threading
import argparse
import ssl
import sys

try:
    import websocket
    import requests
except ImportError:
    print("Missing deps. Run:  pip install websocket-client requests")
    sys.exit(1)

# ── Config ────────────────────────────────────────────────────────────────────

BASE_URL = "https://flasky-qn0j.onrender.com"
WS_URL   = "wss://flasky-qn0j.onrender.com"

BOT_EMAIL    = "newstudent@flasky.com"
BOT_PASSWORD = "password123"
BOT_NAME     = "🤖 Bot"

# ── Auth ──────────────────────────────────────────────────────────────────────

def login():
    print(f"[bot] Logging in as {BOT_EMAIL}...")
    r = requests.post(f"{BASE_URL}/auth/login",
                      json={"email": BOT_EMAIL, "password": BOT_PASSWORD},
                      timeout=15, verify=False)
    r.raise_for_status()
    data = r.json()
    token = data["token"]
    name  = data["student"]["full_name"]
    print(f"[bot] Logged in as '{name}'")
    return token

def join_match(token, match_id=None):
    if match_id:
        # We still need to register as player 2 on this specific match.
        # The server uses JoinOrCreate — if the match already has player 1 waiting
        # this call pairs us. But if match_id is already full it will create a new
        # match. Just warn the user.
        print(f"[bot] Joining specific match {match_id}...")

    r = requests.post(f"{BASE_URL}/api/v1/duel/match",
                      json={"name": BOT_NAME},
                      headers={"Authorization": f"Bearer {token}"},
                      timeout=15, verify=False)
    r.raise_for_status()
    resp = r.json()
    mid  = resp["match_id"]
    pidx = resp["player_index"]
    status = resp["status"]
    print(f"[bot] Match {mid}  player_index={pidx}  status={status}")
    return mid

# ── WebSocket bot ─────────────────────────────────────────────────────────────

def run_bot(token, match_id, slow=False):
    url = f"{WS_URL}/ws/duel?match_id={match_id}&token={token}"

    # Shared state across callbacks
    ctx = {
        "equations":     [],
        "current_round": 0,   # 0-indexed
        "active":        False,
        "ws":            None,
    }

    def submit_current():
        idx = ctx["current_round"]
        if idx >= len(ctx["equations"]):
            print("[bot] All equations submitted — waiting for match_end")
            return
        eq      = ctx["equations"][idx]
        answers = eq["answers"]
        delay   = 2.5 if slow else 0.4
        print(f"[bot] Round {idx+1}/{len(ctx['equations'])}: '{eq['display']}' "
              f"→ submitting {answers} in {delay}s")
        time.sleep(delay)
        msg = json.dumps({"type": "submit_answer", "payload": {"coefficients": answers}})
        ctx["ws"].send(msg)

    def on_open(ws):
        ctx["ws"] = ws
        print(f"[bot] WebSocket connected")

    def on_message(ws, raw):
        try:
            msg     = json.loads(raw)
            mtype   = msg.get("type", "?")
            payload = msg.get("payload")
        except Exception:
            return

        if mtype == "state_update":
            state = payload
            status = state.get("status")

            # Grab equations the first time they arrive
            if state.get("equations") and not ctx["equations"]:
                ctx["equations"] = state["equations"]
                print(f"[bot] Received {len(ctx['equations'])} equations")

            if status == "active" and not ctx["active"]:
                ctx["active"] = True
                print("[bot] Match is ACTIVE — starting to solve")
                threading.Thread(target=submit_current, daemon=True).start()

            elif status == "finished":
                winner = state.get("winner", "")
                print(f"[bot] Match finished. winner_id={winner!r}")
                ws.close()

        elif mtype == "validation_result":
            correct = payload.get("correct", False)
            if correct:
                solve_ms = payload.get("solve_time_ms", 0)
                print(f"[bot] ✓ Correct  ({solve_ms}ms)")
                ctx["current_round"] += 1
                threading.Thread(target=submit_current, daemon=True).start()
            else:
                attempts = payload.get("wrong_attempts", "?")
                print(f"[bot] ✗ Wrong attempt #{attempts} — retrying")
                # Should never happen since we submit the server's own answers,
                # but retry just in case.
                threading.Thread(target=submit_current, daemon=True).start()

        elif mtype == "match_end":
            print(f"[bot] match_end received: {json.dumps(payload, indent=2)}")
            ws.close()

        elif mtype == "error":
            print(f"[bot] ERROR from server: {payload}")

        elif mtype == "pong":
            pass  # keep-alive, ignore

        else:
            print(f"[bot] <- {mtype}")

    def on_error(ws, error):
        print(f"[bot] WS error: {error}")

    def on_close(ws, code, msg):
        print(f"[bot] Disconnected ({code}: {msg})")

    ws = websocket.WebSocketApp(
        url,
        on_open=on_open,
        on_message=on_message,
        on_error=on_error,
        on_close=on_close,
    )
    # ping_interval keeps the 75s read deadline alive on the server
    ws.run_forever(ping_interval=50, ping_timeout=10,
                   sslopt={"cert_reqs": ssl.CERT_NONE})


# ── Entry point ───────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Flasky Duel Bot")
    parser.add_argument("--match", metavar="MATCH_ID",
                        help="Join a specific match ID instead of auto-matchmaking")
    parser.add_argument("--slow", action="store_true",
                        help="Add 2-3s delay per answer so you can beat the bot")
    args = parser.parse_args()

    try:
        token    = login()
        match_id = join_match(token, args.match)
        print(f"\n[bot] Open Duel on your phone NOW to be paired with this match.\n")
        run_bot(token, match_id, slow=args.slow)
    except requests.HTTPError as e:
        print(f"[bot] HTTP error: {e.response.status_code} {e.response.text}")
        sys.exit(1)
    except KeyboardInterrupt:
        print("\n[bot] Stopped.")

if __name__ == "__main__":
    main()
