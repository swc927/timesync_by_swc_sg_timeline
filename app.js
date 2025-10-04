// Goal: find overlapping working windows across time zones, anchored to a chosen baseline zone.
// Implementation notes:
// 1. We render a fixed header grid of Singapore baseline timestamps at 30 minute ticks.
// 2. For each person, we convert those ticks into their chosen IANA time zone and mark availability
// 3. We then scan for contiguous segments that fit the requested duration and label them as ok or best
// 4. We prefer windows that sit inside the centre of each participant's work range, to be kinder across regions

const tzList = [
  "Africa/Cairo",
  "Africa/Johannesburg",
  "Africa/Lagos",
  "Africa/Nairobi",
  "America/Anchorage",
  "America/Argentina/Buenos_Aires",
  "America/Bogota",
  "America/Caracas",
  "America/Chicago",
  "America/Denver",
  "America/Edmonton",
  "America/Los_Angeles",
  "America/Mexico_City",
  "America/New_York",
  "America/Phoenix",
  "America/Santiago",
  "America/Sao_Paulo",
  "America/Toronto",
  "America/Vancouver",
  "Asia/Bangkok",
  "Asia/Colombo",
  "Asia/Dhaka",
  "Asia/Dubai",
  "Asia/Ho_Chi_Minh",
  "Asia/Hong_Kong",
  "Asia/Jakarta",
  "Asia/Karachi",
  "Asia/Kathmandu",
  "Asia/Kolkata",
  "Asia/Kuala_Lumpur",
  "Asia/Manila",
  "Asia/Seoul",
  "Asia/Shanghai",
  "Asia/Singapore",
  "Asia/Taipei",
  "Asia/Tashkent",
  "Asia/Tokyo",
  "Australia/Adelaide",
  "Australia/Brisbane",
  "Australia/Melbourne",
  "Australia/Perth",
  "Australia/Sydney",
  "Europe/Amsterdam",
  "Europe/Athens",
  "Europe/Belgrade",
  "Europe/Berlin",
  "Europe/Brussels",
  "Europe/Bucharest",
  "Europe/Budapest",
  "Europe/Copenhagen",
  "Europe/Dublin",
  "Europe/Helsinki",
  "Europe/Istanbul",
  "Europe/Kyiv",
  "Europe/Lisbon",
  "Europe/London",
  "Europe/Madrid",
  "Europe/Moscow",
  "Europe/Oslo",
  "Europe/Paris",
  "Europe/Prague",
  "Europe/Rome",
  "Europe/Stockholm",
  "Europe/Vienna",
  "Europe/Warsaw",
  "Europe/Zurich",
  "Pacific/Auckland",
  "Pacific/Fiji",
  "Pacific/Honolulu",
];
const dayMinutes = 24 * 60;

// UI references
const baselineEl = document.getElementById("baseline");
const baselineStartEl = document.getElementById("baselineStart");
const baselineEndEl = document.getElementById("baselineEnd");
const durationEl = document.getElementById("duration");
const durationLabelEl = document.getElementById("durationLabel");
const addPersonBtn = document.getElementById("addPerson");
const participantsEl = document.getElementById("participants");
const gridHeaderEl = document.getElementById("gridHeader");
const gridBodyEl = document.getElementById("gridBody");
const suggestionsEl = document.getElementById("suggestions");
const exportBtn = document.getElementById("exportBtn");
const importBtn = document.getElementById("importBtn");
const fileInput = document.getElementById("fileInput");
const shareLink = document.getElementById("shareLink");
const tzDatalist = document.getElementById("tzlist");

// Populate time zone datalist
function populateTZList() {
  tzDatalist.innerHTML = tzList
    .map((tz) => `<option value="${tz}"></option>`)
    .join("");
}
populateTZList();

// Participant state
let participants = [];

function addParticipant(preset) {
  const person = preset || {
    name:
      participants.length === 0 ? "You" : `Person ${participants.length + 1}`,
    tz:
      participants.length === 0
        ? baselineEl.value || "Asia/Singapore"
        : Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Singapore",
    start: "09:00",
    end: "17:00",
  };
  participants.push(person);
  renderParticipants();
  compute();
}

function removeParticipant(idx) {
  participants.splice(idx, 1);
  renderParticipants();
  compute();
}

function renderParticipants() {
  participantsEl.innerHTML = "";
  participants.forEach((p, idx) => {
    const row = document.createElement("div");
    row.className = "person";
    row.innerHTML = `
      <input class="name" value="${p.name}" />
      <input class="zone" list="tzlist" value="${p.tz}" />
      <div class="work">
        <input class="start" type="time" value="${p.start}" /> 
        <span class="sep">to</span>
        <input class="end" type="time" value="${p.end}" />
      </div>
      <div></div>
      <button class="remove">Remove</button>
    `;
    const [nameEl, zoneEl] = [
      row.querySelector(".name"),
      row.querySelector(".zone"),
    ];
    const startEl = row.querySelector(".start");
    const endEl = row.querySelector(".end");
    row
      .querySelector(".remove")
      .addEventListener("click", () => removeParticipant(idx));
    nameEl.addEventListener("input", () => {
      p.name = nameEl.value;
      compute();
    });
    zoneEl.addEventListener("change", () => {
      p.tz = zoneEl.value;
      compute();
    });
    startEl.addEventListener("change", () => {
      p.start = startEl.value;
      compute();
    });
    endEl.addEventListener("change", () => {
      p.end = endEl.value;
      compute();
    });
    participantsEl.appendChild(row);
  });
}

// Grid header based on baseline zone for today
const step = 30; // minutes per cell for header
const cellsPerHour = 60 / step;

function localDateInTZ(tz) {
  // create a Date object with the current time in the given time zone by formatting then parsing
  const now = new Date();
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(now);
  const get = (t) => parts.find((p) => p.type === t).value;
  const str = `${get("year")}-${get("month")}-${get("day")}T${get(
    "hour"
  )}:${get("minute")}:${get("second")}`;
  return new Date(str);
}

function dateForBaselineMinutes(min) {
  // minutes from midnight in baseline zone, return a Date in baseline zone "local string", parsed back to Date
  const tz = baselineEl.value || "Asia/Singapore";
  const baseStart = localDateInTZ(tz);
  baseStart.setHours(0, 0, 0, 0);
  const target = new Date(baseStart.getTime() + min * 60000);
  return target;
}

function timePartsInTZ(date, tz) {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  });
  const parts = fmt.formatToParts(date);
  const get = (t) => parts.find((p) => p.type === t)?.value || "00";
  return { h: parseInt(get("hour"), 10), m: parseInt(get("minute"), 10) };
}

function minutesFromHHMM(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function insideRange(minLocal, startMin, endMin) {
  if (startMin <= endMin)
    return minLocal >= startMin && minLocal + 0.1 <= endMin; // +0.1 avoids fencepost at exact end
  // overnight shift
  return minLocal >= startMin || minLocal + 0.1 <= endMin;
}

function compute() {
  durationLabelEl.textContent = `${durationEl.value} minutes`;

  // header build based on a focused window around working day of baseline
  const baseStartMin = minutesFromHHMM(baselineStartEl.value);
  const baseEndMin = minutesFromHHMM(baselineEndEl.value);

  // Show a generous window: two hours before baseline start to two hours after baseline end
  const windowStart = Math.max(0, baseStartMin - 120);
  const windowEnd = Math.min(dayMinutes, baseEndMin + 120);
  const totalCells = Math.round((windowEnd - windowStart) / step);

  // header labels
  gridHeaderEl.innerHTML = "";
  for (let i = 0; i < totalCells; i++) {
    const min = windowStart + i * step;
    const d = dateForBaselineMinutes(min);
    const label = new Intl.DateTimeFormat("en-GB", {
      timeZone: baselineEl.value || "Asia/Singapore",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(d);
    const cell = document.createElement("div");
    cell.className = "cell label";
    if (i % cellsPerHour === 0) cell.textContent = label;
    gridHeaderEl.appendChild(cell);
  }

  // body rows
  gridBodyEl.innerHTML = "";
  const dur = parseInt(durationEl.value, 10);
  const bestWindows = []; // {startMin, endMin, score}

  participants.forEach((p) => {
    const row = document.createElement("div");
    row.className = "row";
    const nameCol = document.createElement("div");
    nameCol.className = "col name-col";
    nameCol.textContent = p.name;
    const zoneCol = document.createElement("div");
    zoneCol.className = "col zone-col";
    zoneCol.textContent = p.tz;
    const gridCol = document.createElement("div");
    gridCol.className = "col grid-col";
    const grid = document.createElement("div");
    grid.className = "grid";
    gridCol.appendChild(grid);

    const startLocal = minutesFromHHMM(p.start);
    const endLocal = minutesFromHHMM(p.end);

    for (let i = 0; i < totalCells; i++) {
      const min = windowStart + i * step;
      const dBaseline = dateForBaselineMinutes(min);
      const { h, m } = timePartsInTZ(dBaseline, p.tz);
      const mLocal = h * 60 + m;
      const available = insideRange(mLocal, startLocal, endLocal);
      const cell = document.createElement("div");
      cell.className = "cell" + (available ? " ok" : "");
      grid.appendChild(cell);
    }

    row.appendChild(nameCol);
    row.appendChild(zoneCol);
    row.appendChild(gridCol);
    gridBodyEl.appendChild(row);
  });

  // compute overlap windows at 15 minute granularity using participants availability
  const stepFine = 15;
  const totalFine = Math.round((windowEnd - windowStart) / stepFine);
  const okMask = new Array(totalFine).fill(true);

  participants.forEach((p) => {
    const startLocal = minutesFromHHMM(p.start);
    const endLocal = minutesFromHHMM(p.end);
    for (let i = 0; i < totalFine; i++) {
      const min = windowStart + i * stepFine;
      const dBaseline = dateForBaselineMinutes(min);
      const { h, m } = timePartsInTZ(dBaseline, p.tz);
      const mLocal = h * 60 + m;
      const available = insideRange(mLocal, startLocal, endLocal);
      okMask[i] = okMask[i] && available;
    }
  });

  // scan for contiguous segments that fit duration
  const need = Math.ceil(dur / stepFine);
  const ranges = [];
  let runStart = null;
  for (let i = 0; i < totalFine; i++) {
    if (okMask[i]) {
      if (runStart === null) runStart = i;
    } else if (runStart !== null) {
      const runLen = i - runStart;
      if (runLen >= need) ranges.push([runStart, i - 1]);
      runStart = null;
    }
  }
  if (runStart !== null) {
    const runLen = totalFine - runStart;
    if (runLen >= need) ranges.push([runStart, totalFine - 1]);
  }

  // score ranges: prefer midpoint close to midpoint of each person's window
  function midpointScore(midMinute) {
    let score = 0;
    participants.forEach((p) => {
      const startLocal = minutesFromHHMM(p.start);
      const endLocal = minutesFromHHMM(p.end);
      const dBaseline = dateForBaselineMinutes(midMinute);
      const { h, m } = timePartsInTZ(dBaseline, p.tz);
      const mLocal = h * 60 + m;
      let midLocal =
        startLocal <= endLocal
          ? (startLocal + endLocal) / 2
          : ((startLocal + (endLocal + dayMinutes)) / 2) % dayMinutes;
      const diff = Math.min(
        Math.abs(mLocal - midLocal),
        dayMinutes - Math.abs(mLocal - midLocal)
      );
      const norm = 1 - diff / (dayMinutes / 2);
      score += norm;
    });
    return score / Math.max(1, participants.length);
  }

  const scored = ranges
    .map(([a, b]) => {
      // choose start minute to align to requested duration early in the run
      for (let i = a; i + need - 1 <= b; i++) {
        const startMin = windowStart + i * stepFine;
        const endMin = startMin + dur;
        const mid = startMin + dur / 2;
        const s = midpointScore(mid);
        return { startMin, endMin, score: s };
      }
    })
    .filter(Boolean)
    .sort((x, y) => y.score - x.score);

  suggestionsEl.innerHTML = "";
  scored.slice(0, 8).forEach((r, idx) => {
    const li = document.createElement("li");
    const label = new Intl.DateTimeFormat("en-GB", {
      timeZone: baselineEl.value || "Asia/Singapore",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const startStr = label.format(dateForBaselineMinutes(r.startMin));
    const endStr = label.format(dateForBaselineMinutes(r.endMin));
    const whenText = `${startStr} to ${endStr} ${baselineEl.value}`;
    li.innerHTML = `<span>${whenText}</span><button class="copy">Copy</button>`;
    li.querySelector(".copy").addEventListener("click", () => {
      const details = participants
        .map((p) => `${p.name} in ${p.tz} works ${p.start} to ${p.end}`)
        .join("; ");
      const text = `Proposed meeting: ${whenText}. Participants: ${details}.`;
      navigator.clipboard.writeText(text);
    });
    suggestionsEl.appendChild(li);
  });

  // highlight best windows on each row grid
  const headerCells = gridHeaderEl.children.length;
  const ratio = headerCells / totalFine;
  const rows = Array.from(gridBodyEl.querySelectorAll(".grid"));
  rows.forEach((grid) => {
    scored.slice(0, 3).forEach((r) => {
      const startIndex = Math.floor(
        ((r.startMin - windowStart) / stepFine) * ratio
      );
      const endIndex = Math.floor(
        ((r.endMin - windowStart) / stepFine) * ratio
      );
      for (let i = startIndex; i <= endIndex && i < grid.children.length; i++) {
        grid.children[i].classList.add("best");
      }
    });
  });

  // share link
  const payload = {
    baseline: baselineEl.value,
    baselineStart: baselineStartEl.value,
    baselineEnd: baselineEndEl.value,
    duration: durationEl.value,
    participants,
  };
  const encoded = encodeURIComponent(btoa(JSON.stringify(payload)));
  shareLink.href = `#${encoded}`;
}

// baseline events
[baselineEl, baselineStartEl, baselineEndEl, durationEl].forEach((el) => {
  el.addEventListener("input", compute);
});

addPersonBtn.addEventListener("click", () => addParticipant());

// export import
exportBtn.addEventListener("click", () => {
  const payload = {
    baseline: baselineEl.value,
    baselineStart: baselineStartEl.value,
    baselineEnd: baselineEndEl.value,
    duration: durationEl.value,
    participants,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "meetwindow_config.json";
  a.click();
  URL.revokeObjectURL(url);
});

importBtn.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const text = await file.text();
  try {
    const data = JSON.parse(text);
    baselineEl.value = data.baseline || "Asia/Singapore";
    baselineStartEl.value = data.baselineStart || "09:00";
    baselineEndEl.value = data.baselineEnd || "17:00";
    durationEl.value = data.duration || "60";
    participants = Array.isArray(data.participants) ? data.participants : [];
    renderParticipants();
    compute();
  } catch (err) {
    alert("Invalid config file");
  }
});

function restoreFromHash() {
  try {
    if (location.hash.length > 1) {
      const data = JSON.parse(atob(decodeURIComponent(location.hash.slice(1))));
      baselineEl.value = data.baseline || "Asia/Singapore";
      baselineStartEl.value = data.baselineStart || "09:00";
      baselineEndEl.value = data.baselineEnd || "17:00";
      durationEl.value = data.duration || "60";
      participants = Array.isArray(data.participants) ? data.participants : [];
      renderParticipants();
      compute();
      return;
    }
  } catch (e) {}
  // default
  participants = [];
  addParticipant({
    name: "You",
    tz: "Asia/Singapore",
    start: "09:00",
    end: "17:00",
  });
  addParticipant({
    name: "Teammate",
    tz: "Europe/London",
    start: "09:00",
    end: "17:00",
  });
  addParticipant({
    name: "Partner",
    tz: "America/New_York",
    start: "09:00",
    end: "17:00",
  });
  compute();
}

// draw now indicator aligned to baseline time if within window
function drawNowIndicator() {
  const tz = baselineEl.value || "Asia/Singapore";
  const baseNow = localDateInTZ(tz);
  const nowMin = baseNow.getHours() * 60 + baseNow.getMinutes();
  const baseStartMin = minutesFromHHMM(baselineStartEl.value);
  const baseEndMin = minutesFromHHMM(baselineEndEl.value);
  const windowStart = Math.max(0, baseStartMin - 120);
  const windowEnd = Math.min(dayMinutes, baseEndMin + 120);
  const headerCells = gridHeaderEl.children.length;
  const ratio = headerCells / ((windowEnd - windowStart) / step);
  // remove existing
  document.querySelectorAll(".now-indicator").forEach((el) => el.remove());
  if (nowMin < windowStart || nowMin > windowEnd) return;
  const offsetCells = Math.floor(((nowMin - windowStart) / step) * ratio);
  const indicator = document.createElement("div");
  indicator.className = "now-indicator";
  const targetGrids = [
    gridHeaderEl,
    ...Array.from(gridBodyEl.querySelectorAll(".grid")),
  ];
  targetGrids.forEach((g) => {
    const cell = g.children[offsetCells];
    if (cell) {
      const line = indicator.cloneNode(true);
      cell.style.position = "relative";
      cell.appendChild(line);
    }
  });
}

setInterval(drawNowIndicator, 30000);

restoreFromHash();
setTimeout(() => {
  compute();
  drawNowIndicator();
}, 50);
