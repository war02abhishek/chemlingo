import { useCallback, useEffect, useRef, useState } from 'react';
import { getToken, WS_BASE } from '../core/duelApi';
import type {
  DuelPhase,
  MatchEndPayload,
  MatchState,
  ValidationResult,
  WSMessage,
} from '../types/duel';

interface DuelSocketState {
  phase: DuelPhase;
  matchState: MatchState | null;
  lastValidation: ValidationResult | null;
  matchEnd: MatchEndPayload | null;
  isConnected: boolean;
}

const INITIAL: DuelSocketState = {
  phase: 'idle',
  matchState: null,
  lastValidation: null,
  matchEnd: null,
  isConnected: false,
};

export function useDuelSocket(matchId: string | null) {
  const wsRef = useRef<WebSocket | null>(null);
  const [state, setState] = useState<DuelSocketState>(INITIAL);

  useEffect(() => {
    if (!matchId) return;

    let ws: WebSocket;
    let cancelled = false;

    (async () => {
      const token = await getToken();
      if (cancelled) return;

      const url = `${WS_BASE}/ws/duel?match_id=${encodeURIComponent(matchId)}&token=${encodeURIComponent(token ?? '')}`;
      ws = new WebSocket(url);
      wsRef.current = ws;

      setState((s) => ({ ...s, phase: 'connecting' }));

      ws.onopen = () => setState((s) => ({ ...s, isConnected: true, phase: 'waiting' }));

      ws.onmessage = ({ data }) => {
        try {
          const msg = JSON.parse(data as string) as WSMessage;
          setState((s) => applyMessage(s, msg));
        } catch { /* malformed frame */ }
      };

      ws.onclose = () => {
        wsRef.current = null;
        setState((s) => ({ ...s, isConnected: false }));
      };

      ws.onerror = () => setState((s) => ({ ...s, isConnected: false }));
    })();

    return () => {
      cancelled = true;
      ws?.close();
      wsRef.current = null;
    };
  }, [matchId]);

  const sendAnswer = useCallback((coefficients: number[]) => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'submit_answer', payload: { coefficients } }));
    }
  }, []);

  return { ...state, sendAnswer };
}

function applyMessage(s: DuelSocketState, msg: WSMessage): DuelSocketState {
  switch (msg.type) {
    case 'match_joined':
      return { ...s, matchState: msg.payload, phase: 'playing' };

    case 'state_update':
      return { ...s, matchState: msg.payload };

    case 'validation_result':
      return { ...s, lastValidation: msg.payload };

    case 'match_end':
      return {
        ...s,
        phase: 'finished',
        matchEnd: msg.payload,
        matchState: msg.payload.final_state,
      };

    default:
      return s;
  }
}
