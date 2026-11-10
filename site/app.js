// The site renders the Markdown pages at the repo root, so editing a page is the only step needed
// to update the site. A page's id is its filename without ".md". To add a page, write the .md
// file and list it below.
const SECTIONS = [
  {
    title: "Start",
    docs: [
      { file: "now.md", title: "Where we are now" },
      { file: "story.md", title: "The story so far" },
    ],
  },
  {
    title: "Look it up",
    docs: [
      { file: "history.md", title: "History" },
      { file: "compendium.md", title: "Compendium" },
      { file: "basics.md", title: "Willowshore basics" },
    ],
  },
];

const ALL_DOCS = SECTIONS.flatMap((section) => section.docs);
for (const doc of ALL_DOCS) doc.id = doc.file.replace(/\.md$/, "");
const HOME = ALL_DOCS[0];
const TEXT_SIZES = ["87.5%", "100%", "112.5%", "125%", "137.5%", "150%"];

// Every GitHub Pages site under one account shares an origin (ernieayala.github.io), and so
// shares browser storage. The prefix keeps this site's reading settings apart from the
// other sites'.
const STORE_PREFIX = "sog-players:";

// Browser storage can be missing (private windows, blocked site data). Settings then last
// for the visit only, and the page still works.
const store = {
  get(key, fallback) {
    try {
      const value = localStorage.getItem(STORE_PREFIX + key);
      return value === null ? fallback : JSON.parse(value);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(STORE_PREFIX + key, JSON.stringify(value));
    } catch {
      /* setting lasts for this visit only */
    }
  },
};

const docUrl = (doc) => new URL(doc.file, location.href).href;
const article = () => document.getElementById("site-doc");

// ---------- Routes ----------

// "#/compendium" opens a page; "#/compendium/hai-er-ha" also jumps to its "Hai-er Ha" heading.
// The address bar is user input, so a malformed section reads as no section.
function currentRoute() {
  const [id, section = ""] = location.hash.replace(/^#\/?/, "").split("/");
  const doc = ALL_DOCS.find((candidate) => candidate.id === id) ?? HOME;
  try {
    return { doc, section: doc.id === id ? decodeURIComponent(section) : "" };
  } catch {
    return { doc, section: "" };
  }
}

let shownDoc = null;

// A jump inside the open page only scrolls, so section links stay instant.
async function showRoute() {
  const route = currentRoute();
  if (route.doc !== shownDoc && !(await showDoc(route.doc))) return;
  goToSection(route.section);
}

// The target heading also takes keyboard and screen-reader focus, as a normal page anchor would.
function goToSection(section) {
  const heading = (section && article().querySelector(`#${CSS.escape(section)}`)) || article().querySelector("h1");
  if (section && heading.id === section) heading.scrollIntoView();
  else window.scrollTo(0, 0);
  heading?.setAttribute("tabindex", "-1");
  heading?.focus({ preventScroll: true });
}

// ---------- Navigation ----------

function renderNav(activeId) {
  const nav = document.getElementById("site-nav");
  nav.replaceChildren(
    ...SECTIONS.map((section) => {
      const group = document.createElement("li");
      const heading = document.createElement("h2");
      heading.className = "menu-title";
      heading.textContent = section.title;
      const list = document.createElement("ul");
      for (const doc of section.docs) {
        const item = document.createElement("li");
        const link = document.createElement("a");
        link.href = `#/${doc.id}`;
        link.textContent = doc.title;
        if (doc.id === activeId) {
          link.className = "menu-active";
          link.setAttribute("aria-current", "page");
        }
        link.addEventListener("click", closeDrawer);
        item.append(link);
        list.append(item);
      }
      group.append(heading, list);
      return group;
    }),
  );
}

function closeDrawer() {
  document.getElementById("site-nav-toggle").checked = false;
}

// ---------- Page rendering ----------

// Returns false when the page did not render, or a newer route replaced it while it loaded.
async function showDoc(doc) {
  stopReading();
  hideTip();
  renderNav(doc.id);
  let text = null;
  let problem = "";
  try {
    const response = await fetch(docUrl(doc), { cache: "no-cache" });
    if (response.ok) text = await response.text();
    else problem = `HTTP ${response.status}`;
  } catch (error) {
    problem = error.message;
  }
  if (currentRoute().doc !== doc) return false;

  shownDoc = text === null ? null : doc;
  if (text === null) {
    // Opening index.html straight from disk blocks fetch, which is the usual cause here.
    article().innerHTML = `<div role="alert" class="alert alert-error">Could not load <code>${doc.file}</code> (${problem}). If you opened index.html from a folder, run <code>site/start.bat</code> instead.</div>`;
    return false;
  }
  article().innerHTML = marked.parse(text);
  decorate(article(), doc);
  // Tips arrive after the page shows, so a slow fetch never delays reading. If the reader has
  // moved on, the links tagged belong to whatever page is showing, which is still correct.
  compendiumTips().then((tips) => addTips(article(), tips));
  const title = article().querySelector("h1")?.textContent.trim() || doc.title;
  document.getElementById("site-title").textContent = title;
  document.title = `${title} · Season of Ghosts`;
  return true;
}

function decorate(root, doc) {
  addHeadingIds(root);
  for (const table of root.querySelectorAll("table")) {
    table.className = "table table-zebra";
    const wrap = document.createElement("div");
    wrap.className = "table-wrap";
    table.replaceWith(wrap);
    wrap.append(table);
  }
  // An in-world passage is a blockquote that opens in italics; a tip opens in bold.
  for (const quote of root.querySelectorAll("blockquote")) {
    if (quote.firstElementChild?.firstChild?.nodeName === "EM") quote.classList.add("in-world");
  }
  routeDocLinks(root, doc);
}

// The pages link to sections by GitHub's heading anchors, so headings get the same ids here:
// lowercase, keep only letters, digits, underscores, hyphens and spaces, then spaces become
// hyphens. A repeated heading gets -1, -2, and so on, as on GitHub.
function addHeadingIds(root) {
  const seen = new Map();
  for (const heading of root.querySelectorAll("h1, h2, h3, h4, h5, h6")) {
    const slug = heading.textContent.trim().toLowerCase().replace(/[^\p{L}\p{N}_\- ]/gu, "").replaceAll(" ", "-");
    const count = seen.get(slug) ?? 0;
    seen.set(slug, count + 1);
    heading.id = count ? `${slug}-${count}` : slug;
  }
}

// Pages link to each other by filename (compendium.md#hai-er-ha) and to their own sections
// (#hai-er-ha). Both become routes of this site instead of raw Markdown files.
function routeDocLinks(root, doc) {
  for (const link of root.querySelectorAll("a[href]")) {
    link.classList.add("link", "link-primary");
    const target = new URL(link.getAttribute("href"), docUrl(doc));
    const section = target.hash.slice(1);
    target.hash = "";
    const match = ALL_DOCS.find((candidate) => docUrl(candidate) === target.href);
    if (match) {
      link.href = `#/${match.id}` + (section ? `/${section}` : "");
    } else {
      link.target = "_blank";
      link.rel = "noopener";
    }
  }
}

// ---------- Compendium tooltips ----------

// The Compendium is the one place a name is described, so every link to an entry can show that
// entry in a tooltip. An entry longer than two sentences starts with an "In short" line written
// for the tooltip; a short entry's own text is the tooltip.
let tipsPromise = null;

function compendiumTips() {
  tipsPromise ??= fetch(new URL("compendium.md", location.href), { cache: "no-cache" })
    .then((response) => (response.ok ? response.text() : ""))
    .then((text) => tipsFrom(new DOMParser().parseFromString(marked.parse(text), "text/html")))
    // No tips is a working page, so a failed fetch only costs the tooltips.
    .catch(() => new Map());
  return tipsPromise;
}

// An entry is a heading, then a paragraph whose lines start "In short:", "Type:", "Seen in:".
// The Type line opens with its kind ("Person.", "Place."), which a tooltip doesn't need.
function tipsFrom(parsed) {
  addHeadingIds(parsed.body);
  const tips = new Map();
  for (const heading of parsed.querySelectorAll("h3")) {
    const paragraph = heading.nextElementSibling;
    if (paragraph?.tagName !== "P") continue;
    const lines = paragraph.textContent.split("\n").map((line) => line.trim());
    const short = lines.find((line) => line.startsWith("In short:"));
    const type = lines.find((line) => line.startsWith("Type:"));
    const tip = short
      ? short.slice("In short:".length).trim()
      : type?.slice("Type:".length).trim().replace(/^[^.]*\.\s*/, "");
    if (tip) tips.set(heading.id, { label: heading.textContent.trim(), tip });
  }
  return tips;
}

// routeDocLinks has already turned compendium links into "#/compendium/<entry>".
function addTips(root, tips) {
  for (const link of root.querySelectorAll('a[href^="#/compendium/"]')) {
    const entry = tips.get(decodeURIComponent(link.getAttribute("href").split("/")[2] ?? ""));
    if (!entry) continue;
    link.classList.add("tip-link");
    link.dataset.tipLabel = entry.label;
    link.dataset.tip = entry.tip;
    link.setAttribute("aria-describedby", "term-tip");
  }
}

const termTip = () => document.getElementById("term-tip");

// The tip is fixed to the window, outside the page, so scrolling tables cannot clip it. It sits
// under the link, or over it when the window bottom is too close.
function showTip(link) {
  const tip = termTip();
  const label = document.createElement("strong");
  label.textContent = `${link.dataset.tipLabel}:`;
  tip.replaceChildren(label, ` ${link.dataset.tip}`);
  tip.hidden = false;

  const gap = 8;
  const spot = link.getBoundingClientRect();
  const below = spot.bottom + gap;
  const top = below + tip.offsetHeight > innerHeight ? spot.top - tip.offsetHeight - gap : below;
  const left = Math.max(gap, Math.min(spot.left, innerWidth - tip.offsetWidth - gap));
  tip.style.top = `${top}px`;
  tip.style.left = `${left}px`;
}

function hideTip() {
  termTip().hidden = true;
}

// ---------- Reading settings ----------

function applySettings() {
  const root = document.documentElement;
  root.style.setProperty("--reading-size", TEXT_SIZES[store.get("sizeIndex", 1)]);
  root.dataset.font = store.get("lexend", true) ? "lexend" : "system";
  root.dataset.theme = store.get("theme", matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");

  document.getElementById("site-font").checked = root.dataset.font === "lexend";
  document.getElementById("site-theme").checked = root.dataset.theme === "dark";
}

function changeSize(step) {
  const index = Math.min(TEXT_SIZES.length - 1, Math.max(0, store.get("sizeIndex", 1) + step));
  store.set("sizeIndex", index);
  applySettings();
}

// ---------- Listen ----------

const listenButton = () => document.getElementById("site-listen");

function stopReading() {
  speechSynthesis.cancel();
  listenButton().textContent = "Listen";
}

// A long page runs past what one utterance can carry, so the text is queued one line at a time.
// Icons are dropped, or the voice reads out their emoji names.
function toggleReading() {
  if (speechSynthesis.speaking || speechSynthesis.pending) {
    stopReading();
    return;
  }
  const selected = getSelection().toString().trim();
  const text = (selected || article().innerText).replace(/\p{Extended_Pictographic}️?/gu, "");
  const lines = text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0) return;
  lines.forEach((line, i) => {
    const utterance = new SpeechSynthesisUtterance(line);
    utterance.rate = store.get("speechRate", 0.95);
    // Only relabels: a late end event from a stopped reading must not cancel a new one.
    if (i === lines.length - 1) {
      utterance.onend = () => {
        if (!speechSynthesis.speaking && !speechSynthesis.pending) listenButton().textContent = "Listen";
      };
    }
    speechSynthesis.speak(utterance);
  });
  listenButton().textContent = "Stop";
}

// ---------- Start ----------

document.getElementById("site-smaller").addEventListener("click", () => changeSize(-1));
document.getElementById("site-bigger").addEventListener("click", () => changeSize(1));
document.getElementById("site-font").addEventListener("change", (event) => {
  store.set("lexend", event.target.checked);
  applySettings();
});
document.getElementById("site-theme").addEventListener("change", (event) => {
  store.set("theme", event.target.checked ? "dark" : "light");
  applySettings();
});
document.getElementById("site-skip").addEventListener("click", () => goToSection(""));
listenButton().addEventListener("click", toggleReading);
window.addEventListener("hashchange", showRoute);

// Hover and keyboard focus both show a tip, so mouse and keyboard readers get the same help.
// A tap on a touch screen follows the link to the full entry instead; the back button returns.
document.addEventListener("mouseover", (event) => {
  const link = event.target.closest(".tip-link");
  if (link) showTip(link);
});
document.addEventListener("mouseout", (event) => {
  if (event.target.closest(".tip-link")) hideTip();
});
document.addEventListener("focusin", (event) => {
  const link = event.target.closest(".tip-link");
  if (link) showTip(link);
  else hideTip();
});
document.addEventListener("focusout", (event) => {
  if (event.target.closest(".tip-link")) hideTip();
});
// Escape dismisses a tip without moving focus, as WCAG 1.4.13 asks of content shown on hover.
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") hideTip();
});
window.addEventListener("scroll", hideTip, { passive: true });

applySettings();
showRoute();
