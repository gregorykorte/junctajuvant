// Cloudflare Pages Function
// Route: /api/cincy-scores
// Usage: fetch('/api/cincy-scores') -> { label, date_local, games: [...] }

export const onRequest = async (ctx) => {
  try {
    const API = "https://www.thesportsdb.com/api/v1/json/3";
    const TZ = "America/New_York";

    // ——— Teams to include (ID preferred; name fallback works too)
const DEFAULT_TEAMS = [
  { id: 134923, label: "Bengals" },                   // NFL
  { id: 135270, label: "Reds" },                      // MLB
  { id: 136688, label: "FC Cincinnati" },             // MLS
  { id: 136877, label: "Bearcats Football" },         // NCAA FBS
  { id: 138702, label: "Bearcats Basketball" },       // NCAA MBB
  { id: 138662, label: "Musketeers Basketball" },     // NCAA MBB
];

    // Optional: allow ?team=134923 to filter to a single team id (useful for testing)
    const url = new URL(ctx.request.url);
    const onlyTeamId = url.searchParams.get("team");
    const raw = url.searchParams.get("raw");

    const teams = onlyTeamId
      ? DEFAULT_TEAMS.filter(t => String(t.id) === String(onlyTeamId))
      : DEFAULT_TEAMS.slice();

    // ——— Helpers
    const fetchJSON = async (u) => {
      const r = await fetch(u, { headers: { "User-Agent": "JunctaJuvant/1.0" }});
      if (!r.ok) throw new Error(`HTTP ${r.status} for ${u}`);
      return r.json();
    };

    const toLocal = (d) => new Date(d.toLocaleString("en-US", { timeZone: TZ }));
    const fmtDate = (d) => new Intl.DateTimeFormat("en-US", {
      timeZone: TZ, weekday: "short", month: "short", day: "numeric"
    }).format(d);
    const fmtTime = (d) => new Intl.DateTimeFormat("en-US", {
      timeZone: TZ, hour: "numeric", minute: "2-digit"
    }).format(d);
    const dateKey = (d) => {
      const ld = toLocal(d);
      const y = ld.getFullYear();
      const m = String(ld.getMonth()+1).padStart(2,"0");
      const day = String(ld.getDate()).padStart(2,"0");
      return `${y}-${m}-${day}`;
    };

    const now = new Date();
    const todayKey = dateKey(now);
    const yestKey = dateKey(new Date(now.getTime() - 24*3600*1000));

    const ensureTeamId = async (team) => {
      if (team.id) return team.id;
      if (!team.name) return null;
      const data = await fetchJSON(`${API}/searchteams.php?t=${encodeURIComponent(team.name)}`);
      const match = (data?.teams || []).find(t => t.strTeam?.toLowerCase() === team.name.toLowerCase()) || (data?.teams || [])[0];
      team._resolvedTeam = match; // stash for label/league if needed
      return match?.idTeam ? Number(match.idTeam) : null;
    };

    // Normalize one event from TheSportsDB into our shape
    const normalize = (ev, teamLabel) => {
      // Prefer UTC timestamp if present
      let when = ev.strTimestamp ? new Date(ev.strTimestamp) : null;
      if (!when && ev.dateEvent) {
        // Fallback—treat given date/time as UTC if no timestamp (best effort)
        const time = ev.strTime || "00:00:00";
        when = new Date(`${ev.dateEvent}T${time}Z`);
      }
      // Finished?
      const hasScores = ev.intHomeScore != null && ev.intAwayScore != null;
      const status = ev.strStatus || (hasScores ? "Final" : (when && when < now ? "Final" : "Scheduled"));

      // Competition/league name if available
      const league = ev.strLeague || ev.strSport || "—";

      return {
        idEvent: ev.idEvent,
        league,
        date_local: when ? fmtDate(when) : (ev.dateEvent || "—"),
        time_local: when ? fmtTime(when) : (ev.strTime || "—"),
        dateKey: when ? dateKey(when) : (ev.dateEvent || "—"),
        home: ev.strHomeTeam,
        away: ev.strAwayTeam,
        homeScore: hasScores ? Number(ev.intHomeScore) : null,
        awayScore: hasScores ? Number(ev.intAwayScore) : null,
        status,
        provider: "TheSportsDB",
        teamLabel
      };
    };

    // Fetch events for a single team (recent + upcoming)
    const getTeamEvents = async (team) => {
      const id = await ensureTeamId(team);
      if (!id) return [];
      const [last, next] = await Promise.all([
        fetchJSON(`${API}/eventslast.php?id=${id}`).catch(()=>({})),
        fetchJSON(`${API}/eventsnext.php?id=${id}`).catch(()=>({}))
      ]);
      const all = []
        .concat(last?.results || [])
        .concat(next?.events || []);
      return all.map(ev => normalize(ev, team.label || team.name || "Team"));
    };

    // ——— Aggregate all events
    const allEventsNested = await Promise.all(teams.map(getTeamEvents));
    const allEvents = allEventsNested.flat().filter(e => e.idEvent);

    // Group by local date
    const byDate = allEvents.reduce((acc, e) => {
      if (!acc[e.dateKey]) acc[e.dateKey] = [];
      acc[e.dateKey].push(e);
      return acc;
    }, {});

    // Decide which bucket to show
    let label = "Upcoming Games";
    let targetKey = null;

    if (byDate[todayKey]?.length) {
      label = "Today's Scores";
      targetKey = todayKey;
    } else if (byDate[yestKey]?.length) {
      label = "Yesterday's Scores";
      targetKey = yestKey;
    } else {
      // find the earliest future date that has any events
      const futureKeys = Object.keys(byDate).filter(k => k > todayKey).sort();
      if (futureKeys.length) {
        label = "Upcoming Games";
        targetKey = futureKeys[0];
      } else {
        // fallback: latest past day if literally nothing upcoming
        const pastKeys = Object.keys(byDate).filter(k => k <= yestKey).sort().reverse();
        if (pastKeys.length) {
          label = "Recent Scores";
          targetKey = pastKeys[0];
        }
      }
    }

    const games = targetKey ? byDate[targetKey].sort((a,b)=>{
      // sort by time within the day
      if (a.time_local === "—" || b.time_local === "—") return 0;
      return a.time_local.localeCompare(b.time_local);
    }) : [];

    const date_local = games[0]?.date_local || (targetKey ? targetKey : "—");

    const payload = { label, date_local, games };

    // For quick debugging
    if (raw) {
      return json(payload);
    }

    // Minimal, backward-compatible single-line summary if you still render a single game:
    // (Recommend updating frontend to render all games; see snippet below.)
    return json(payload);

  } catch (err) {
    return json({ error: String(err) }, 500, {
      "Cache-Control": "s-maxage=30, stale-while-revalidate=120",
      "Access-Control-Allow-Origin": "*"
    });
  }
};

// ——— Small helper for JSON responses
const json = (data, status = 200, extraHeaders = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      ...extraHeaders
    }
  });
