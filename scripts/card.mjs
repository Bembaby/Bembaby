// Draws the banner at the top of the profile README: my name, the current
// commit streak, and the last six months of contributions as a row of bars
// that rise in when the page loads. Writes a dark and a light version.
//   GITHUB_TOKEN=... node scripts/card.mjs [outDir]
// Runs in .github/workflows/cards.yml, which publishes to the output branch.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = process.argv[2] ?? join(ROOT, "dist");
const USER = process.env.CARD_USER ?? "Bembaby";
const TOKEN = process.env.GITHUB_TOKEN;

if (!TOKEN) throw new Error("GITHUB_TOKEN is not set");
const headers = { authorization: `bearer ${TOKEN}`, "user-agent": `${USER}-profile-card` };

async function graphql(query, variables) {
  const res = await fetch("https://api.github.com/graphql", { method: "POST", headers, body: JSON.stringify({ query, variables }) });
  const body = await res.json();
  if (!res.ok || body.errors) throw new Error(JSON.stringify(body.errors ?? body));
  return body.data;
}

const CALENDAR = `query($login: String!, $from: DateTime, $to: DateTime) {
  user(login: $login) {
    contributionsCollection(from: $from, to: $to) {
      contributionCalendar { totalContributions weeks { contributionDays { date contributionCount } } }
    }
  }
}`;

async function calendar(from, to) {
  const data = await graphql(CALENDAR, { login: USER, from, to });
  const cal = data.user.contributionsCollection.contributionCalendar;
  return { total: cal.totalContributions, days: cal.weeks.flatMap((w) => w.contributionDays) };
}

// The last year, as the profile counts it, then a year further back at a
// time while the streak runs off the start.
const year = await calendar();
let days = year.days;
let streak = 0;
let start = null;
for (;;) {
  streak = 0;
  start = null;
  // Today doesn't break a streak until it's over.
  const run = days.at(-1).contributionCount === 0 ? days.slice(0, -1) : days;
  for (let i = run.length - 1; i >= 0 && run[i].contributionCount > 0; i--) {
    streak++;
    start = run[i].date;
  }
  if (streak < run.length) break;
  const to = new Date(`${days[0].date}T00:00:00Z`);
  const from = new Date(to.getTime() - 364 * 864e5);
  const earlier = await calendar(from.toISOString(), new Date(to.getTime() - 1000).toISOString());
  days = [...earlier.days, ...days];
}

const fmt = (n) => n.toLocaleString("en-US");
const month = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).toUpperCase();
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
const font = (file) => readFileSync(join(ROOT, "fonts", file)).toString("base64");
const SOFIA = font("sofia-sans-extra-condensed-normal-var.woff2");
const PLEX = font("ibm-plex-mono-normal-500.woff2");

const THEMES = {
  dark: {
    bg: "#15102a",
    border: "#30285a",
    dot: "rgba(236, 230, 252, 0.09)",
    glow: "#a98bff",
    ink: "#f7f3ff",
    mute: "#ab9fd0",
    bar: ["#ddd0ff", "#9f84f5"],
    rest: "#342b62",
    today: "#ffffff",
  },
  light: {
    bg: "#f6f3fb",
    border: "#ddd4ec",
    dot: "rgba(98, 64, 190, 0.07)",
    glow: "#c0a8ff",
    ink: "#3a2380",
    mute: "#7764b4",
    bar: ["#a78bfa", "#6d4ae0"],
    rest: "#e3daf6",
    today: "#5a35cc",
  },
};

const W = 900;
const H = 300;
const X0 = 40;
const X1 = W - 40;
const PITCH = 5;
const N = Math.floor((X1 - X0) / PITCH);
const BASE = 250;
const TALL = 62;
const recent = days.slice(-N);
const peak = Math.max(1, ...recent.map((d) => d.contributionCount));
const streakFrom = streak ? days.length - (days.at(-1).contributionCount === 0 ? 1 : 0) - streak : Infinity;

function draw(t) {
  const bars = recent
    .map((d, i) => {
      const n = d.contributionCount;
      const h = n === 0 ? 2 : 4 + (TALL - 4) * Math.sqrt(n / peak);
      const x = X0 + i * PITCH + (W - 2 * X0 - N * PITCH) / 2;
      const inStreak = days.length - recent.length + i >= streakFrom;
      const isToday = i === recent.length - 1;
      const fill = isToday ? t.today : inStreak ? "url(#bar)" : t.rest;
      const cls = isToday ? "bar today" : inStreak ? "bar hot" : "bar";
      const delay = `${Math.round(i * 7)}ms${inStreak ? `, ${1400 + Math.round(i * 22)}ms` : ""}`;
      return `<rect class="${cls}" x="${x.toFixed(1)}" y="${(BASE - h).toFixed(1)}" width="3" height="${h.toFixed(1)}" rx="1.5" fill="${fill}" style="animation-delay:${delay}"/>`;
    })
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="t">
<title id="t">Belal Embaby, software engineer in Newark, NJ. ${streak}-day commit streak and ${fmt(year.total)} contributions in the last year.</title>
<defs>
<style>
@font-face { font-family: "Sofia"; font-weight: 1 1000; src: url(data:font/woff2;base64,${SOFIA}) format("woff2"); }
@font-face { font-family: "Plex"; font-weight: 500; src: url(data:font/woff2;base64,${PLEX}) format("woff2"); }
.display { font-family: "Sofia", "Arial Narrow", sans-serif; }
.mono { font-family: "Plex", ui-monospace, Consolas, monospace; font-weight: 500; letter-spacing: 0.14em; }
.num { letter-spacing: 0.02em; }
.bar { transform-box: fill-box; transform-origin: 50% 100%; animation: rise 0.9s cubic-bezier(.2, .8, .2, 1) both; }
.bar.hot { animation-name: rise, shimmer; animation-duration: 0.9s, 3.4s; animation-timing-function: cubic-bezier(.2, .8, .2, 1), ease-in-out; animation-iteration-count: 1, infinite; animation-fill-mode: both, none; }
.bar.today { animation: rise 0.9s cubic-bezier(.2, .8, .2, 1) both, pulse 2.2s ease-in-out 1.6s infinite; }
.fade { animation: fade 1s ease-out both; }
@keyframes rise { from { transform: scaleY(0); opacity: 0; } }
@keyframes shimmer { 50% { opacity: 0.5; } }
@keyframes pulse { 50% { opacity: 0.3; } }
@keyframes fade { from { opacity: 0; transform: translateY(6px); } }
@media (prefers-reduced-motion: reduce) { .bar, .fade { animation: none !important; } }
</style>
<pattern id="dots" width="14" height="14" patternUnits="userSpaceOnUse"><circle cx="7" cy="7" r="0.9" fill="${t.dot}"/></pattern>
<radialGradient id="glow" cx="0.12" cy="0" r="0.75"><stop offset="0" stop-color="${t.glow}" stop-opacity="0.22"/><stop offset="1" stop-color="${t.glow}" stop-opacity="0"/></radialGradient>
<linearGradient id="bar" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${t.bar[0]}"/><stop offset="1" stop-color="${t.bar[1]}"/></linearGradient>
<clipPath id="card"><rect width="${W}" height="${H}" rx="12"/></clipPath>
</defs>
<g clip-path="url(#card)">
<rect width="${W}" height="${H}" fill="${t.bg}"/>
<rect width="${W}" height="${H}" fill="url(#dots)"/>
<rect width="${W}" height="${H}" fill="url(#glow)"/>
</g>
<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="11.5" fill="none" stroke="${t.border}"/>
<g class="fade">
<text class="mono" x="${X0}" y="56" font-size="12" fill="${t.mute}">SOFTWARE ENGINEER · NEWARK, NJ</text>
<text class="display" x="${X0 - 3}" y="136" font-size="92" font-weight="250" letter-spacing="-1" fill="${t.ink}">BELAL EMBABY</text>
<text class="mono" x="${X0}" y="172" font-size="12" fill="${t.mute}"><tspan class="num" fill="${t.ink}">${fmt(year.total)}</tspan> CONTRIBUTIONS THIS YEAR</text>
<text class="display" x="${X1}" y="136" font-size="112" font-weight="200" letter-spacing="1" text-anchor="end" fill="${t.ink}">${streak}</text>
<text class="mono" x="${X1}" y="172" font-size="12" text-anchor="end" fill="${t.mute}">DAY STREAK${start ? ` · SINCE <tspan class="num" fill="${t.ink}">${esc(month(start))}</tspan>` : ""}</text>
</g>
${bars}
<text class="mono num" x="${X0}" y="276" font-size="10.5" fill="${t.mute}">${esc(month(recent[0].date))}</text>
<text class="mono" x="${X1}" y="276" font-size="10.5" text-anchor="end" fill="${t.mute}">TODAY</text>
</svg>
`;
}

mkdirSync(OUT, { recursive: true });
for (const [name, t] of Object.entries(THEMES)) writeFileSync(join(OUT, `card-${name}.svg`), draw(t));
console.log(`streak ${streak} since ${start}, ${year.total} this year`);
