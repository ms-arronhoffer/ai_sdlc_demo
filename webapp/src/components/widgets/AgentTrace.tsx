"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useCountUp, useTypewriter, usePrefersReducedMotion } from "./useWidgetMotion";

/**
 * Agent Trace Visualizer.
 *
 * A cinematic, replayable timeline of a single agent run against the fictional
 * TaskFlow app. Press play and the reason → act → observe → answer loop unfolds
 * step by step: nodes light up in sequence, the token / latency / cost meters
 * tick upward in real time, and the grounded answer types itself out. Every
 * step stays clickable afterwards so you can inspect its raw payload.
 *
 * The run is intentionally *pre-recorded* (no backend) so the visualisation is
 * deterministic and always available — the live, LLM-driven experience lives in
 * the Live Agent Playground.
 */

type StepKind = "reason" | "tool" | "observe" | "answer";

interface TraceStep {
  id: string;
  kind: StepKind;
  title: string;
  detail: string;
  raw: string;
  tokensIn: number;
  tokensOut: number;
  latencyMs: number;
}

const GOAL = "Which tasks are blocked, and who owns them?";

const STEPS: TraceStep[] = [
  {
    id: "s1",
    kind: "reason",
    title: "Plan the approach",
    detail:
      "The model reads the goal and decides it needs live task data before it can answer.",
    raw: `system: You are the TaskFlow assistant. You can call tools.
user: Which tasks are blocked, and who owns them?

assistant (thought): I don't have the task list in context. I should call
query_tasks with a status filter of "blocked" and then summarise the owners.`,
    tokensIn: 412,
    tokensOut: 38,
    latencyMs: 640,
  },
  {
    id: "s2",
    kind: "tool",
    title: "Call query_tasks",
    detail: "The model emits a structured tool call with a status filter.",
    raw: `assistant (tool_call): query_tasks({
  "status": "blocked",
  "fields": ["id", "title", "owner", "blocked_reason"]
})`,
    tokensIn: 0,
    tokensOut: 29,
    latencyMs: 120,
  },
  {
    id: "s3",
    kind: "observe",
    title: "Observe tool result",
    detail: "Your code runs the query and returns rows the model can read.",
    raw: `tool_result: [
  { "id": "TF-482", "title": "Billing export", "owner": "Priya",  "blocked_reason": "waiting on finance API key" },
  { "id": "TF-491", "title": "SSO rollout",    "owner": "Marco",  "blocked_reason": "pending security review" },
  { "id": "TF-503", "title": "Mobile deep links", "owner": "Priya", "blocked_reason": "needs design sign-off" }
]`,
    tokensIn: 156,
    tokensOut: 0,
    latencyMs: 210,
  },
  {
    id: "s4",
    kind: "answer",
    title: "Compose grounded answer",
    detail:
      "With real rows in context, the model writes a concise, grounded reply.",
    raw: `assistant: 3 tasks are blocked:
• TF-482 Billing export — Priya (waiting on finance API key)
• TF-491 SSO rollout — Marco (pending security review)
• TF-503 Mobile deep links — Priya (needs design sign-off)

Priya owns two of the three blockers.`,
    tokensIn: 198,
    tokensOut: 96,
    latencyMs: 880,
  },
];

// Blended $/1K token price used purely to illustrate per-step cost.
const PRICE_PER_1K = 0.01;

const KIND_META: Record<
  StepKind,
  { label: string; dot: string; badge: string }
> = {
  reason: {
    label: "Reason",
    dot: "bg-navy",
    badge: "bg-navy/5 text-navy ring-navy/10",
  },
  tool: {
    label: "Tool call",
    dot: "bg-gold",
    badge: "bg-gold/10 text-gold ring-gold/20",
  },
  observe: {
    label: "Observe",
    dot: "bg-navy-light",
    badge: "bg-navy-light/10 text-navy-light ring-navy-light/20",
  },
  answer: {
    label: "Answer",
    dot: "bg-green-600",
    badge: "bg-green-50 text-green-700 ring-green-200",
  },
};

function stepCost(s: TraceStep): number {
  return ((s.tokensIn + s.tokensOut) / 1000) * PRICE_PER_1K;
}

const stepTokens = (s: TraceStep) => s.tokensIn + s.tokensOut;

export default function AgentTrace() {
  const reduced = usePrefersReducedMotion();

  // How many steps have been revealed by the current run (0 = idle).
  const [revealed, setRevealed] = useState(0);
  // Whether a playback is currently in progress.
  const [playing, setPlaying] = useState(false);
  // The step whose raw payload is shown in the detail panel.
  const [selected, setSelected] = useState<string | null>(null);
  // Increments on every run so counters restart their animation.
  const [runKey, setRunKey] = useState(0);

  const timers = useRef<number[]>([]);
  const clearTimers = useCallback(() => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
  }, []);

  useEffect(() => () => clearTimers(), [clearTimers]);

  const play = useCallback(() => {
    clearTimers();
    setRunKey((k) => k + 1);
    setSelected(null);
    setPlaying(true);

    if (reduced) {
      setRevealed(STEPS.length);
      setSelected(STEPS[STEPS.length - 1].id);
      setPlaying(false);
      return;
    }

    setRevealed(0);
    STEPS.forEach((step, i) => {
      const t = window.setTimeout(() => {
        setRevealed(i + 1);
        setSelected(step.id);
        if (i === STEPS.length - 1) setPlaying(false);
      }, 850 * (i + 1));
      timers.current.push(t);
    });
  }, [clearTimers, reduced]);

  const started = revealed > 0;
  const done = revealed >= STEPS.length && !playing;

  // Steps included in the live meters (only those revealed so far).
  const shownSteps = STEPS.slice(0, revealed);
  const targetTokens = shownSteps.reduce((n, s) => n + stepTokens(s), 0);
  const targetLatency = shownSteps.reduce((n, s) => n + s.latencyMs, 0);
  const targetCost = shownSteps.reduce((n, s) => n + stepCost(s), 0);

  const liveTokens = useCountUp(targetTokens, playing, `${runKey}:${revealed}`, 650);
  const liveLatency = useCountUp(targetLatency, playing, `${runKey}:${revealed}`, 650);
  const liveCost = useCountUp(targetCost, playing, `${runKey}:${revealed}`, 650);

  // Show settled values once the run completes so nothing looks mid-tween.
  const tokensDisplay = playing ? Math.round(liveTokens) : targetTokens;
  const latencyDisplay = playing ? liveLatency : targetLatency;
  const costDisplay = playing ? liveCost : targetCost;

  const active = STEPS.find((s) => s.id === selected) ?? null;
  const answerStepRevealed = revealed >= STEPS.length;
  const answerText = STEPS[STEPS.length - 1].raw.replace(/^assistant:\s*/, "");
  const typed = useTypewriter(answerText, answerStepRevealed && !reduced, 12);

  return (
    <div className="rounded-xl border border-cream-dark bg-white shadow-sm overflow-hidden">
      {/* Goal + transport bar */}
      <div className="flex flex-wrap items-center gap-3 border-b border-cream-dark bg-cream-dark/40 px-4 py-3">
        <span className="text-[10px] font-mono uppercase tracking-widest text-slate-mid">
          Agent goal
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-navy">
          {GOAL}
        </span>
        <button
          type="button"
          onClick={play}
          className="inline-flex items-center gap-2 rounded-full bg-navy px-3.5 py-1.5 text-xs font-semibold text-white ring-1 ring-navy/10 transition-all hover:bg-navy-mid hover:-translate-y-px disabled:opacity-70"
          disabled={playing}
        >
          {playing ? (
            <>
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-gold opacity-70" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-gold" />
              </span>
              Running…
            </>
          ) : (
            <>
              <span aria-hidden>{done ? "↻" : "▶"}</span>
              {done ? "Replay run" : "Run agent"}
            </>
          )}
        </button>
      </div>

      <div className="grid gap-0 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        {/* Timeline */}
        <ol className="relative min-h-[220px] space-y-1 p-4">
          <span
            aria-hidden
            className="absolute left-[26px] top-6 bottom-6 w-px bg-cream-dark"
          />
          {!started && (
            <li className="flex h-full min-h-[188px] flex-col items-center justify-center gap-3 text-center">
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-navy/5 text-navy ring-1 ring-navy/10">
                ▶
              </span>
              <p className="max-w-[220px] text-sm text-slate-mid">
                Press <span className="font-semibold text-navy">Run agent</span>{" "}
                to watch the reason → act → observe loop unfold step by step.
              </p>
            </li>
          )}
          {STEPS.map((s, i) => {
            const meta = KIND_META[s.kind];
            const isShown = i < revealed;
            if (!isShown) return null;
            const isActive = s.id === selected;
            const isLatest = playing && i === revealed - 1;
            return (
              <li
                key={s.id}
                className="relative"
                style={{
                  animation: reduced
                    ? undefined
                    : "rise-in 0.5s var(--ease-out-soft) both",
                }}
              >
                <button
                  type="button"
                  onClick={() => setSelected(s.id)}
                  aria-pressed={isActive}
                  className={`group flex w-full items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-all ${
                    isActive
                      ? "border-navy/25 bg-cream-dark/40 shadow-sm"
                      : "border-transparent hover:border-cream-dark hover:bg-cream-dark/20"
                  }`}
                >
                  <span
                    className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white ring-4 ring-white ${meta.dot} ${
                      isLatest ? "ring-gold/30" : ""
                    }`}
                  >
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span
                        className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ring-1 ${meta.badge}`}
                      >
                        {meta.label}
                      </span>
                      <span className="truncate text-sm font-medium text-navy">
                        {s.title}
                      </span>
                    </span>
                    <span className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] font-mono text-slate-mid">
                      <span>{stepTokens(s)} tok</span>
                      <span>{s.latencyMs} ms</span>
                      <span>${stepCost(s).toFixed(4)}</span>
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>

        {/* Detail panel */}
        <div className="flex flex-col border-t border-cream-dark bg-navy p-4 md:border-l md:border-t-0">
          {active ? (
            <>
              <div className="mb-3 flex items-center justify-between gap-2">
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ${KIND_META[active.kind].badge}`}
                >
                  {KIND_META[active.kind].label}
                </span>
                <span className="text-[10px] font-mono text-white/40">
                  raw step payload
                </span>
              </div>
              <p className="mb-3 text-sm text-white/70">{active.detail}</p>
              {active.kind === "answer" ? (
                <div className="rounded-lg border border-gold/30 bg-white/5 p-3 ring-1 ring-white/10">
                  <p className="mb-1 text-[10px] font-mono uppercase tracking-widest text-gold">
                    Grounded answer
                  </p>
                  <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words font-sans text-sm leading-relaxed text-white/90">
                    {typed.shown}
                    {!typed.done && (
                      <span className="ml-0.5 inline-block h-4 w-1.5 -translate-y-px animate-pulse bg-gold align-middle" />
                    )}
                  </pre>
                </div>
              ) : (
                <pre className="max-h-64 overflow-auto rounded-lg bg-black/30 p-3 text-[11px] leading-relaxed text-white/90 font-mono whitespace-pre-wrap ring-1 ring-white/10">
                  <code>{active.raw}</code>
                </pre>
              )}
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center text-center">
              <p className="max-w-[240px] text-sm text-white/45">
                The raw prompt, tool call, and observation for each step will
                appear here as the agent runs.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Totals */}
      <dl className="grid grid-cols-3 divide-x divide-cream-dark border-t border-cream-dark">
        {[
          {
            label: "Total tokens",
            value: Math.round(tokensDisplay).toLocaleString(),
          },
          { label: "End-to-end", value: `${(latencyDisplay / 1000).toFixed(1)} s` },
          { label: "Run cost", value: `$${costDisplay.toFixed(4)}` },
        ].map((m) => (
          <div key={m.label} className="px-4 py-3 text-center">
            <dt className="text-[10px] uppercase tracking-widest text-slate-mid">
              {m.label}
            </dt>
            <dd className="mt-0.5 font-serif text-lg font-semibold tabular-nums text-navy">
              {m.value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
