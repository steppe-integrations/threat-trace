import type {
  ActionItem,
  AnomalyHint,
  ParsedEvent,
  Source,
  StreamSummary,
  Trend,
} from "../contracts/artifacts";

// ============================================================
// Behavior expectations — shared across the API harness and the
// web app so both surfaces assert exactly the same things.
//
// These are *prompt behavior* checks, not contract checks. A
// failure here means the prompt needs tuning, not that the code
// is broken.
//
// Each expectation carries an `explanation` and a `contrast` —
// plain-English prose meant to teach a non-technical user *why*
// the check exists, regardless of whether it passed or failed.
// The pass/fail badge tells them the verdict; the prose tells
// them the lesson. This is the demystification surface.
// ============================================================

export interface StreamCheckInput {
  source: Source;
  parsed: ParsedEvent[];
  hints: AnomalyHint[];
}

export interface ExpectationResult {
  label: string;
  passed: boolean;
  detail?: string;
  /** True for the load-bearing negative-correlation checks. */
  loadBearing?: boolean;
  /** Plain-English: what this check is asking and why it matters. */
  explanation?: string;
  /** Plain-English: what the right shape of evidence looks like. */
  contrast?: string;
  /**
   * The takeaway sentence the Director should walk away with on PASS.
   * Truth-first, action-oriented when natural ("Block the IP",
   * "Audit accounts", "Ignore them"). This is the demystification
   * payoff — explanation → decision.
   */
  passConclusion?: string;
  /**
   * Same shape as passConclusion, but framed for the FAIL case where
   * the AI got it wrong. The truth is the same; the framing
   * acknowledges the AI's mistake so the Director knows to trust
   * the data, not the AI's silence/false alarm.
   */
  failConclusion?: string;
}

const ATTACKER_IP = "185.220.101.42";

function evaluateEdge(input: StreamCheckInput): ExpectationResult[] {
  const cited = input.hints.some((h) => {
    if (h.description.includes(ATTACKER_IP)) return true;
    return input.parsed
      .filter((p) => h.evidence_event_ids.includes(p.id))
      .some((p) => p.actor.ip === ATTACKER_IP);
  });
  return [
    {
      label: `Edge hints reference the attacker IP (${ATTACKER_IP})`,
      passed: cited,
      detail:
        input.hints.length === 0
          ? "The AI returned no findings for this stream."
          : undefined,
      explanation:
        "At the edge, a password spray shows up as many login POSTs from a single IP in a tight window. The attacker IP 185.220.101.42 is the loudest signal in the edge stream.",
      contrast:
        "If the AI did not reference that IP in any hint, it missed the headline event — 30 POSTs to /u/login/password from one TOR-exit, all in 90 seconds.",
      passConclusion:
        "This is a password spray from 185.220.101.42. Block the IP at the edge and tighten WAF posture for /u/login/* — currently in log mode, not block.",
      failConclusion:
        "This is still a password spray from 185.220.101.42 — the data is unambiguous even if the AI didn't flag the IP. Block it at the edge anyway.",
    },
  ];
}

function evaluateIdentity(input: StreamCheckInput): ExpectationResult[] {
  const fpEventIds = new Set(
    input.parsed
      .filter(
        (p) =>
          p.event_type === "identity.login.failed" &&
          p.actor.ip === ATTACKER_IP,
      )
      .map((p) => p.id),
  );
  const cites = input.hints.some((h) => {
    const cited = h.evidence_event_ids.filter((id) => fpEventIds.has(id));
    return cited.length >= 5;
  });
  return [
    {
      label: "Identity hints cite the attacker failed-login burst",
      passed: cites,
      detail:
        input.hints.length === 0
          ? "The AI returned no findings for this stream."
          : undefined,
      explanation:
        "The identity tier records each failed password attempt as a failed-login event (Auth0's 'fp' code in this fixture). A burst of these from one IP across many distinct usernames in seconds is the canonical password-spray fingerprint.",
      contrast:
        "30 failed-login events from 185.220.101.42, each targeting a different employee, all within 90 seconds. The AI should group them into one finding — not 30 unrelated failures.",
      passConclusion:
        "30 employees were targeted by one actor in 90 seconds. None succeeded — audit those accounts and force password resets if any have weak passwords.",
      failConclusion:
        "30 failed-login events from 185.220.101.42 ARE one coordinated event, even if the AI didn't connect them. Treat them as a single password-spray finding and audit the affected accounts.",
    },
  ];
}

function evaluateApi(input: StreamCheckInput): ExpectationResult[] {
  const tokenExpired401Ids = new Set(
    input.parsed
      .filter(
        (p) =>
          p.event_type === "api.request.unauthorized" &&
          p.extra?.["FailureReason"] === "TokenExpired",
      )
      .map((p) => p.id),
  );
  const offenders = input.hints.filter((h) =>
    h.evidence_event_ids.some((id) => tokenExpired401Ids.has(id)),
  );
  return [
    {
      label: "API hint agent does NOT flag the two TokenExpired 401s as attack",
      passed: offenders.length === 0,
      detail:
        offenders.length > 0
          ? `The AI flagged ${
              offenders.length === 1
                ? "1 finding that includes"
                : `${offenders.length} findings that include`
            } the benign token-expiry 401s as evidence of attack.`
          : undefined,
      loadBearing: true,
      explanation:
        "Not every HTTP 401 is an attack. These two come from a logged-in user whose session token expired — the customDimensions field FailureReason: TokenExpired says so directly. Flagging them as malicious is a false positive.",
      contrast:
        "Real attack traffic shows repeated failures across many distinct users from the same IP, with no benign FailureReason. Token expirations are isolated, from one authenticated user, and the dimensions name the cause.",
      passConclusion:
        "These two API errors are normal token expirations from a logged-in user. They are not part of the attack and can be ignored.",
      failConclusion:
        "These two API errors are normal token expirations and are NOT part of the attack — the AI got it wrong. You can safely ignore them; the data confirms they are unrelated.",
    },
  ];
}

export function evaluateExpectations(
  input: StreamCheckInput,
): ExpectationResult[] {
  switch (input.source) {
    case "edge":
      return evaluateEdge(input);
    case "identity":
      return evaluateIdentity(input);
    case "api":
      return evaluateApi(input);
  }
}

// ============================================================
// Stage 3 expectations — Summary, Trend, Action.
//
// Summary checks are softer (per-stream prose mentions the right
// IP / does not lean attack-y). The load-bearing negative checks
// concentrate at the Trend stage — that's where false-positive
// cross-stream correlation actually fires. Action checks are
// loose because action selection is more subjective; we verify
// the table-stakes priorities exist.
// ============================================================

export interface SummaryCheckInput {
  source: Source;
  summary: StreamSummary;
  parsedEvents: ParsedEvent[];
}

function lowerNarrative(s: StreamSummary): string {
  return s.narrative.toLowerCase();
}

function evaluateEdgeSummary(
  input: SummaryCheckInput,
): ExpectationResult[] {
  const mentionsIp = input.summary.narrative.includes(ATTACKER_IP);
  return [
    {
      label: `Edge summary names the attacker IP (${ATTACKER_IP})`,
      passed: mentionsIp,
      detail: mentionsIp
        ? undefined
        : "The summary did not mention the attacker IP — the headline pattern of the stream is missing.",
      explanation:
        "A per-stream summary should distill the dominant pattern in plain English. For the edge stream in this fixture, that pattern is the password-spray POSTs from 185.220.101.42 — naming the IP is what makes the summary actionable.",
      contrast:
        "A summary that says 'multiple login POSTs were observed' without naming the source IP is the kind of vague output that defeats the point of summarizing.",
      passConclusion:
        "The edge summary correctly names the attacker IP. Pass this summary forward to the trend agent.",
      failConclusion:
        "The edge summary buried the headline. Re-run, or trust the underlying hints rather than the summary text.",
    },
  ];
}

function evaluateIdentitySummary(
  input: SummaryCheckInput,
): ExpectationResult[] {
  const mentionsIp = input.summary.narrative.includes(ATTACKER_IP);
  return [
    {
      label: `Identity summary names the attacker IP (${ATTACKER_IP})`,
      passed: mentionsIp,
      detail: mentionsIp
        ? undefined
        : "The summary did not mention the attacker IP across the failed-login burst.",
      explanation:
        "The identity stream sees 30 failed logins from one IP across distinct usernames in 90 seconds. The summary should name the IP and the burst — that's the password-spray fingerprint.",
      contrast:
        "A summary that says 'failed login attempts were observed' without naming the actor or the burst character is undercooked.",
      passConclusion:
        "The identity summary correctly identifies the attacker fingerprint. Pass this summary forward.",
      failConclusion:
        "The identity summary missed the burst character. The 30 failed-login events ARE one coordinated finding — re-run if you can.",
    },
  ];
}

function evaluateApiSummary(input: SummaryCheckInput): ExpectationResult[] {
  // We expect the API summary NOT to lean attack-y. Look for
  // attack-coded language as a warning signal. This is a soft
  // check — the load-bearing test is at the trend stage.
  const lower = lowerNarrative(input.summary);
  const flagsAttack =
    lower.includes("attack") ||
    lower.includes("spray") ||
    lower.includes("intrusion") ||
    lower.includes("compromise") ||
    lower.includes("malicious");
  const namesBenignReason =
    lower.includes("tokenexpired") ||
    lower.includes("token expir") ||
    lower.includes("benign") ||
    lower.includes("routine") ||
    lower.includes("no notable") ||
    lower.includes("nothing notable");

  return [
    {
      label:
        "API summary frames the 401s as benign / does not lean attack-y",
      passed: !flagsAttack || namesBenignReason,
      detail: flagsAttack && !namesBenignReason
        ? "The summary uses attack-coded language about a stream whose only failures were token expirations."
        : undefined,
      explanation:
        "The API stream has two 401s caused by a routine token expiration (FailureReason: TokenExpired). A good summary either says 'no notable activity' or names the benign reason. It should NOT use attack-coded language for this stream.",
      contrast:
        "Real attack traffic at the API tier would show a 401 spike across many distinct users from one IP, with no benign FailureReason. Two isolated TokenExpired 401s from one logged-in user are routine.",
      passConclusion:
        "The API summary correctly frames the 401s as benign. The trend agent will not be misled by attack-coded language.",
      failConclusion:
        "The API summary leans attack-y about routine token expiry. Watch the trend stage carefully — false correlation is more likely if the summary primes it.",
    },
  ];
}

export function evaluateSummaryExpectations(
  input: SummaryCheckInput,
): ExpectationResult[] {
  switch (input.source) {
    case "edge":
      return evaluateEdgeSummary(input);
    case "identity":
      return evaluateIdentitySummary(input);
    case "api":
      return evaluateApiSummary(input);
  }
}

// ============================================================
// Trend expectations — load-bearing.
// ============================================================

export interface TrendCheckInput {
  trends: Trend[];
  parsedEventsBySource: Record<Source, ParsedEvent[]>;
}

export function evaluateTrendExpectations(
  input: TrendCheckInput,
): ExpectationResult[] {
  const tokenExpired401Ids = new Set(
    (input.parsedEventsBySource["api"] ?? [])
      .filter(
        (p) =>
          p.event_type === "api.request.unauthorized" &&
          p.extra?.["FailureReason"] === "TokenExpired",
      )
      .map((p) => p.id),
  );

  const trendsCorrelatingApi = input.trends.filter((t) =>
    t.evidence.some(
      (ev) =>
        ev.source === "api" &&
        ev.parsed_event_ids.some((id) => tokenExpired401Ids.has(id)),
    ),
  );

  // Positive: at least one trend should cite edge+identity cross-stream
  const edgeIdentityTrends = input.trends.filter((t) => {
    const sources = new Set(t.evidence.map((ev) => ev.source));
    return sources.has("edge") && sources.has("identity");
  });

  return [
    {
      label:
        "At least one trend correlates edge + identity (the password spray)",
      passed: edgeIdentityTrends.length >= 1,
      detail:
        edgeIdentityTrends.length === 0
          ? input.trends.length === 0
            ? "The AI returned no trends at all. The genuine cross-stream pattern was missed."
            : "No trend cites both the edge and identity streams. The cross-stream pattern is the attack — it should be the primary trend."
          : undefined,
      explanation:
        "The password spray is visible in two streams simultaneously: the edge stream records the POSTs, the identity stream records the failed logins. The trend agent's primary job is to compose them into one finding rather than leaving them as two unrelated stream-level observations.",
      contrast:
        "30 edge POSTs to /u/login/password from 185.220.101.42 align by time and actor with 30 identity failed-login events from the same IP. That alignment is the trend.",
      passConclusion:
        "The trend agent correctly composed the cross-stream pattern. The action agent now has a real cross-stream Trend to act on.",
      failConclusion:
        "The trend agent failed to compose edge+identity into one finding. The pattern is in the data — re-run, or build the action items from the per-stream summaries by hand.",
    },
    {
      label:
        "No trend correlates the API TokenExpired 401s with the attack",
      passed: trendsCorrelatingApi.length === 0,
      detail:
        trendsCorrelatingApi.length > 0
          ? `${trendsCorrelatingApi.length} trend(s) cite a TokenExpired 401 as cross-stream evidence — the load-bearing false-positive guard failed at the trend tier.`
          : undefined,
      loadBearing: true,
      explanation:
        "The api stream's two 401s are routine token expirations from a legitimate user. They share no actor fingerprint with the edge+identity spray. Correlating them anyway is the canonical false-positive trap — and it cascades into a misleading action item if uncaught.",
      contrast:
        "A real cross-stream api correlation would show 401s from the attacker's IP, in the same time window, with NO benign FailureReason. The actual fixture has none of those properties.",
      passConclusion:
        "The trend agent correctly excluded the benign API 401s from the cross-stream pattern. No false-positive cascade into actions.",
      failConclusion:
        "The trend agent invented a cross-stream correlation with the benign API 401s. The action items derived from this trend will be wrong — re-run or strip API evidence from the trend by hand.",
    },
  ];
}

// ============================================================
// Action expectations — pragmatic.
// ============================================================

export interface ActionCheckInput {
  actions: ActionItem[];
}

export function evaluateActionExpectations(
  input: ActionCheckInput,
): ExpectationResult[] {
  const lowerActions = input.actions.map((a) => ({
    a,
    titleLower: a.title.toLowerCase(),
    descLower: a.description.toLowerCase(),
  }));

  const hasBlockIp = lowerActions.some(
    ({ a, titleLower, descLower }) =>
      a.priority === "P1" &&
      (titleLower.includes("block") || descLower.includes("block")) &&
      (titleLower.includes(ATTACKER_IP) ||
        descLower.includes(ATTACKER_IP) ||
        titleLower.includes("ip") ||
        descLower.includes("ip")),
  );

  const hasAuditUsers = lowerActions.some(
    ({ a, titleLower, descLower }) =>
      a.priority === "P1" &&
      (titleLower.includes("audit") ||
        titleLower.includes("reset") ||
        descLower.includes("audit") ||
        descLower.includes("password reset")),
  );

  return [
    {
      label: "At least one P1 action to block the attacker IP",
      passed: hasBlockIp,
      detail: hasBlockIp
        ? undefined
        : "No P1 action mentions blocking. The most urgent and reversible step against an active spray is missing.",
      explanation:
        "When a TOR-exit is actively spraying credentials, blocking the source IP at the edge is the cheapest, most reversible mitigation. It belongs at P1 — same urgency tier as user safety.",
      contrast:
        "The fixture's documented expected output is exactly this: one P1 to block 185.220.101.42 at the edge, owned by devops.",
      passConclusion:
        "The action agent correctly produced the P1 IP-block. This is the action you ship to devops first.",
      failConclusion:
        "Block 185.220.101.42 at the edge anyway. The action agent missed the most urgent recommendation.",
    },
    {
      label:
        "At least one P1 action to audit affected users / reset passwords",
      passed: hasAuditUsers,
      detail: hasAuditUsers
        ? undefined
        : "No P1 action covers user-side response. Even if the spray didn't succeed, 30 named accounts were targeted — they need verification.",
      explanation:
        "30 employees were targeted by name. The spray didn't succeed in the fixture window, but the attacker's target list is now known to them. Auditing those accounts and forcing password resets if any have weak passwords is the user-side counterpart to the IP block.",
      contrast:
        "The fixture's documented expected output names this action explicitly: one P1 to audit affected users, owned by security.",
      passConclusion:
        "The action agent correctly produced the user-side P1. Hand it to security alongside the IP-block.",
      failConclusion:
        "Audit those 30 accounts anyway. Both halves of the response — block the source AND verify the targets — are needed.",
    },
  ];
}
