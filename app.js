/* State */
const state = {
  people: [],
};

/* Elements */
const tzSelect = document.getElementById("tzSelect");
const nameInput = document.getElementById("nameInput");
const startHour = document.getElementById("startHour");
const endHour = document.getElementById("endHour");
const addBtn = document.getElementById("addBtn");
const list = document.getElementById("list");
const dateInput = document.getElementById("dateInput");
const suggestBtn = document.getElementById("suggestBtn");
const suggestions = document.getElementById("suggestions");
const timeline = document.getElementById("timeline");
const copyBtn = document.getElementById("copyBtn");

/* Utilities */
function loadZones() {
  let zones = [];
  try {
    if (Intl.supportedValuesOf) {
      zones = Intl.supportedValuesOf("timeZone");
    }
  } catch {}
  if (!zones || zones.length === 0) {
    zones = [
      "UTC",
      "Europe/London",
      "Europe/Paris",
      "Europe/Berlin",
      "Asia/Singapore",
      "Asia/Hong_Kong",
      "Asia/Kuala_Lumpur",
      "Asia/Tokyo",
      "Australia/Sydney",
      "America/New_York",
      "America/Chicago",
      "America/Denver",
      "America/Los_Angeles",
      "America/Sao_Paulo",
      "Africa/Johannesburg",
      "Asia/Dubai",
      "Asia/Calcutta",
    ];
  }
  tzSelect.innerHTML = zones
    .map((z) => `<option value="${z}">${z}</option>`)
    .join("");
  try {
    const guess = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (guess && zones.includes(guess)) tzSelect.value = guess;
  } catch {}
}

function save() {
  localStorage.setItem("timesync_people", JSON.stringify(state.people));
}

function load() {
  const raw = localStorage.getItem("timesync_people");
  if (raw) {
    try { state.people = JSON.parse(raw) || []; } catch {}
  }
}

function toLocalHour(date, targetZone, baseZone) {
  // date: Date in baseZone meaning wall time of baseZone
  // We convert date to UTC offset of baseZone, then format in targetZone to get hour
  const fmtBase = new Intl.DateTimeFormat("en-GB", { timeZone: baseZone, hour: "2-digit", hour12: false });
  const baseHour = Number(fmtBase.format(date));
  // Construct a date that represents that baseZone hour in real UTC
  const utcMillis = date.getTime();
  // Use targetZone to get its hour at that same instant
  const fmtTarget = new Intl.DateTimeFormat("en-GB", { timeZone: targetZone, hour: "2-digit", hour12: false });
  return Number(fmtTarget.format(new Date(utcMillis)));
}

function fmt(date, zone) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: zone,
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }

function addPerson() {
  const name = nameInput.value.trim() || "Guest";
  const zone = tzSelect.value;
  const start = clamp(Number(startHour.value), 0, 23);
  const end = clamp(Number(endHour.value), 1, 24);
  if (!zone) return;

  state.people.push({ id: crypto.randomUUID(), name, zone, start, end });
  renderList();
  renderTimeline();
  save();
  nameInput.value = "";
}

function removePerson(id) {
  state.people = state.people.filter(p => p.id !== id);
  renderList();
  renderTimeline();
  save();
}

function renderList() {
  if (state.people.length === 0) {
    list.innerHTML = `<li style="opacity:0.85">No participants yet</li>`;
    return;
  }
  list.innerHTML = state.people.map(p => `
    <li>
      <span class="pill">${p.name}</span>
      <span class="pill">${p.zone}</span>
      <span class="pill">Start ${String(p.start).padStart(2,"0")}:00</span>
      <span class="pill">End ${String(p.end).padStart(2,"0")}:00</span>
      <button class="btn" onclick="removePerson('${p.id}')">Remove</button>
    </li>
  `).join("");
}


function renderTimeline() {
  timeline.innerHTML = "";
  if (state.people.length === 0) return;

  const baseZone = "Asia/Singapore";
  const dateStr = dateInput.value;
  const widthPercent = 100 / 24;

  state.people.forEach(p => {
    const track = document.createElement("div");
    track.className = "track";
    track.innerHTML = `<div class="name">${p.name}  ${p.zone}</div>
      <div class="bar"></div>`;
    const bar = track.querySelector(".bar");

    // Build availability mask across SG hours
    const mask = []; // true for each SG hour where participant is inside their working hours
    for (let h = 0; h < 24; h++) {
      const utcMoment = getSelectedDateAtHour(h, baseZone);
      const hourLocal = new Intl.DateTimeFormat("en-GB", { timeZone: p.zone, hour: "2-digit", hour12: false }).format(utcMoment);
      const hl = Number(hourLocal);
      const inside = hl >= p.start && hl < p.end;
      mask.push(inside);
    }

    // Turn mask into contiguous blocks on the SG axis
    let i = 0;
    while (i < 24) {
      if (!mask[i]) { i++; continue; }
      let j = i + 1;
      while (j < 24 && mask[j]) j++;
      const startHourSG = i;
      const endHourSG = j;
      const block = document.createElement("div");
      block.className = "block";
      block.style.left = `${startHourSG * widthPercent}%`;
      block.style.width = `${(endHourSG - startHourSG) * widthPercent}%`;
      bar.appendChild(block);
      i = j;
    }

    timeline.appendChild(track);
  });
}


function getSelectedDateAtHour(h, zone) {
  const dateStr = dateInput.value;
  const now = new Date();
  const base = dateStr ? new Date(dateStr + "T00:00:00") : new Date(now.getFullYear(), now.getMonth(), now.getDate());
  // Create a date at hour h in the chosen zone by formatting trick
  const asUTC = new Date(base.getTime());
  asUTC.setHours(h, 0, 0, 0);
  return asUTC;
}


// NEW: helper to propose near miss windows when no perfect overlap exists
function computeBestCoverageWindows(baseZone) {
  // For each hour, count how many people are inside their hours
  const scores = [];
  for (let h = 0; h < 24; h++) {
    const utcMoment = getSelectedDateAtHour(h, baseZone);
    let insideCount = 0;
    const whoInside = [];
    const whoOutside = [];
    for (const p of state.people) {
      const hourLocal = new Intl.DateTimeFormat("en-GB", { timeZone: p.zone, hour: "2-digit", hour12: false }).format(utcMoment);
      const hl = Number(hourLocal);
      const inside = hl >= p.start && hl < p.end;
      if (inside) {
        insideCount++;
        whoInside.push(p.name);
      } else {
        whoOutside.push(`${p.name} at ${String(hl).padStart(2,"0")}:00`);
      }
    }
    scores.push({ h, insideCount, whoInside, whoOutside });
  }
  // Make 1 hour windows and score by insideCount then centrism around 09 to 17
  const sweetMid = 13;
  const ranked = scores
    .map(s => ({ 
      h: s.h, 
      score: s.insideCount - Math.abs(s.h - sweetMid) * 0.05, 
      insideCount: s.insideCount, 
      whoInside: s.whoInside, 
      whoOutside: s.whoOutside 
    }))
    .sort((a, b) => b.score - a.score);
  return ranked.slice(0, 3);
}

function computeSuggestions() {
  suggestions.innerHTML = "";
  if (state.people.length === 0) {
    suggestions.innerHTML = `<div class="suggestion">Add at least one person</div>`;
    return;
  }
  const baseZone = "Asia/Singapore";
  const windows = []; // { hour, ok: boolean, who: string[] }

  for (let h = 0; h < 24; h++) {
    const utcMoment = getSelectedDateAtHour(h, baseZone);
    const okFor = [];
    let allOk = true;
    for (const p of state.people) {
      const hourLocal = new Intl.DateTimeFormat("en-GB", { timeZone: p.zone, hour: "2-digit", hour12: false }).format(utcMoment);
      const hl = Number(hourLocal);
      const inside = hl >= p.start && hl < p.end;
      if (inside) okFor.push(p.name);
      if (!inside) allOk = false;
    }
    windows.push({ hour: h, okFor, allOk });
  }

  // Group consecutive allOk hours into blocks
  const blocks = [];
  let start = null;
  for (let i = 0; i < 24; i++) {
    if (windows[i].allOk && start === null) start = i;
    if ((!windows[i].allOk || i === 23) && start !== null) {
      const end = windows[i].allOk && i === 23 ? i + 1 : i;
      blocks.push([start, end]);
      start = null;
    }
  }

  // Score blocks by mid hour distance to 9 to 17 in base zone
  const sweetStart = 9, sweetEnd = 17, sweetMid = (sweetStart + sweetEnd) / 2;
  const scored = blocks.map(([a, b]) => {
    const mid = (a + b) / 2;
    const distance = Math.abs(mid - sweetMid);
    return { a, b, score: distance };
  }).sort((x, y) => x.score - y.score);


  const top = scored.slice(0, 3);

  if (top.length === 0) {
    // Fallback suggestions based on best coverage
    const near = computeBestCoverageWindows(baseZone);
    if (near.length === 0) {
      suggestions.innerHTML = `<div class="suggestion">No overlap yet. Add participants or adjust hours.</div>`;
      return;
    }
    near.forEach((n, idx) => {
      const startHour = n.h;
      const endHour = n.h + 1;
      const utcStart = getSelectedDateAtHour(startHour, baseZone);
      const utcEnd = getSelectedDateAtHour(endHour, baseZone);
      const div = document.createElement("div");
      div.className = "suggestion";
      const tag = idx === 0 ? `<span class="best">Best coverage</span>` : `<span class="best" style="background: rgba(255,200,0,0.2); border-color: rgba(255,200,0,0.5)">Consider</span>`;
      div.innerHTML = `
        <div>
          <div><strong>Base zone</strong> ${baseZone}</div>
          <div>${fmt(utcStart, baseZone)}  to  ${fmt(utcEnd, baseZone)}</div>
          <div style="font-size:0.9rem; opacity:0.9">Inside ${n.insideCount} of ${state.people.length}</div>
        </div>
        <div>${tag}</div>
      `;
      // Expand to show who is inside and outside
      div.addEventListener("click", () => {
        const more = document.createElement("div");
        more.style.marginTop = "8px";
        more.style.fontSize = "0.95rem";
        more.innerHTML = `
          <div><strong>Available</strong> ${n.whoInside.join(", ") || "None"}</div>
          <div><strong>Not ideal</strong> ${n.whoOutside.join(", ") || "None"}</div>
        `;
        if (!div._open) {
          div.appendChild(more);
          div._open = true;
        } else {
          div.removeChild(div.lastChild);
          div._open = false;
        }
      });
      suggestions.appendChild(div);
    });
    return;
  }

  for (const t of top) {
    const startHour = t.a;
    const endHour = t.b;
    const utcStart = getSelectedDateAtHour(startHour, baseZone);
    const utcEnd = getSelectedDateAtHour(endHour, baseZone);

    const lines = state.people.map(p => {
      return `${p.name}: ${fmt(utcStart, p.zone)} to ${fmt(utcEnd, p.zone)}`;
    });

    const div = document.createElement("div");
    div.className = "suggestion";
    const bestTag = t === top[0] ? `<span class="best">Best fit</span>` : "";
    div.innerHTML = `
      <div>
        <div><strong>Base zone</strong> ${baseZone}</div>
        <div>${fmt(utcStart, baseZone)}  to  ${fmt(utcEnd, baseZone)}</div>
      </div>
      <div>${bestTag}</div>
    `;
    div.addEventListener("click", () => {
      // Expand details on click
      const more = document.createElement("div");
      more.style.marginTop = "8px";
      more.style.fontSize = "0.95rem";
      more.innerHTML = lines.map(l => `<div>${l}</div>`).join("");
      if (!div._open) {
        div.appendChild(more);
        div._open = true;
      } else {
        div.removeChild(div.lastChild);
        div._open = false;
      }
    });
    suggestions.appendChild(div);
  }
}

function copyPlan() {
  const blocks = [...document.querySelectorAll(".suggestion")];
  if (blocks.length === 0) return;
  const baseZone = "Asia/Singapore";

  let out = `TimeSync plan\\nBase zone ${baseZone}\\n`;

  blocks.slice(0, 1).forEach(div => {
    // Only copy the first suggestion by default
    const lines = [];
    const inner = div.querySelectorAll("div > div");
    // This depends on the structure built above
    lines.push(inner[0].textContent.trim());
    lines.push(inner[1].textContent.trim());
    out += lines.join("\\n") + "\\n";
  });

  out += "\\nDetails per person\\n";
  // Recreate from state using first suggestion times
  const first = blocks[0];
  // Recompute to ensure accuracy
  const baseStart = suggestions.querySelector(".suggestion div div:nth-child(2)")?.textContent;
  navigator.clipboard.writeText(out).then(() => {
    alert("Plan copied to clipboard");
  });
}

/* Events */
addBtn.addEventListener("click", addPerson);
suggestBtn.addEventListener("click", computeSuggestions);
copyBtn.addEventListener("click", copyPlan);
dateInput.addEventListener("change", () => {
  renderTimeline();
  suggestions.innerHTML = "";
});

/* Init */
loadZones();
load();
renderList();
renderTimeline();
// Set default date to today in the user zone
const today = new Date();
const yyyy = today.getFullYear();
const mm = String(today.getMonth()+1).padStart(2,"0");
const dd = String(today.getDate()).padStart(2,"0");
dateInput.value = `${yyyy}-${mm}-${dd}`;
