import type { Source } from "../../contracts/artifacts";
import type { StreamComputation } from "../lib/pipeline";
import { SOURCES, STREAM_LABELS } from "../lib/pipeline";
import type { BackendMode, PerStreamRuntime } from "../state/store";

export interface HeaderBarProps {
  computations: Record<Source, StreamComputation>;
  perStream: Record<Source, PerStreamRuntime>;
  backend: BackendMode;
  apiReady: boolean;
  apiKeySuffix: string;
  /** True if any pipeline stage is in flight (hint/summary/trend/action). */
  anyStageRunning: boolean;
  /** Stage gating flags from useInvestigation. */
  allStreamsParseGood: boolean;
  allSummariesParseGood: boolean;
  trendParseGood: boolean;
  actionParseGood: boolean;
  localStorageEnabled: boolean;
  hasUnsavedChanges: boolean;
  onToggleLocalStorage: (enabled: boolean) => void;
  onExport: () => void;
  onImport: () => void;
  onReset: () => void;
  onOpenSettings: () => void;
  /** Click handler for the primary "Run investigation" CTA (full pipeline). */
  onRunAll: () => void;
}

// The "next step" line is the only place a first-time user looks
// when they don't know what to do. It must always read like an
// instruction, not a status — and always tell them WHERE to act.
function nextStepLabel(
  computations: Record<Source, StreamComputation>,
  backend: BackendMode,
  apiReady: boolean,
  perStream: Record<Source, PerStreamRuntime>,
  allStreamsParseGood: boolean,
  allSummariesParseGood: boolean,
  trendParseGood: boolean,
  actionParseGood: boolean,
  anyStageRunning: boolean,
): string {
  // API mode, no key set → direct user to settings
  if (backend === "anthropic" && !apiReady) {
    return "Open Settings → add your Anthropic API key to enable Run investigation";
  }

  // API mode, anything in flight across stages → status line
  if (backend === "anthropic" && anyStageRunning) {
    const runningHint = SOURCES.find((s) => perStream[s].status === "running");
    if (runningHint) {
      return `Running ${STREAM_LABELS[runningHint]} hint stage against the Anthropic API…`;
    }
    return "Pipeline running — synthesis stages in flight…";
  }

  // API mode, any stream errored → call out the failed one
  if (backend === "anthropic") {
    const errored = SOURCES.find((s) => perStream[s].status === "error");
    if (errored) {
      return `${STREAM_LABELS[errored]} run failed — see the error in its card and click Run again to retry`;
    }
  }

  // Stage 1+2 — hint stage gating
  for (const source of SOURCES) {
    const c = computations[source];
    if (c.responseText.trim() === "") {
      if (backend === "anthropic") {
        return "Click Run investigation in the header — Sonnet 4 walks the full pipeline in ~10 seconds";
      }
      return `Copy the ${STREAM_LABELS[source]} prompt → paste into Claude.ai or ChatGPT → paste the JSON reply into the ${STREAM_LABELS[source]} response box`;
    }
    if (c.parseError) {
      if (backend === "anthropic") {
        return `${STREAM_LABELS[source]} returned malformed JSON — click Run again or switch to Manual mode`;
      }
      return `Fix the JSON in the ${STREAM_LABELS[source]} response box (parse error)`;
    }
  }
  for (const source of SOURCES) {
    const c = computations[source];
    if (c.expectations.some((e) => !e.passed)) {
      return `Read the ${STREAM_LABELS[source]} expectations panel — one or more checks failed; the AI's response needs review`;
    }
  }

  // Stage 3a — per-stream summaries
  if (!allSummariesParseGood && allStreamsParseGood) {
    if (backend === "anthropic") {
      return "Hints in. Click Run investigation to continue with summaries → trend → actions, or click Run summary on each card";
    }
    return "Hints in. Copy each Stage 3 summary prompt below and paste the chat AI's reply back to continue";
  }

  // Stage 3b — cross-stream trend
  if (allSummariesParseGood && !trendParseGood) {
    if (backend === "anthropic") {
      return "Summaries in. Click Run trend below to correlate across streams";
    }
    return "Summaries in. Copy the Trend prompt below and paste the chat AI's reply back";
  }

  // Stage 3c — action items
  if (trendParseGood && !actionParseGood) {
    if (backend === "anthropic") {
      return "Trend in. Click Run action items below for ranked, owner-assigned recommendations";
    }
    return "Trend in. Copy the Action prompt below and paste the chat AI's reply back";
  }

  if (actionParseGood) {
    return "Investigation complete. Export to share, or Reset for a new run.";
  }

  return "All three streams green. Stage 3 unlocks below.";
}

export function HeaderBar(props: HeaderBarProps): React.ReactElement {
  const next = nextStepLabel(
    props.computations,
    props.backend,
    props.apiReady,
    props.perStream,
    props.allStreamsParseGood,
    props.allSummariesParseGood,
    props.trendParseGood,
    props.actionParseGood,
    props.anyStageRunning,
  );

  // Mode pill text — shows the current backend at a glance.
  const modeLabel =
    props.backend === "anthropic"
      ? props.apiReady
        ? `API · ${props.apiKeySuffix}`
        : `API · no key`
      : `Manual`;

  // "Run investigation" CTA — visible in API mode only. Disabled when
  // no key set or any stage in flight. Re-runs the full pipeline if
  // everything's already green.
  const runDisabled =
    !props.apiReady || props.anyStageRunning || props.backend !== "anthropic";
  const runLabel = props.anyStageRunning
    ? "Running…"
    : props.actionParseGood
      ? "Re-run investigation"
      : props.allStreamsParseGood
        ? "Continue investigation"
        : "Run investigation";

  // Stage pill states.
  const stage1Done = props.allStreamsParseGood;
  const stage2Active =
    props.backend === "anthropic" && props.apiReady && !props.allStreamsParseGood;
  const stage2Done = props.backend === "anthropic" && props.allStreamsParseGood;
  const stage3InFlight =
    props.allStreamsParseGood && !props.actionParseGood;
  const stage3Done = props.actionParseGood;

  return (
    <header className="header-bar">
      <div className="header-bar__row">
        <div className="header-bar__title">
          <span className="header-bar__brand">threat-trace</span>
          <span className="header-bar__separator">·</span>
          <span className="header-bar__stage">
            Rehearse what an AI security agent does
          </span>
        </div>
        <div className="header-bar__controls">
          {props.backend === "anthropic" ? (
            <button
              type="button"
              className={`header-bar__btn ${
                runDisabled ? "" : "header-bar__btn--primary"
              }`}
              onClick={props.onRunAll}
              disabled={runDisabled}
              title={
                !props.apiReady
                  ? "Add an API key in Settings to enable."
                  : props.anyStageRunning
                    ? "Pipeline running…"
                    : "Run hints → summaries → trend → actions, end-to-end (~10s)."
              }
            >
              {runLabel}
            </button>
          ) : null}
          <span
            className={`header-bar__mode header-bar__mode--${props.backend}${
              props.backend === "anthropic" && !props.apiReady
                ? " header-bar__mode--warn"
                : ""
            }`}
            title={
              props.backend === "anthropic"
                ? props.apiReady
                  ? "Anthropic API mode active — Run buttons call api.anthropic.com directly"
                  : "Anthropic API mode selected, but no key set. Open Settings."
                : "Manual mode — paste prompts into a chat AI yourself."
            }
          >
            {modeLabel}
          </span>
          <button
            type="button"
            className="header-bar__btn header-bar__btn--icon"
            onClick={props.onOpenSettings}
            title="Settings · backend mode and API key"
            aria-label="Open settings"
          >
            ⚙
          </button>
          <label
            className="header-bar__toggle"
            title="Off by default. When on, your investigation is saved in this browser between reloads. The API key is NEVER saved here, regardless of this toggle."
          >
            <input
              type="checkbox"
              checked={props.localStorageEnabled}
              onChange={(e) => props.onToggleLocalStorage(e.target.checked)}
            />
            Save to browser
          </label>
          <button
            type="button"
            className={`header-bar__btn ${props.hasUnsavedChanges ? "header-bar__btn--primary" : ""}`}
            onClick={props.onExport}
            title="Download a JSON file you can re-open later or share. The API key is excluded from the file."
          >
            Export
          </button>
          <button
            type="button"
            className="header-bar__btn"
            onClick={props.onImport}
            title="Load a previously exported investigation."
          >
            Import
          </button>
          <button
            type="button"
            className="header-bar__btn header-bar__btn--ghost"
            onClick={props.onReset}
            title="Discard pasted responses and start a new investigation. Backend mode and API key are preserved."
          >
            Reset
          </button>
        </div>
      </div>

      <div className="header-bar__row header-bar__row--secondary">
        <span className="header-bar__next">
          <strong>Next step:</strong> {next}
        </span>
        <span
          className="header-bar__badge header-bar__badge--local"
          title={
            props.backend === "anthropic"
              ? "Anthropic API mode: the only network calls go to api.anthropic.com using your key (memory-only). No other telemetry, no other endpoints."
              : "Manual mode: no network calls at all. Your prompts and responses live only in this browser tab unless you export them or enable 'Save to browser'."
          }
        >
          {props.backend === "anthropic"
            ? "Calls api.anthropic.com only · Key in memory"
            : "Local memory only · You are the orchestrator"}
        </span>
      </div>

      <div
        className="header-bar__stages"
        role="navigation"
        aria-label="pipeline stages"
      >
        <div
          className={`stage-pill ${
            stage1Done
              ? "stage-pill--complete"
              : props.backend === "manual"
                ? "stage-pill--active"
                : "stage-pill--available"
          }`}
          title="Stage 1: manual orchestration. The web app is the runbook; you paste prompts into any chat AI and paste replies back."
        >
          <span className="stage-pill__num">1</span>
          <span className="stage-pill__label">Manual orchestration</span>
        </div>
        <div
          className={
            stage2Done
              ? "stage-pill stage-pill--complete"
              : stage2Active
                ? "stage-pill stage-pill--active"
                : "stage-pill stage-pill--available"
          }
          title="Stage 2: API key support inside this same web app. Same prompts, runs automatically. Open Settings to enable."
        >
          <span className="stage-pill__num">2</span>
          <span className="stage-pill__label">Automated (API key)</span>
          {stage2Done || stage2Active ? null : (
            <span className="stage-pill__lock">
              {props.backend === "anthropic" ? "needs key" : "in settings"}
            </span>
          )}
        </div>
        <div
          className={
            stage3Done
              ? "stage-pill stage-pill--complete"
              : stage3InFlight
                ? "stage-pill stage-pill--active"
                : "stage-pill stage-pill--available"
          }
          title="Stage 3: cross-stream summary → trend → action items, fully cited back to raw log lines. Unlocks once Stage 1+2 hints are green."
        >
          <span className="stage-pill__num">3</span>
          <span className="stage-pill__label">Synthesis (summary → trend → actions)</span>
          {stage3Done || stage3InFlight ? null : (
            <span className="stage-pill__lock">unlocks after hints</span>
          )}
        </div>
      </div>
    </header>
  );
}
