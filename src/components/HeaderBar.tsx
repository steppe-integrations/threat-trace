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
  localStorageEnabled: boolean;
  hasUnsavedChanges: boolean;
  onToggleLocalStorage: (enabled: boolean) => void;
  onExport: () => void;
  onImport: () => void;
  onReset: () => void;
  onOpenSettings: () => void;
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
): string {
  // API mode, no key set → direct user to settings
  if (backend === "anthropic" && !apiReady) {
    return "Open Settings → add your Anthropic API key to enable the Run buttons";
  }

  // API mode, any stream still running → status line
  if (backend === "anthropic") {
    const running = SOURCES.find((s) => perStream[s].status === "running");
    if (running) {
      return `Running ${STREAM_LABELS[running]} against the Anthropic API…`;
    }
    const errored = SOURCES.find((s) => perStream[s].status === "error");
    if (errored) {
      return `${STREAM_LABELS[errored]} run failed — see the error in its card and click Run again to retry`;
    }
  }

  // For BOTH modes, the same downstream rules: response missing → instruct,
  // parse error → fix, expectation failing → review.
  for (const source of SOURCES) {
    const c = computations[source];
    if (c.responseText.trim() === "") {
      if (backend === "anthropic") {
        return `Click Run on the ${STREAM_LABELS[source]} card to call the Anthropic API`;
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
  return "All three streams green. Export your investigation. Stage 3 ships in the next iteration.";
}

export function HeaderBar(props: HeaderBarProps): React.ReactElement {
  const next = nextStepLabel(
    props.computations,
    props.backend,
    props.apiReady,
    props.perStream,
  );

  // Mode pill text — shows the current backend at a glance.
  const modeLabel =
    props.backend === "anthropic"
      ? props.apiReady
        ? `API · ${props.apiKeySuffix}`
        : `API · no key`
      : `Manual`;

  return (
    <header className="header-bar">
      <div className="header-bar__row">
        <div className="header-bar__title">
          <span className="header-bar__brand">threat-trace</span>
          <span className="header-bar__separator">·</span>
          <span className="header-bar__stage">
            {props.backend === "anthropic"
              ? "Stage 2 of 3 — Anthropic API"
              : "Stage 1 of 3 — Manual Orchestration"}
          </span>
        </div>
        <div className="header-bar__controls">
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
            props.backend === "manual"
              ? "stage-pill--active"
              : "stage-pill--complete"
          }`}
          title="Stage 1: manual orchestration. The web app is the runbook; you paste prompts into any chat AI and paste replies back."
        >
          <span className="stage-pill__num">1</span>
          <span className="stage-pill__label">Manual orchestration</span>
        </div>
        <div
          className={
            props.backend === "anthropic" && props.apiReady
              ? "stage-pill stage-pill--active"
              : "stage-pill stage-pill--available"
          }
          title="Stage 2: API key support inside this same web app. Same prompts, runs automatically. Open Settings to enable."
        >
          <span className="stage-pill__num">2</span>
          <span className="stage-pill__label">Automated (API key)</span>
          {props.backend === "anthropic" && props.apiReady ? null : (
            <span className="stage-pill__lock">
              {props.backend === "anthropic" ? "needs key" : "in settings"}
            </span>
          )}
        </div>
        <div
          className="stage-pill stage-pill--available"
          title="Stage 3: cross-stream summary → trend → action items, plus a trace explorer that walks any action item back to the raw log line. Built; staged for the next iteration."
        >
          <span className="stage-pill__num">3</span>
          <span className="stage-pill__label">Full pipeline + trace explorer</span>
          <span className="stage-pill__lock">next iteration</span>
        </div>
      </div>
    </header>
  );
}
