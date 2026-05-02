import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ActionSection } from "./components/ActionSection";
import { HeaderBar } from "./components/HeaderBar";
import { InvestigationSummary } from "./components/InvestigationSummary";
import { SaveInvestigationModal } from "./components/SaveInvestigationModal";
import { SettingsDrawer } from "./components/SettingsDrawer";
import { StreamCard } from "./components/StreamCard";
import { SummaryPanel } from "./components/SummaryPanel";
import { TrendSection } from "./components/TrendSection";
import { UnlockPanel } from "./components/UnlockPanel";
import { UnsavedBanner } from "./components/UnsavedBanner";
import { SEALED_KEY } from "./lib/sealed-key";
import {
  buildExportPayload,
  parseImportPayload,
  useInvestigation,
} from "./state/store";
import type { ParsedEvent, Source } from "../contracts/artifacts";

// ============================================================
// threat-trace ships Stages 1 + 2 + 3 — full pipeline.
//
//   Stage 1 — Manual orchestration: paste prompts into any chat AI,
//             paste replies back, expectations evaluate in-browser.
//   Stage 2 — Anthropic API mode: per-stream Run buttons call
//             api.anthropic.com directly with a memory-only key.
//   Stage 3 — Cross-stream synthesis: per-stream summaries, then a
//             cross-stream trend, then prioritized action items —
//             each cited back to the underlying hints, parsed events,
//             and raw log lines. The "Run investigation" button in
//             the HeaderBar orchestrates all three stages end-to-end
//             with parallel-within-stage execution (~10–12s wall).
// ============================================================

export function App(): React.ReactElement {
  const inv = useInvestigation();
  const importInputRef = useRef<HTMLInputElement>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const handleExport = useCallback(() => {
    const payload = buildExportPayload(inv.state);
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const stamp = payload.createdAt.replace(/[:.]/g, "-");
    const a = document.createElement("a");
    a.href = url;
    a.download = `threat-trace-investigation-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    inv.markExported();
  }, [inv]);

  const handleImportClick = useCallback(() => {
    setImportError(null);
    importInputRef.current?.click();
  }, []);

  const handleImportFile = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const parsed = parseImportPayload(text);
        inv.loadInvestigation(parsed);
        setImportError(null);
      } catch (err) {
        setImportError((err as Error).message);
      } finally {
        event.target.value = "";
      }
    },
    [inv],
  );

  const handleReset = useCallback(() => {
    if (
      window.confirm(
        "Reset will clear all pasted responses and start a new investigation.\n\nYour Anthropic API key (if set) is preserved.\n\nContinue?",
      )
    ) {
      inv.resetInvestigation();
      setImportError(null);
    }
  }, [inv]);

  // ============================================================
  // Modal trigger — fires once per investigation when the user
  // first reaches "all three streams have parseable JSON". After
  // dismiss, the persisted flag prevents re-showing on reload.
  //
  // Defensively gated on !anyStageRunning so the modal never opens
  // while a per-stage Run is still in flight: the modal's useEffect
  // depends on `props.onLater`, which is recreated each App render,
  // so dispatches during a run would re-fire the effect (re-focus,
  // re-attach keydown listener) on every iteration. Wait for quiet.
  // ============================================================
  const showFirstRunModal =
    inv.allStreamsParseGood &&
    !inv.state.firstSuccessfulRunModalShown &&
    !inv.anyStageRunning;

  const handleModalSave = useCallback(() => {
    handleExport();
    inv.markFirstRunModalShown();
  }, [handleExport, inv]);

  const handleModalLater = useCallback(() => {
    inv.markFirstRunModalShown();
  }, [inv]);

  // ============================================================
  // beforeunload guard — fires the browser's native "leave?"
  // dialog whenever there are unsaved changes. Modern browsers
  // ignore custom text; the act of setting returnValue is what
  // triggers the dialog.
  // ============================================================
  useEffect(() => {
    if (!inv.state.hasUnsavedChanges) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [inv.state.hasUnsavedChanges]);

  // Last 4 chars of the API key for display in the header mode pill.
  // Never the full key.
  const apiKeySuffix = useMemo(() => {
    const k = inv.state.runtime.apiKey.trim();
    if (k.length === 0) return "";
    return k.slice(-4);
  }, [inv.state.runtime.apiKey]);

  // Per-source parsed events, keyed for downstream Stage 3 components
  // that need to render trace links back to raw events.
  const parsedEventsBySource = useMemo<Record<Source, ParsedEvent[]>>(() => {
    const out: Partial<Record<Source, ParsedEvent[]>> = {};
    for (const stream of inv.streams) out[stream.source] = stream.parsedEvents;
    return out as Record<Source, ParsedEvent[]>;
  }, [inv.streams]);

  return (
    <div className="app">
      <HeaderBar
        computations={inv.computations}
        perStream={inv.state.runtime.perStream}
        backend={inv.state.runtime.backend}
        apiReady={inv.apiReady}
        apiKeySuffix={apiKeySuffix}
        anyStageRunning={inv.anyStageRunning}
        allStreamsParseGood={inv.allStreamsParseGood}
        allSummariesParseGood={inv.allSummariesParseGood}
        trendParseGood={inv.trendParseGood}
        actionParseGood={inv.actionParseGood}
        localStorageEnabled={inv.state.localStorageEnabled}
        hasUnsavedChanges={inv.state.hasUnsavedChanges}
        onToggleLocalStorage={inv.setLocalStorageEnabled}
        onExport={handleExport}
        onImport={handleImportClick}
        onReset={handleReset}
        onOpenSettings={() => setSettingsOpen(true)}
        onRunAll={inv.runFullInvestigation}
      />

      <UnsavedBanner
        visible={inv.state.hasUnsavedChanges}
        onSave={handleExport}
      />

      <input
        ref={importInputRef}
        type="file"
        accept="application/json,.json"
        style={{ display: "none" }}
        onChange={handleImportFile}
      />

      <main className="app__main">
        {importError ? (
          <div className="app__import-error" role="alert">
            <strong>Import failed:</strong> {importError}
          </div>
        ) : null}

        <section className="app__intro">
          <h1 className="app__intro-title">
            {SEALED_KEY && inv.state.runtime.apiKey === ""
              ? "Rehearse the agent. Unlock below to run the full pipeline end-to-end."
              : inv.state.runtime.backend === "anthropic"
                ? "Rehearse what an AI security agent does — every step, every citation."
                : "Walk the pipeline. You are the orchestrator."}
          </h1>
          <p className="app__intro-body">
            {SEALED_KEY && inv.state.runtime.apiKey === "" ? (
              <>
                Three streams of synthetic logs from a fictional company under
                attack: an edge tier (CDN / WAF), an identity tier (logins),
                and an api tier (application traffic). Answer the question
                below to unlock Sonnet 4. Then click <strong>Run
                investigation</strong> and watch the full pipeline — hints,
                per-stream summaries, a cross-stream trend, and prioritized
                action items — produce a cited, defensible finding in about
                ten seconds.
              </>
            ) : inv.state.runtime.backend === "anthropic" ? (
              <>
                Three streams of synthetic logs from a fictional company under
                attack: an edge tier (CDN / WAF), an identity tier (logins),
                and an api tier (application traffic). Click{" "}
                <strong>Run investigation</strong> in the header and Sonnet 4
                walks the full pipeline — hint extraction per stream, then a
                per-stream summary, a cross-stream trend, and prioritized
                action items — in about ten seconds. Every finding traces
                back to the raw log lines that justified it.
              </>
            ) : (
              <>
                Below are three streams of synthetic logs from a fictional
                company under attack: an edge tier (CDN / WAF), an identity
                tier (logins), and an api tier (application traffic). For each
                stage, copy the prompt, paste it into a chat AI of your choice
                (Claude.ai, ChatGPT, etc.), and paste the AI's JSON reply
                back. Once the three hint responses parse, the Stage 3
                surfaces (per-stream summaries → cross-stream trend → action
                items) unlock below. Every panel checks the AI's reply in
                plain English. No network calls — everything stays in your
                browser.
              </>
            )}
          </p>
        </section>

        {SEALED_KEY ? (
          <UnlockPanel
            sealedKey={SEALED_KEY}
            apiKey={inv.state.runtime.apiKey}
            backend={inv.state.runtime.backend}
            onApiKeyChange={inv.setApiKey}
            onBackendChange={inv.setBackend}
          />
        ) : null}

        {/* ============================================================
            StreamCard renders each stream's Stage 1+2 (hint) work, with
            the Stage 3a SummaryPanel passed in as children so it sits
            INSIDE the same UI bracket — the per-stream narrative reads
            hint → summary as one card.

            SummaryPanel visibility is per-stream (not global): it
            appears the moment THIS stream's hint parses cleanly,
            independent of the other two streams. With depth-first
            orchestration, that means Edge's summary panel is up and
            running while Identity's hint hasn't started yet — clean
            sequential demo.
            ============================================================ */}
        <div className="app__streams">
          {inv.streams.map((stream) => {
            const hintComp = inv.computations[stream.source];
            const hintParsed =
              hintComp.responseText.trim() !== "" &&
              hintComp.parseError === null;
            return (
              <StreamCard
                key={stream.source}
                stream={stream}
                computation={hintComp}
                backend={inv.state.runtime.backend}
                apiReady={inv.apiReady}
                perStream={inv.state.runtime.perStream[stream.source]}
                userPromptOverride={
                  inv.state.runtime.promptOverrides[stream.source]
                }
                onPromptOverrideChange={(text) =>
                  inv.setPromptOverride(stream.source, text)
                }
                onResponseChange={(text) =>
                  inv.setResponse(stream.source, text)
                }
                onClear={() => inv.clearResponse(stream.source)}
                onRun={() => inv.runStream(stream.source)}
              >
                {hintParsed ? (
                  <SummaryPanel
                    source={stream.source}
                    promptText={inv.summaryPromptText[stream.source]}
                    computation={inv.summaryComputations[stream.source]}
                    parsedEventsForExpectations={stream.parsedEvents}
                    hintsForExpectations={hintComp.hints}
                    backend={inv.state.runtime.backend}
                    apiReady={inv.apiReady}
                    perStream={
                      inv.state.runtime.summary.perStream[stream.source]
                    }
                    onResponseChange={(text) =>
                      inv.setSummaryResponse(stream.source, text)
                    }
                    onClear={() => inv.clearSummaryResponse(stream.source)}
                    onRun={() => inv.runSummary(stream.source)}
                  />
                ) : null}
              </StreamCard>
            );
          })}
        </div>

        <InvestigationSummary visible={inv.allStreamsParseGood} />

        {/* ============================================================
            Stage 3b — cross-stream trend. The first cross-stream call;
            composes the three per-stream summaries into time-aligned,
            actor-fingerprinted patterns.
            ============================================================ */}
        <TrendSection
          visible={inv.allSummariesParseGood}
          promptText={inv.trendPromptText}
          computation={inv.trendComputation}
          perStream={inv.state.runtime.trend}
          backend={inv.state.runtime.backend}
          apiReady={inv.apiReady}
          parsedEventsBySource={parsedEventsBySource}
          onResponseChange={inv.setTrendResponse}
          onClear={inv.clearTrendResponse}
          onRun={inv.runTrend}
        />

        {/* ============================================================
            Stage 3c — action items. Final synthesis: prioritized,
            owner-assigned, with rationale citing trend evidence.
            ============================================================ */}
        <ActionSection
          visible={inv.trendParseGood}
          promptText={inv.actionPromptText}
          computation={inv.actionComputation}
          perStream={inv.state.runtime.action}
          backend={inv.state.runtime.backend}
          apiReady={inv.apiReady}
          onResponseChange={inv.setActionResponse}
          onClear={inv.clearActionResponse}
          onRun={inv.runAction}
        />
      </main>

      <footer className="app__footer">
        <p>
          threat-trace · full pipeline (hint → summary → trend → action) ·{" "}
          {inv.state.runtime.backend === "anthropic"
            ? "Anthropic API mode"
            : "manual orchestration"}{" "}
          · pipeline_run_id <code>{inv.state.pipelineRunId}</code>
        </p>
      </footer>

      <SaveInvestigationModal
        open={showFirstRunModal}
        onSave={handleModalSave}
        onLater={handleModalLater}
      />

      <SettingsDrawer
        open={settingsOpen}
        backend={inv.state.runtime.backend}
        apiKey={inv.state.runtime.apiKey}
        onClose={() => setSettingsOpen(false)}
        onBackendChange={inv.setBackend}
        onApiKeyChange={inv.setApiKey}
        onForgetApiKey={inv.forgetApiKey}
      />
    </div>
  );
}
