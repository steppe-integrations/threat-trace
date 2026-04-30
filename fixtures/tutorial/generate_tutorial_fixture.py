#!/usr/bin/env python3
"""
Tutorial fixture generator for the threat-trace pipeline.

Scenario
--------
Password spray against GasperCards' identity tenant from a single
TOR exit IP (185.220.101.42). The attacker scraped employee names
from LinkedIn and is hitting 30 known users with a common password
("Spring2026!") between 14:00:03 and 14:01:30 UTC, ~3 second cadence.

GasperCards routes login traffic through an edge tier (CDN / WAF)
in front of the identity provider, so the traffic IS visible to the
edge. No WAF rule fires because the /u/login/* paths are in 'log'
mode (this is the trade-off the DevOps team made). The identity
tier records 30 failed-password events from the same IP. The api
tier records no related events -- the spray hasn't succeeded.

Fixture data shapes
-------------------
Output files contain Cloudflare GraphQL Analytics, Auth0 tenant log,
and Azure App Insights AppRequest shapes respectively. They are the
most well-documented public schemas at each tier; the parsers in
parsers/{edge,identity,api}.ts are written against these shapes but
the output ParsedEvent contract is vendor-agnostic. To swap in a
different vendor (Fastly / Akamai for edge, Okta / Cognito for
identity, etc.), replace the per-source parser; nothing above it
changes.

Expected pipeline output
------------------------
ONE primary finding from the trend agent:

    "30 failed identity logins from 185.220.101.42 in 90 seconds,
     all distinct usernames, with corresponding edge requests not
     blocked by WAF. api stream uncorrelated. Suspected password
     spray; block the IP at the edge and audit affected users.
     Monitor api for follow-up activity from this actor."

This validates:
  1. Cross-stream correlation between edge and identity works.
  2. The model does NOT hallucinate api correlation when none exists.
  3. Provenance chains back to specific event IDs are intact.

Run
---
    python generate_tutorial_fixture.py

Outputs edge.json, identity.json, api.json next to this script.
"""

import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

# ---------------------------------------------------------------------------
# Scenario constants
# ---------------------------------------------------------------------------

WINDOW_START = datetime(2026, 4, 28, 14, 0, 0, tzinfo=timezone.utc)
WINDOW_END   = datetime(2026, 4, 28, 14, 30, 0, tzinfo=timezone.utc)

# The bad actor
ATTACK_IP        = "185.220.101.42"
ATTACK_ASN       = 4224
ATTACK_ASN_NAME  = "TOR-EXIT"
ATTACK_CC        = "DE"
ATTACK_UA_CF     = "Mozilla/5.0 (compatible; HTTrack 3.0x; Windows 98)"
ATTACK_UA_AUTH0  = "HTTrack 3.0x / Windows 98"

# Tenant identifiers (all .example TLD - reserved for documentation)
HOST_AUTH = "auth.gasper-cards.example"
HOST_APP  = "app.gasper-cards.example"
HOST_API  = "api.gasper-cards.example"
TENANT    = "gasper-cards-prod"

AUTH0_CLIENT_ID     = "1aB2cD3eF4gH5iJ6kL7m8N9o0pQ1rS2t"
AUTH0_CLIENT_NAME   = "GasperCards Web"
AUTH0_CONNECTION    = "Username-Password-Authentication"
AUTH0_CONNECTION_ID = "con_AbCdEf123456"

# Sprayed users (fictional employee list)
TARGETS = [
    "john.smith", "mary.johnson", "james.williams", "patricia.brown",
    "robert.jones", "jennifer.garcia", "michael.miller", "linda.davis",
    "william.rodriguez", "elizabeth.martinez", "david.hernandez", "barbara.lopez",
    "richard.gonzalez", "susan.wilson", "joseph.anderson", "jessica.thomas",
    "thomas.taylor", "sarah.moore", "charles.jackson", "karen.martin",
    "christopher.lee", "nancy.perez", "daniel.thompson", "lisa.white",
    "matthew.harris", "betty.sanchez", "anthony.clark", "helen.ramirez",
    "mark.lewis", "sandra.robinson",
]

# Legit users (background traffic)
ALICE = ("alice.chen",     "auth0|65a1f2b3c4d5e6f701234567", "198.51.100.5",  "10.0.12.42")
BOB   = ("bob.kowalski",   "auth0|65a1f2b3c4d5e6f701234568", "203.0.113.42",  "10.0.12.43")
CAROL = ("carol.diaz",     "auth0|65a1f2b3c4d5e6f701234569", "203.0.113.117", "10.0.12.44")

LEGIT_UA_CHROME  = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
LEGIT_UA_FIREFOX = "Mozilla/5.0 (X11; Linux x86_64; rv:124.0) Gecko/20100101 Firefox/124.0"

def email(user_handle: str) -> str:
    return f"{user_handle}@gasper-cards.example"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def iso(dt: datetime) -> str:
    """ISO 8601 with millisecond precision and Z suffix."""
    return dt.strftime("%Y-%m-%dT%H:%M:%S.") + f"{dt.microsecond // 1000:03d}Z"

def cf_ray(seq: int) -> str:
    return f"8a1f2b3c4d5e6f{seq:02x}"

def auth0_log_id(dt: datetime, seq: int) -> str:
    return f"9002{dt.strftime('%Y%m%d%H%M%S')}{seq:04d}"

def opid(prefix: str, seq: int) -> str:
    return f"{prefix}-{seq:04x}-{seq*7919:08x}"[:40]

# ---------------------------------------------------------------------------
# Cloudflare event templates
# ---------------------------------------------------------------------------

def cf_event_attack(seq: int, dt: datetime) -> dict:
    """An attack POST to Auth0 universal-login password endpoint."""
    return {
        "datetime": iso(dt),
        "rayName": cf_ray(seq),
        "clientIP": ATTACK_IP,
        "clientASN": ATTACK_ASN,
        "clientASNDescription": ATTACK_ASN_NAME,
        "clientCountryName": ATTACK_CC,
        "clientRequestHTTPHost": HOST_AUTH,
        "clientRequestPath": "/u/login/password",
        "clientRequestMethod": "POST",
        "clientRequestBytes": 487,
        "edgeResponseStatus": 302,
        "edgeResponseBytes": 1024,
        "userAgent": ATTACK_UA_CF,
        "wafAction": "log",
        "botScore": 12,
        "botScoreSrcName": "machineLearning",
    }

def cf_event_legit(seq: int, dt: datetime, *, ip: str, ua: str,
                   path: str, method: str = "GET", status: int = 200,
                   host: str = HOST_APP, country: str = "US",
                   asn: int = 22773, asn_name: str = "ASN-CXA-ALL-CCI-22773-RDC",
                   bytes_in: int = 320, bytes_out: int = 4096,
                   bot_score: int = 88) -> dict:
    """A legitimate request from a normal user."""
    return {
        "datetime": iso(dt),
        "rayName": cf_ray(seq),
        "clientIP": ip,
        "clientASN": asn,
        "clientASNDescription": asn_name,
        "clientCountryName": country,
        "clientRequestHTTPHost": host,
        "clientRequestPath": path,
        "clientRequestMethod": method,
        "clientRequestBytes": bytes_in,
        "edgeResponseStatus": status,
        "edgeResponseBytes": bytes_out,
        "userAgent": ua,
        "wafAction": "allow",
        "botScore": bot_score,
        "botScoreSrcName": "machineLearning",
    }

# ---------------------------------------------------------------------------
# Auth0 event templates
# ---------------------------------------------------------------------------

def auth0_fp(seq: int, dt: datetime, target_email: str) -> dict:
    """Failed password event."""
    return {
        "_id": auth0_log_id(dt, seq),
        "log_id": auth0_log_id(dt, seq),
        "date": iso(dt),
        "type": "fp",
        "description": "Wrong email or password.",
        "connection": AUTH0_CONNECTION,
        "connection_id": AUTH0_CONNECTION_ID,
        "client_id": AUTH0_CLIENT_ID,
        "client_name": AUTH0_CLIENT_NAME,
        "ip": ATTACK_IP,
        "user_agent": ATTACK_UA_AUTH0,
        "user_name": target_email,
        "tenant_name": TENANT,
        "details": {"error": {"message": "Wrong email or password."}},
    }

def auth0_s(seq: int, dt: datetime, *, user_name: str, user_id: str,
            ip: str, ua: str) -> dict:
    """Successful login event."""
    return {
        "_id": auth0_log_id(dt, seq),
        "log_id": auth0_log_id(dt, seq),
        "date": iso(dt),
        "type": "s",
        "description": "Successful login",
        "connection": AUTH0_CONNECTION,
        "connection_id": AUTH0_CONNECTION_ID,
        "client_id": AUTH0_CLIENT_ID,
        "client_name": AUTH0_CLIENT_NAME,
        "ip": ip,
        "user_agent": ua,
        "user_name": user_name,
        "user_id": user_id,
        "tenant_name": TENANT,
        "details": {"prompts": [], "stats": {"loginsCount": 47}},
    }

def auth0_fp_legit_typo(seq: int, dt: datetime, *, user_name: str,
                        ip: str, ua: str) -> dict:
    """Single failed password from a legit user (typo, not attack)."""
    return {
        "_id": auth0_log_id(dt, seq),
        "log_id": auth0_log_id(dt, seq),
        "date": iso(dt),
        "type": "fp",
        "description": "Wrong email or password.",
        "connection": AUTH0_CONNECTION,
        "connection_id": AUTH0_CONNECTION_ID,
        "client_id": AUTH0_CLIENT_ID,
        "client_name": AUTH0_CLIENT_NAME,
        "ip": ip,
        "user_agent": ua,
        "user_name": user_name,
        "tenant_name": TENANT,
        "details": {"error": {"message": "Wrong email or password."}},
    }

# ---------------------------------------------------------------------------
# API (App Insights) event templates
# ---------------------------------------------------------------------------

def api_event(seq: int, dt: datetime, *, path: str, method: str = "GET",
              result: str = "200", duration_ms: float = 145.0,
              user_id: str | None = None, browser: str = "Chrome 124",
              extra_dims: dict | None = None) -> dict:
    """Standard App Insights AppRequest row."""
    op = f"{method} " + path.split("/api/v1/")[-1].split("?")[0].title().replace("/", "/")
    dims = {"TenantId": "gasper-cards", "AuthScheme": "Bearer"}
    if extra_dims:
        dims.update(extra_dims)
    return {
        "timestamp": iso(dt),
        "name": f"{method} {path}",
        "id": opid("req", seq),
        "url": f"https://{HOST_API}{path}",
        "resultCode": result,
        "duration": duration_ms,
        "operation_Name": op,
        "operation_Id": opid("op", seq),
        "user_Id": user_id,
        "user_AuthenticatedId": user_id,
        "client_IP": "0.0.0.0",   # App Insights anonymizes
        "client_Browser": browser,
        "appName": "gasper-cards-api",
        "cloud_RoleName": "gasper-cards-api",
        "customDimensions": dims,
    }

# ---------------------------------------------------------------------------
# Scenario assembly
# ---------------------------------------------------------------------------

def main():
    cf_events: list[dict] = []
    auth0_events: list[dict] = []
    api_events: list[dict] = []

    cf_seq = auth0_seq = api_seq = 0

    # === ATTACK SEQUENCE: 30 spray attempts at 3-second cadence ===
    for i, target in enumerate(TARGETS):
        attack_dt = WINDOW_START + timedelta(seconds=3 + i * 3)
        cf_seq += 1
        cf_events.append(cf_event_attack(cf_seq, attack_dt))
        # Auth0 records ~120ms after CF (after the request reaches the IDP)
        auth0_seq += 1
        auth0_events.append(auth0_fp(auth0_seq, attack_dt + timedelta(milliseconds=120),
                                     email(target)))

    # === LEGIT TRAFFIC: Alice's normal session ===
    # Alice signs in at 14:05:22 from corp IP, Chrome
    alice_handle, alice_uid, alice_pub_ip, _ = ALICE
    alice_login_dt = WINDOW_START + timedelta(minutes=5, seconds=22)

    # CF: GET login page, POST password, GET callback, GET app
    for offset_s, path, method, status, bytes_out in [
        (0,  "/u/login/identifier", "GET",  200, 6400),
        (3,  "/u/login/password",   "POST", 302, 1024),
        (4,  "/authorize/callback", "GET",  302, 512),
        (5,  "/",                   "GET",  200, 14800),
    ]:
        cf_seq += 1
        host = HOST_AUTH if path.startswith("/u/") or path.startswith("/authorize") else HOST_APP
        cf_events.append(cf_event_legit(
            cf_seq, alice_login_dt + timedelta(seconds=offset_s),
            ip=alice_pub_ip, ua=LEGIT_UA_CHROME,
            path=path, method=method, status=status,
            host=host, bytes_out=bytes_out,
        ))
    # Auth0 success
    auth0_seq += 1
    auth0_events.append(auth0_s(auth0_seq,
                                alice_login_dt + timedelta(seconds=3, milliseconds=180),
                                user_name=email(alice_handle), user_id=alice_uid,
                                ip=alice_pub_ip, ua=LEGIT_UA_CHROME))
    # API calls from Alice's session
    for offset_s, path in [
        (8,  "/api/v1/users/me"),
        (12, "/api/v1/cards"),
        (24, "/api/v1/cards/card_abc123/balance"),
        (47, "/api/v1/cards/card_abc123/transactions?limit=20"),
    ]:
        api_seq += 1
        api_events.append(api_event(
            api_seq, alice_login_dt + timedelta(seconds=offset_s),
            path=path, user_id=alice_uid, browser="Chrome 124",
            duration_ms=110.0 + (offset_s % 4) * 18,
        ))

    # === LEGIT TRAFFIC: Bob's normal session ===
    bob_handle, bob_uid, bob_pub_ip, _ = BOB
    bob_login_dt = WINDOW_START + timedelta(minutes=12, seconds=55)

    for offset_s, path, method, status, bytes_out in [
        (0, "/u/login/identifier", "GET",  200, 6400),
        (4, "/u/login/password",   "POST", 302, 1024),
        (5, "/authorize/callback", "GET",  302, 512),
        (6, "/",                   "GET",  200, 14800),
    ]:
        cf_seq += 1
        host = HOST_AUTH if path.startswith("/u/") or path.startswith("/authorize") else HOST_APP
        cf_events.append(cf_event_legit(
            cf_seq, bob_login_dt + timedelta(seconds=offset_s),
            ip=bob_pub_ip, ua=LEGIT_UA_FIREFOX,
            path=path, method=method, status=status,
            host=host, bytes_out=bytes_out,
        ))
    auth0_seq += 1
    auth0_events.append(auth0_s(auth0_seq,
                                bob_login_dt + timedelta(seconds=4, milliseconds=210),
                                user_name=email(bob_handle), user_id=bob_uid,
                                ip=bob_pub_ip, ua=LEGIT_UA_FIREFOX))
    for offset_s, path in [
        (10, "/api/v1/users/me"),
        (15, "/api/v1/cards"),
        (28, "/api/v1/cards/card_def456/transactions?limit=50"),
    ]:
        api_seq += 1
        api_events.append(api_event(
            api_seq, bob_login_dt + timedelta(seconds=offset_s),
            path=path, user_id=bob_uid, browser="Firefox 124",
            duration_ms=130.0 + (offset_s % 5) * 12,
        ))

    # === LEGIT TRAFFIC: Carol typos password, retries successfully ===
    # This is a legitimate fp event that the model must NOT confuse with the spray
    carol_handle, carol_uid, carol_pub_ip, _ = CAROL
    carol_dt = WINDOW_START + timedelta(minutes=18, seconds=0)

    cf_seq += 1
    cf_events.append(cf_event_legit(
        cf_seq, carol_dt, ip=carol_pub_ip, ua=LEGIT_UA_CHROME,
        path="/u/login/password", method="POST", status=302,
        host=HOST_AUTH, bytes_out=1024,
    ))
    auth0_seq += 1
    auth0_events.append(auth0_fp_legit_typo(
        auth0_seq, carol_dt + timedelta(milliseconds=130),
        user_name=email(carol_handle), ip=carol_pub_ip, ua=LEGIT_UA_CHROME,
    ))
    # 15 seconds later, Carol fixes typo and gets in
    cf_seq += 1
    cf_events.append(cf_event_legit(
        cf_seq, carol_dt + timedelta(seconds=15),
        ip=carol_pub_ip, ua=LEGIT_UA_CHROME,
        path="/u/login/password", method="POST", status=302,
        host=HOST_AUTH, bytes_out=1024,
    ))
    auth0_seq += 1
    auth0_events.append(auth0_s(
        auth0_seq, carol_dt + timedelta(seconds=15, milliseconds=140),
        user_name=email(carol_handle), user_id=carol_uid,
        ip=carol_pub_ip, ua=LEGIT_UA_CHROME,
    ))
    for offset_s, path in [
        (20, "/api/v1/users/me"),
        (25, "/api/v1/cards"),
    ]:
        api_seq += 1
        api_events.append(api_event(
            api_seq, carol_dt + timedelta(seconds=offset_s),
            path=path, user_id=carol_uid, browser="Chrome 124",
            duration_ms=120.0,
        ))

    # === BACKGROUND TRAFFIC ===
    # Health checks every 5 minutes from monitoring
    for minute in [3, 8, 13, 18, 23, 28]:
        hc_dt = WINDOW_START + timedelta(minutes=minute, seconds=0)
        cf_seq += 1
        cf_events.append(cf_event_legit(
            cf_seq, hc_dt, ip="10.0.0.99", ua="kube-probe/1.27",
            path="/health", method="GET", status=200,
            host=HOST_APP, country="US", asn=14618, asn_name="AMAZON-AES",
            bytes_in=120, bytes_out=64, bot_score=2,
        ))
        api_seq += 1
        api_events.append(api_event(
            api_seq, hc_dt + timedelta(seconds=1), path="/health",
            user_id=None, browser="kube-probe/1.27",
            duration_ms=8.0, extra_dims={"Probe": "liveness"},
        ))

    # Existing-session API traffic from a user already authenticated before window
    existing_uid = "auth0|65a1f2b3c4d5e6f701234580"
    for offset_min, path in [
        (1, "/api/v1/cards"),
        (4, "/api/v1/cards/card_xyz789/balance"),
        (7, "/api/v1/cards/card_xyz789/transactions?limit=10"),
        (16, "/api/v1/users/me"),
        (22, "/api/v1/cards/card_xyz789/freeze"),
    ]:
        api_seq += 1
        method = "POST" if path.endswith("/freeze") else "GET"
        api_events.append(api_event(
            api_seq, WINDOW_START + timedelta(minutes=offset_min, seconds=12),
            path=path, method=method, user_id=existing_uid,
            browser="Chrome 124", duration_ms=160.0 + offset_min * 4,
        ))

    # Two unrelated 401s -- legitimate user with expired token. The trend
    # agent should NOT conflate these with attack signal.
    api_seq += 1
    api_events.append(api_event(
        api_seq, WINDOW_START + timedelta(minutes=9, seconds=33),
        path="/api/v1/cards", user_id=existing_uid, browser="Chrome 124",
        result="401", duration_ms=11.0,
        extra_dims={"FailureReason": "TokenExpired"},
    ))
    api_seq += 1
    api_events.append(api_event(
        api_seq, WINDOW_START + timedelta(minutes=9, seconds=44),
        path="/api/v1/users/me", user_id=existing_uid, browser="Chrome 124",
        result="401", duration_ms=9.0,
        extra_dims={"FailureReason": "TokenExpired"},
    ))

    # A handful of static asset fetches (CF only) for realism
    for offset_min, path in [
        (5, "/static/js/app.4f8c.js"),
        (5, "/static/css/main.2a1b.css"),
        (12, "/static/img/logo.svg"),
        (18, "/static/js/app.4f8c.js"),
    ]:
        cf_seq += 1
        cf_events.append(cf_event_legit(
            cf_seq, WINDOW_START + timedelta(minutes=offset_min, seconds=27),
            ip=alice_pub_ip if offset_min < 12 else carol_pub_ip,
            ua=LEGIT_UA_CHROME, path=path, method="GET", status=200,
            host=HOST_APP, bytes_out=24000, bot_score=85,
        ))

    # === Sort each stream by timestamp ===
    cf_events.sort(key=lambda e: e["datetime"])
    auth0_events.sort(key=lambda e: e["date"])
    api_events.sort(key=lambda e: e["timestamp"])

    # === Wrap as fixture envelopes ===
    out_dir = Path(__file__).parent

    edge_fixture = {
        "source": "edge",
        "query": "Cloudflare GraphQL httpRequestsAdaptiveGroups, all events, last 30m",
        "time_range_start": iso(WINDOW_START),
        "time_range_end": iso(WINDOW_END),
        "events": cf_events,
    }
    identity_fixture = {
        "source": "identity",
        "query": "Auth0 tenant logs, last 30m, all event types",
        "time_range_start": iso(WINDOW_START),
        "time_range_end": iso(WINDOW_END),
        "events": auth0_events,
    }
    api_fixture = {
        "source": "api",
        "query": "AppRequests | where timestamp >= ago(30m)",
        "time_range_start": iso(WINDOW_START),
        "time_range_end": iso(WINDOW_END),
        "events": api_events,
    }

    (out_dir / "edge.json").write_text(
        json.dumps(edge_fixture, indent=2) + "\n", encoding="utf-8"
    )
    (out_dir / "identity.json").write_text(
        json.dumps(identity_fixture, indent=2) + "\n", encoding="utf-8"
    )
    (out_dir / "api.json").write_text(
        json.dumps(api_fixture, indent=2) + "\n", encoding="utf-8"
    )

    print(f"edge.json     : {len(cf_events):>3} events")
    print(f"identity.json : {len(auth0_events):>3} events")
    print(f"api.json      : {len(api_events):>3} events")
    print()
    print(f"Encoded pattern : password spray from {ATTACK_IP}")
    print(f"                  {len(TARGETS)} attempts in 90s window")
    print(f"                  visible in edge + identity; api uncorrelated")


if __name__ == "__main__":
    main()
