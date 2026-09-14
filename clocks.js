/* ─── CLOCKS ─────────────────────────────────────────────────────────────── */
(function () {
  const zones = [
    // hero clocks
    { id: "hero-clock-ny",  abbrevId: "hero-abbrev-ny",  tzId: "hero-tz-ny",  tz: "America/New_York", upper: true },
    { id: "hero-clock-sp",  abbrevId: "hero-abbrev-sp",  tzId: "hero-tz-sp",  tz: "America/Sao_Paulo", upper: true },
    { id: "hero-clock-bcn", abbrevId: "hero-abbrev-bcn", tzId: "hero-tz-bcn", tz: "Europe/Madrid",    upper: true },
  ];

  function getAbbrev(tz) {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      timeZoneName: "short",
    }).formatToParts(new Date());
    return (parts.find((p) => p.type === "timeZoneName") || {}).value || "";
  }

  function getUTCLabel(tz, upper) {
    const parts = new Intl.DateTimeFormat("en", {
      timeZone: tz,
      timeZoneName: "shortOffset",
    }).formatToParts(new Date());
    const raw = (parts.find((p) => p.type === "timeZoneName") || {}).value || "GMT";
    if (raw === "GMT") return upper ? "UTC/GMT +0 HOURS" : "UTC/GMT +0 hours";
    const m = raw.match(/GMT([+-]\d+)/);
    if (!m) return upper ? "UTC/GMT +0 HOURS" : "UTC/GMT +0 hours";
    const offset = parseInt(m[1]);
    const abs = Math.abs(offset);
    const sign = offset >= 0 ? "+" : "-";
    const word = abs === 1
      ? (upper ? "HOUR"  : "hour")
      : (upper ? "HOURS" : "hours");
    return `UTC/GMT ${sign}${abs} ${word}`;
  }

  function tick() {
    zones.forEach(({ id, abbrevId, tzId, tz, upper }) => {
      const el      = document.getElementById(id);
      const abbrevEl = document.getElementById(abbrevId);
      const tzEl    = document.getElementById(tzId);
      if (!el) return;

      const now = new Date();
      const timeStr = now.toLocaleTimeString("en-US", {
        timeZone: tz,
        hour:   "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      });
      el.textContent = timeStr.replace(/^24/, "00").replace(/:/g, " ");

      if (abbrevEl) abbrevEl.textContent = getAbbrev(tz);
      if (tzEl)     tzEl.textContent     = getUTCLabel(tz, upper);
    });
  }

  tick();
  setInterval(tick, 1000);
})();
