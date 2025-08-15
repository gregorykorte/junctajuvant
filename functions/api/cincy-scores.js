// functions/api/cincy-scores.js
//
// Cincinnati “latest score” endpoint for Cloudflare Pages Functions.
// - Default: checks Bengals, Reds, FC Cincinnati, Bearcats Football; returns the most recent event.
// - Override with ?team=<TheSportsDB team id> (e.g., 134923 for Bengals).
// - Add ?raw=1 to include the raw upstream event for debugging.
// - Uses TheSportsDB “demo” key unless THE_SPORTS_DB_KEY / TSD_KEY is bound.
//
// Tip (local dev): if your corporate network MITMs TLS, local fetch() from the
// runtime may fail. Deploy a Preview to test the function on Cloudflare’s edge.

const DEFAULT_TEAMS = [
  { id: 134923, label: "Bengals" },           // NFL
  { id: 135270, label: "Reds" },              // MLB
  { id: 136688, label: "FC Cincinnati" },     // MLS
  { id: 136877, label: "Bearcats Football" }, // NCAA FBS
];

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const teamParam = url.searchParams.get("team");   // optional TheSportsDB team id
  const includeRaw = url.searchParams.get("raw") === "1";

  // Allow an env var to override the API key; fall back to demo key "3".
  const apiKey = (env?.THE_SPORTS_DB_KEY || env?.TSD_KEY || "3").trim();
  const API = `https://www.thesportsdb.com/api/v1/json/${apiKey}`;

  try {
    let events = [];

    if (teamParam) {
      // Single team
      const ev = await fetchLastEvent(API, Number(teamParam));
      if (ev) events.push(ev);
    } else {
      // All default Cincy teams in parallel
      events = (await Promise.all(DEFAULT_TEAMS.map(t => fetchLastEvent(API, t.id)))).filter(Boolean);
    }

    if (!events.length) {
      return json({}, 204, 60); // No Content
    }

    // Pick the newest by timestamp
    events.sort((a, b) => b.ts - a.ts);
    const top = events[0];

    const payload = {
      provider: "TheSportsDB (v1)",
      league: top.league,
      date_local: new Intl.DateTimeFormat("en-US", {
        timeZone: "America/New_York",
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(top.ts)),
      home: top.home,
      away: top.away,
      homeScore: top.homeScore,
      awayScore: top.awayScore,
      url: top.url,
    };

    if (includeRaw) payload._raw = top._raw;

    return json(payload, 200, 300); // cache 5 minutes, allow SWR below
  } catch (e) {
    return json({ error: e?.message || String(e) }, 500, 30);
  }
}

/** Fetch and normalize the most recent event for a team id. */
async function fetchLastEvent(API, teamId) {
  if (!Number.isFinite(teamId)) return null;

  // Upstream sometimes returns { events: [...] } or { results: [...] }
  const r = await fetch(`${API}/eventslast.php?id=${teamId}`, {
    headers: {
      "User-Agent": "junctajuvant.com (Cloudflare Pages Function)",
      "Accept": "application/json",
    },
  });

  // Surface upstream failures cleanly
  if (!r.ok) {
    throw new Error(`Upstream ${r.status} from TheSportsDB for team ${teamId}`);
  }

  // Some upstreams return text/html on error; guard the JSON parse.
  const text = await r.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Non-JSON response from TheSportsDB for team ${teamId}`);
  }

  const arr = Array.isArray(data?.results)
    ? data.results
    : Array.isArray(data?.events)
      ? data.events
      : [];

  const ev = arr[0];
  if (!ev) return null;

  const ts = normalizeTs(ev); // robust timestamp extraction
  return {
    ts,
    league: ev.strLeague || "",
    home: ev.strHomeTeam || "",
    away: ev.strAwayTeam || "",
    homeScore: toInt(ev.intHomeScore),
    awayScore: toInt(ev.intAwayScore),
    url: ev.strPostponed === "yes" ? "" : (ev.strVideo || ""),
    _raw: ev,
  };
}

/** Convert various date/time fields from TheSportsDB to a usable epoch ms. */
function normalizeTs(ev) {
  // Best case: strTimestamp is an ISO-ish string
  if (ev?.strTimestamp) {
    const t0 = Date.parse(ev.strTimestamp);
    if (!Number.isNaN(t0)) return t0;
  }
  // Next: separate local date/time fields
  const d = ev?.dateEventLocal || ev?.dateEvent || "";
  const t = ev?.strTimeLocal || ev?.strTime || "00:00:00";
  const guess = Date.parse(`${d}T${t}`);
  if (!Number.isNaN(guess)) return guess;

  // Fallback: just the date at midnight UTC
  const fallback = Date.parse(`${ev?.dateEvent || ""}T00:00:00Z`);
  return Number.isNaN(fallback) ? Date.now() : fallback;
}

function toInt(v) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : 0;
}

function json(obj, status = 200, sMaxAge = 300) {
  return new Response(status === 204 ? null : JSON.stringify(obj), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": `s-maxage=${sMaxAge}, stale-while-revalidate=120`,
    },
  });
}
