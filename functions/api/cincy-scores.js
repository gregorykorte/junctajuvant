// functions/api/cincy-scores.js
const API = "https://www.thesportsdb.com/api/v1/json/3"; // free v1 key per docs
// Team IDs from TheSportsDB:
const TEAMS = [
  { id: 134923, label: "Bengals" },          // NFL
  { id: 135270, label: "Reds" },             // MLB
  { id: 136688, label: "FC Cincinnati" },    // MLS
  { id: 136877, label: "Bearcats Football" } // NCAA FBS
];

export async function onRequest() {
  try {
    const events = (await Promise.all(TEAMS.map(lastEvent))).filter(Boolean);
    if (!events.length) return new Response(JSON.stringify({}), { status: 204 });

    // Pick the most recent by timestamp
    events.sort((a, b) => b.ts - a.ts);
    const top = events[0];

    return json({
      provider: "TheSportsDB (v1)",
      league: top.league,
      date_local: new Intl.DateTimeFormat("en-US", {
        timeZone: "America/New_York", dateStyle: "medium", timeStyle: "short"
      }).format(new Date(top.ts)),
      home: top.home,
      away: top.away,
      homeScore: top.homeScore,
      awayScore: top.awayScore,
      url: top.url
    }, 120); // cache 2 minutes at the edge
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}

async function lastEvent(team) {
  const r = await fetch(`${API}/eventslast.php?id=${team.id}`);
  if (!r.ok) return null;
  const j = await r.json();
  const ev = (j.results || j.events || [])[0];
  if (!ev) return null;

  const ts = tsFrom(ev);
  const norm = {
    ts,
    league: ev.strLeague || team.label,
    home: ev.strHomeTeam,
    away: ev.strAwayTeam,
    homeScore: parseInt(ev.intHomeScore ?? 0, 10),
    awayScore: parseInt(ev.intAwayScore ?? 0, 10),
    url: ev.strPostponed === "yes" ? "" : (ev.strVideo || "")
  };
  return norm;
}

function tsFrom(ev) {
  // Prefer explicit timestamp if present, else stitch local date+time; fall back to UTC-ish.
  if (ev.strTimestamp) {
    const t = Date.parse(ev.strTimestamp);
    if (!Number.isNaN(t)) return t;
  }
  const d = ev.dateEventLocal || ev.dateEvent || "";
  const t = ev.strTimeLocal || ev.strTime || "00:00:00";
  const guess = Date.parse(`${d}T${t}`);
  if (!Number.isNaN(guess)) return guess;
  const fallback = Date.parse(`${ev.dateEvent || ""}T00:00:00Z`);
  return Number.isNaN(fallback) ? Date.now() : fallback;
}

function json(obj, sMaxAge = 300) {
  return new Response(JSON.stringify(obj), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": `s-maxage=${sMaxAge}, stale-while-revalidate=120`
    }
  });
}
