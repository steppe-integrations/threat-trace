import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { HeaderBar } from "./components/HeaderBar";
import { InvestigationSummary } from "./components/InvestigationSummary";
import { SaveInvestigationModal } from "./components/SaveInvestigationModal";
import { SettingsDrawer } from "./components/SettingsDrawer";
import { StreamCard } from "./components/StreamCard";
import { UnlockPanel } from "./components/UnlockPanel";
import { UnsavedBanner } from "./components/UnsavedBanner";
import { SEALED_KEY } from "./lib/sealed-key";
import {
  buildExportPayload,
  parseImportPayload,
  useInvestigation,
} from "./state/store";

// ============================================================
// threat-trace ships Stages 1 + 2.
//
//   Stage 1 — Manual orchestration: paste prompts into any chat AI,
//             paste replies back, expectations evaluate in-browser.
//   Stage 2 — Anthropic API mode: per-stream Run buttons call
//             api.anthropic.com directly with a memory-only key.
//
// Stage 3 (cross-stream summary → trend → action items + trace
// explorer) is BUILT but STAGED. The compute layer (`agents/`,
// `lib/pipeline.ts`'s computeStreamSummary/computeTrend/computeAction)
// and the schema (optional fields on InvestigationFile) are kept
// in-repo for forward-compat with saved files. The UI surfaces
// (`SummaryPanel`, `TrendSection`, `ActionSection`, `TraceExplorer`)
// are present in `src/components/` but unimported here. They're
// scheduled for a one-stage-at-a-time revival in a follow-up
// iteration. See the retrospective for the failure modes and
// what changed about how we re-introduce them.
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

  return (
    <div className="app">
      <HeaderBar
        computations={inv.computations}
        perStream={inv.state.runtime.perStream}
        backend={inv.state.runtime.backend}
        apiReady={inv.apiReady}
        apiKeySuffix={apiKeySuffix}
        localStorageEnabled={inv.state.localStorageEnabled}
        hasUnsavedChanges={inv.state.hasUnsavedChanges}
        onToggleLocalStorage={inv.setLocalStorageEnabled}
        onExport={handleExport}
        onImport={handleImportClick}
        onReset={handleReset}
        onOpenSettings={() => setSettingsOpen(true)}
        onRunAll={inv.runAllStreams}
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
              ? "Run the loop. Unlock below to let Sonnet 4 run each prompt for you."
              : inv.state.runtime.backend === "anthropic"
                ? "Run the loop. Sonnet 4 runs each prompt for you."
                : "Walk the loop. You are the orchestrator."}
          </h1>
          <p className="app__intro-body">
            {SEALED_KEY && inv.state.runtime.apiKey === "" ? (
              <>
                Three streams of synthetic logs from a fictional company under
                attack: an edge tier (CDN / WAF), an identity tier (logins),
                and an api tier (application traffic). Answer the question below to enable
                Phase 2 — Sonnet 4 returns a JSON finding for each stream in
                about ten seconds.
              </>
            ) : inv.state.runtime.backend === "anthropic" ? (
              <>
                Three streams of synthetic logs from a fictional company under
                attack: an edge tier (CDN / WAF), an identity tier (logins),
                and an api tier (application traffic). With your Anthropic key set, click the{" "}
                <strong>Run</strong> button on each card and Sonnet 4 returns a
                JSON finding. The expectation panels validate the model's
                output the same way they validate manual paste responses.
              </>
            ) : (
              <>
                Below are three streams of synthetic logs from a fictional
                company under attack: an edge tier (CDN / WAF), an identity
                tier (logins), and an api tier (application traffic). For each
                one, copy the prompt, paste it into a chat AI of your choice
                (Claude.ai, ChatGPT, etc.), and paste the AI's JSON reply
                back into this page. Each card explains what to look for and
                checks the AI's answer in plain English. No network calls
                happen here — everything stays in your browser.
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

        <div className="app__streams">
          {inv.streams.map((stream) => (
            <StreamCard
              key={stream.source}
              stream={stream}
              computation={inv.computations[stream.source]}
              backend={inv.state.runtime.backend}
              apiReady={inv.apiReady}
              perStream={inv.state.runtime.perStream[stream.source]}
              userPromptOverride={
                inv.state.runtime.promptOverrides[stream.source]
              }
              onPromptOverrideChange={(text) =>
                inv.setPromptOverride(stream.source, text)
              }
              onResponseChange={(text) => inv.setResponse(stream.source, text)}
              onClear={() => inv.clearResponse(stream.source)}
              onRun={() => inv.runStream(stream.source)}
            />
          ))}
        </div>

        <InvestigationSummary visible={inv.allStreamsParseGood} />
      </main>

      <footer className="app__footer">
        <p>
          threat-trace ·{" "}
          {inv.state.runtime.backend === "anthropic"
            ? "Stage 2 Anthropic API"
            : "Stage 1 manual orchestration"}{" "}
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
