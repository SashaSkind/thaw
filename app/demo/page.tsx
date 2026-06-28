"use client";

/**
 * Demo UI orchestrator (Brandon, Task 3) — the disposable thin client judges
 * watch. Linear flow: targeting → ranked results → person detail → hook capture
 * → draft handoff. Narrated streaming via /api/demo/stream renders steps as they
 * arrive (no blank assistant bubbles).
 */

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { TargetingPrompt } from "./components/TargetingPrompt";
import { ProspectResults } from "./components/ProspectResults";
import { PersonDetail } from "./components/PersonDetail";
import { HookCapture } from "./components/HookCapture";
import { DraftView } from "./components/DraftView";
import type {
  HookCandidate,
  NarrowResponse,
  ProspectPerson,
} from "@/lib/types";

type Stage = "target" | "narrowing" | "results" | "detail" | "hooks" | "draft";

interface StreamStep {
  type: "step";
  text: string;
}
interface StreamResult {
  type: "result";
  data: NarrowResponse;
}
type StreamEvent = StreamStep | StreamResult;

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  // next-themes hydration guard: the resolved theme is only known on the client,
  // so we intentionally flip a mount flag once after first render.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);
  if (!mounted) return <span style={{ width: 96 }} />;
  const isDark = resolvedTheme === "dark";
  return (
    <button
      className="theme-toggle"
      onClick={() => setTheme(isDark ? "light" : "dark")}
    >
      {isDark ? "☀ Light" : "☾ Dark"}
    </button>
  );
}

function Stepper({ stage }: { stage: Stage }) {
  const order: { key: string; label: string; stages: Stage[] }[] = [
    { key: "target", label: "1 · Target", stages: ["target", "narrowing"] },
    { key: "results", label: "2 · People", stages: ["results", "detail"] },
    { key: "hooks", label: "3 · Hook", stages: ["hooks"] },
    { key: "draft", label: "4 · Draft", stages: ["draft"] },
  ];
  const activeIndex = order.findIndex((o) => o.stages.includes(stage));
  return (
    <div className="stepper">
      {order.map((o, i) => (
        <span
          key={o.key}
          className={`step-pill ${
            o.stages.includes(stage) ? "active" : i < activeIndex ? "done" : ""
          }`}
        >
          {o.label}
        </span>
      ))}
    </div>
  );
}

export default function DemoPage() {
  const [stage, setStage] = useState<Stage>("target");
  const [steps, setSteps] = useState<string[]>([]);
  const [people, setPeople] = useState<ProspectPerson[]>([]);
  const [selected, setSelected] = useState<ProspectPerson | null>(null);
  const [hooks, setHooks] = useState<HookCandidate[]>([]);
  const [hooksSource, setHooksSource] = useState("fallback");
  const [findingHooks, setFindingHooks] = useState(false);
  const [confirmedHook, setConfirmedHook] = useState("");
  const [recentContext, setRecentContext] = useState<string[]>([]);
  const [angles, setAngles] = useState<string[]>([]);

  const runNarrow = async (goal: string) => {
    setStage("narrowing");
    setSteps([]);
    setPeople([]);

    const response = await fetch("/api/demo/stream", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ goal }),
    });

    if (!response.body) {
      setStage("target");
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        const event = JSON.parse(line) as StreamEvent;
        if (event.type === "step") {
          setSteps((prev) => [...prev, event.text]);
        } else if (event.type === "result") {
          setPeople(event.data.people);
          setStage("results");
        }
      }
    }
  };

  const selectPerson = (person: ProspectPerson) => {
    setSelected(person);
    setStage("detail");
  };

  const findHooks = async () => {
    if (!selected) return;
    setFindingHooks(true);
    try {
      const response = await fetch("/api/v1/hooks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ personId: selected.id }),
      });
      const data = (await response.json()) as {
        hooks: HookCandidate[];
        primarySource: string;
      };
      setHooks(data.hooks);
      setHooksSource(data.primarySource);
      setStage("hooks");
    } finally {
      setFindingHooks(false);
    }
  };

  const confirmHook = async (hook: string) => {
    if (!selected) return;
    setConfirmedHook(hook);
    const response = await fetch("/api/v1/enrich", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ personId: selected.id, confirmedHook: hook }),
    });
    const data = (await response.json()) as {
      recentContext: string[];
      suggestedAngles: string[];
    };
    setRecentContext(data.recentContext);
    setAngles(data.suggestedAngles);
    setStage("draft");
  };

  const restart = () => {
    setStage("target");
    setSteps([]);
    setPeople([]);
    setSelected(null);
    setHooks([]);
    setConfirmedHook("");
    setRecentContext([]);
    setAngles([]);
  };

  return (
    <main className="shell">
      <div className="topbar">
        <div className="brand">
          <span className="brand-dot" />
          <div>
            ColdReach Intelligence
            <small>broad goal → person → hook → draft</small>
          </div>
        </div>
        <ThemeToggle />
      </div>

      <Stepper stage={stage} />

      {(stage === "target" || stage === "narrowing") && (
        <TargetingPrompt onSubmit={runNarrow} disabled={stage === "narrowing"} />
      )}

      {stage === "narrowing" && (
        <div className="card" style={{ marginTop: 14 }}>
          <div className="narration">
            {steps.map((text, i) => {
              const isLast = i === steps.length - 1;
              return (
                <div key={`${text}-${i}`} className="narration-line">
                  {isLast ? (
                    <span className="spinner" />
                  ) : (
                    <span className="tick">✓</span>
                  )}
                  {text}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {stage === "results" && (
        <ProspectResults people={people} onSelect={selectPerson} />
      )}

      {stage === "detail" && selected && (
        <PersonDetail
          person={selected}
          finding={findingHooks}
          onFindHooks={findHooks}
          onBack={() => setStage("results")}
        />
      )}

      {stage === "hooks" && selected && (
        <HookCapture
          hooks={hooks}
          primarySource={hooksSource}
          onConfirm={confirmHook}
          onBack={() => setStage("detail")}
        />
      )}

      {stage === "draft" && selected && (
        <DraftView
          person={selected}
          confirmedHook={confirmedHook}
          angles={angles}
          recentContext={recentContext}
          onRestart={restart}
        />
      )}
    </main>
  );
}
