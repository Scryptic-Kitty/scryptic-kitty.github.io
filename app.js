const dateEl = document.getElementById("date");
const nameEl = document.getElementById("name");
const locationEl = document.getElementById("location");
const clockinEl = document.getElementById("clockin");
const clockoutEl = document.getElementById("clockout");
const durationDisplay = document.getElementById("durationDisplay");
const categoriesEl = document.getElementById("categories");
const previewEl = document.getElementById("preview");
const recentChipsEl = document.getElementById("recentChips");
const catTemplate = document.getElementById("categoryTemplate");
const titleSuggestionsEl = document.getElementById("titleSuggestions");

const settingsModal = document.getElementById("settingsModal");
const settingsBtn = document.getElementById("settingsBtn");
const settingsCancel = document.getElementById("settingsCancel");
const settingsSave = document.getElementById("settingsSave");
const settingsName = document.getElementById("settingsName");
const settingsLocation = document.getElementById("settingsLocation");
const manageTitlesBtn = document.getElementById("manageTitlesBtn");

const titlesModal = document.getElementById("titlesModal");
const titlesList = document.getElementById("titlesList");
const titleAddInput = document.getElementById("titleAddInput");
const titleAddBtn = document.getElementById("titleAddBtn");
const titlesClose = document.getElementById("titlesClose");

const historyModal = document.getElementById("historyModal");
const historyBtn = document.getElementById("historyBtn");
const historyClose = document.getElementById("historyClose");
const historyList = document.getElementById("historyList");

let currentSettings = { name: "", location: "", recent_categories: [], saved_titles: [], shift: normalizeShift() };

const SETTINGS_KEY = "sitrep_settings";
const HISTORY_KEY = "sitrep_history";
const REPORT_DRAFT_KEY = "sitrep_report_draft";

function newId(prefix) {
  return `${prefix}${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
}

/* ---------- Undo toast ---------- */

const toastEl = document.getElementById("toast");
const toastMsg = document.getElementById("toastMsg");
const toastUndo = document.getElementById("toastUndo");
let toastTimer = null;
let toastUndoFn = null;

function hideToast() {
  clearTimeout(toastTimer);
  toastUndoFn = null;
  toastEl.classList.add("hidden");
}

// Shows a message with an Undo button for a few seconds. Only one at a time:
// a newer delete replaces the previous toast (the earlier delete becomes final).
function showUndo(message, undoFn) {
  clearTimeout(toastTimer);
  toastUndoFn = undoFn;
  toastMsg.textContent = message;
  toastEl.classList.remove("hidden");
  toastTimer = setTimeout(hideToast, 7000);
}

toastUndo.addEventListener("click", () => {
  const fn = toastUndoFn;
  hideToast();
  if (fn) fn();
});

function positiveNumber(v, max = Infinity) {
  const n = parseFloat(v);
  return n > 0 ? Math.min(n, max) : 0;
}

function validTime(v) {
  return typeof v === "string" && /^\d{2}:\d{2}$/.test(v) ? v : "";
}

// Shift & pay settings. schedule[] is indexed by weekday (0 = Sunday); each entry is
// { start: "HH:MM", end: "HH:MM" }. Blank start = day off.
function normalizeShift(s = {}) {
  const schedule = Array.isArray(s.schedule) ? s.schedule : [];
  const weekStart = parseInt(s.week_start, 10);
  return {
    default_hours: positiveNumber(s.default_hours, 24),
    hourly_rate: positiveNumber(s.hourly_rate),
    tax_percent: positiveNumber(s.tax_percent, 100),
    week_start: weekStart >= 0 && weekStart <= 6 ? weekStart : 0,
    schedule: Array.from({ length: 7 }, (_, i) => {
      const e = schedule[i] && typeof schedule[i] === "object" ? schedule[i] : {};
      return { start: validTime(e.start), end: validTime(e.end) };
    }),
  };
}

function readSettings() {
  const defaults = {
    name: "",
    location: "",
    recent_categories: [],
    saved_titles: [],
    shift: normalizeShift(),
  };
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw);
    const settings = { ...defaults, ...parsed };
    settings.shift = normalizeShift(parsed.shift);
    // Migration: seed saved titles from the old "recent" list the first time.
    if (!Array.isArray(parsed.saved_titles)) {
      settings.saved_titles = sortTitles(settings.recent_categories || []);
    }
    return settings;
  } catch (e) {
    return defaults;
  }
}

function writeSettings(settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

function readHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function writeHistory(history) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

// Local calendar date (not UTC), so evening clock-ins land on the right day.
function localISO(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function todayISO() {
  return localISO(new Date());
}

function formatDateForReport(isoDate) {
  const [y, m, d] = isoDate.split("-");
  return `${m}/${d}/${y.slice(2)}`;
}

function to12Hour(hhmm) {
  if (!hhmm) return "";
  let [h, m] = hhmm.split(":").map(Number);
  const ampm = h >= 12 ? "pm" : "am";
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${m.toString().padStart(2, "0")}${ampm}`;
}

function computeDuration() {
  const inVal = clockinEl.value;
  const outVal = clockoutEl.value;
  if (!inVal || !outVal) {
    durationDisplay.textContent = "--";
    return null;
  }
  const [inH, inM] = inVal.split(":").map(Number);
  const [outH, outM] = outVal.split(":").map(Number);
  let startMinutes = inH * 60 + inM;
  let endMinutes = outH * 60 + outM;
  if (endMinutes < startMinutes) endMinutes += 24 * 60;
  const totalMinutes = endMinutes - startMinutes;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  const label = `${to12Hour(inVal)}-${to12Hour(outVal)} (${hours}h ${minutes}m)`;
  durationDisplay.textContent = label;
  return { hours, minutes, label };
}

async function loadSettings() {
  currentSettings = readSettings();
  nameEl.value = currentSettings.name || "";
  locationEl.value = currentSettings.location || "";
  renderRecentChips();
  renderTitleSuggestions();
}

function renderRecentChips() {
  recentChipsEl.innerHTML = "";
  (currentSettings.recent_categories || []).forEach((cat) => {
    const chip = document.createElement("div");
    chip.className = "chip";
    chip.textContent = cat;
    chip.addEventListener("click", () => addCategory(cat));
    recentChipsEl.appendChild(chip);
  });
}

/* ---------- Saved task titles (autocomplete + manager) ---------- */

function sortTitles(list) {
  return list
    .slice()
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

// Adds a title to the saved list (case-insensitive de-dupe). Returns true if added.
// Does not write to storage; the caller does that.
function addSavedTitle(title) {
  const t = (title || "").trim();
  if (!t) return false;
  const list = currentSettings.saved_titles || [];
  if (list.some((x) => x.toLowerCase() === t.toLowerCase())) return false;
  currentSettings.saved_titles = sortTitles([...list, t]);
  return true;
}

function renderTitleSuggestions() {
  titleSuggestionsEl.innerHTML = "";
  (currentSettings.saved_titles || []).forEach((t) => {
    const opt = document.createElement("option");
    opt.value = t;
    titleSuggestionsEl.appendChild(opt);
  });
}

function renderTitlesList() {
  titlesList.innerHTML = "";
  const titles = currentSettings.saved_titles || [];
  if (!titles.length) {
    titlesList.innerHTML = "<p class='hint'>No saved titles yet.</p>";
    return;
  }
  titles.forEach((t) => {
    const row = document.createElement("div");
    row.className = "title-row";
    const label = document.createElement("span");
    label.className = "title-text";
    label.textContent = t;
    const del = document.createElement("button");
    del.className = "icon-btn";
    del.setAttribute("aria-label", `Delete ${t}`);
    del.textContent = "✕";
    del.addEventListener("click", () => {
      currentSettings.saved_titles = currentSettings.saved_titles.filter((x) => x !== t);
      writeSettings(currentSettings);
      renderTitlesList();
      renderTitleSuggestions();
      showUndo(`Removed "${t}"`, () => {
        if (addSavedTitle(t)) {
          writeSettings(currentSettings);
          renderTitlesList();
          renderTitleSuggestions();
        }
      });
    });
    row.appendChild(label);
    row.appendChild(del);
    titlesList.appendChild(row);
  });
}

function submitNewTitle() {
  const value = titleAddInput.value.trim();
  if (!value) return;
  if (addSavedTitle(value)) {
    writeSettings(currentSettings);
    renderTitlesList();
    renderTitleSuggestions();
  }
  titleAddInput.value = "";
  titleAddInput.focus();
}

manageTitlesBtn.addEventListener("click", () => {
  renderTitlesList();
  titlesModal.classList.remove("hidden");
});
titlesClose.addEventListener("click", () => titlesModal.classList.add("hidden"));
titleAddBtn.addEventListener("click", submitNewTitle);
titleAddInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    submitNewTitle();
  }
});

/* ---------- Backup & restore ---------- */

const exportBackupBtn = document.getElementById("exportBackupBtn");
const importBackupBtn = document.getElementById("importBackupBtn");
const importFileInput = document.getElementById("importFileInput");

function backupFilename() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `sitrep-backup-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.json`;
}

function buildBackup() {
  const data = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith("sitrep_")) data[key] = localStorage.getItem(key);
  }
  return { app: "sitrep", version: 1, exported_at: new Date().toISOString(), data };
}

async function exportBackup() {
  const json = JSON.stringify(buildBackup(), null, 2);
  const filename = backupFilename();

  // On phones the share sheet lets you save to Files, email it, etc.
  try {
    const file = new File([json], filename, { type: "application/json" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: "SITREP backup" });
      return;
    }
  } catch (err) {
    if (err && err.name === "AbortError") return; // person closed the share sheet
  }

  const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function importBackupFile(file) {
  const reader = new FileReader();
  reader.onerror = () => alert("Couldn't read that file.");
  reader.onload = () => {
    let parsed;
    try {
      parsed = JSON.parse(reader.result);
    } catch (e) {
      alert("That file isn't a valid SITREP backup.");
      return;
    }
    if (!parsed || parsed.app !== "sitrep" || !parsed.data || typeof parsed.data !== "object") {
      alert("That file isn't a valid SITREP backup.");
      return;
    }
    const entries = Object.entries(parsed.data).filter(
      ([k, v]) => k.startsWith("sitrep_") && typeof v === "string"
    );
    if (!entries.length) {
      alert("This backup doesn't contain any data.");
      return;
    }
    const when = parsed.exported_at ? formatTimestamp(parsed.exported_at) : "an unknown date";
    if (!confirm(`Restore the backup from ${when}? This replaces everything currently in the app.`)) return;

    Object.keys(localStorage)
      .filter((k) => k.startsWith("sitrep_"))
      .forEach((k) => localStorage.removeItem(k));
    entries.forEach(([k, v]) => localStorage.setItem(k, v));
    location.reload();
  };
  reader.readAsText(file);
}

exportBackupBtn.addEventListener("click", exportBackup);
importBackupBtn.addEventListener("click", () => importFileInput.click());
importFileInput.addEventListener("change", () => {
  const file = importFileInput.files[0];
  importFileInput.value = "";
  if (file) importBackupFile(file);
});

/* ---------- Drag reorder ---------- */

function enableDragReorder(container, itemSelector, onReorder) {
  container.addEventListener("pointerdown", (e) => {
    const handle = e.target.closest(".drag-handle");
    if (!handle || !container.contains(handle)) return;

    const draggingEl = handle.closest(itemSelector);
    if (!draggingEl || draggingEl.parentElement !== container) return;

    e.preventDefault();
    e.stopPropagation();

    const pointerId = e.pointerId;
    draggingEl.classList.add("dragging");

    try {
      handle.setPointerCapture(pointerId);
    } catch (err) {}

    const onMove = (moveEvt) => {
      if (moveEvt.pointerId !== pointerId) return;
      moveEvt.preventDefault();
      const y = moveEvt.clientY;
      const siblings = Array.from(container.querySelectorAll(itemSelector)).filter(
        (el) => el !== draggingEl
      );
      let placed = false;
      for (const sib of siblings) {
        const rect = sib.getBoundingClientRect();
        if (y < rect.top + rect.height / 2) {
          container.insertBefore(draggingEl, sib);
          placed = true;
          break;
        }
      }
      if (!placed) container.appendChild(draggingEl);
    };

    const cleanup = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      draggingEl.classList.remove("dragging");
      try {
        handle.releasePointerCapture(pointerId);
      } catch (err) {}
      if (onReorder) onReorder();
    };

    const onUp = (upEvt) => {
      if (upEvt.pointerId !== pointerId) return;
      cleanup();
    };

    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  });
}

/* ---------- Report ---------- */

function addCategory(title = "", opts = {}) {
  const { addEmptyStep = true } = opts;
  const node = catTemplate.content.cloneNode(true);
  const catDiv = node.querySelector(".category");
  const titleInput = node.querySelector(".cat-title");
  titleInput.value = title;
  titleInput.setAttribute("list", "titleSuggestions");
  titleInput.addEventListener("input", updatePreview);

  node.querySelector(".remove-cat").addEventListener("click", () => {
    catDiv.remove();
    updatePreview();
  });

  node.querySelector(".add-step").addEventListener("click", () => {
    addStep(catDiv);
    updatePreview();
  });

  categoriesEl.appendChild(node);
  enableDragReorder(catDiv.querySelector(".steps"), ".step-row", updatePreview);
  if (addEmptyStep) addStep(catDiv);
  updatePreview();
  return catDiv;
}

function addStep(catDiv, text = "", opts = {}) {
  const { linkedChecklistId = null } = opts;
  const stepsContainer = catDiv.querySelector(".steps");
  const row = document.createElement("div");
  row.className = "step-row";
  if (linkedChecklistId) row.dataset.checklistId = linkedChecklistId;
  row.innerHTML = `<span class="drag-handle" aria-label="Drag to reorder">⠿</span>
  <input type="text" placeholder="What did you do?">
  <button class="icon-btn remove-step" aria-label="Remove step">✕</button>`;
  const input = row.querySelector("input");
  input.value = text;
  input.addEventListener("input", updatePreview);
  row.querySelector(".remove-step").addEventListener("click", () => {
    row.remove();
    updatePreview();
  });
  stepsContainer.appendChild(row);
  return row;
}

function findCategoryByTitle(title) {
  const target = title.trim().toLowerCase();
  if (!target) return null;
  return (
    Array.from(categoriesEl.querySelectorAll(".category")).find(
      (catDiv) => catDiv.querySelector(".cat-title").value.trim().toLowerCase() === target
    ) || null
  );
}

function findLinkedStepRow(checklistId) {
  return categoriesEl.querySelector(`.step-row[data-checklist-id="${checklistId}"]`) || null;
}

function applyChecklistLink(item) {
  if (!item.linkCategory || !item.linkStep) return;
  if (findLinkedStepRow(item.id)) return;
  let catDiv = findCategoryByTitle(item.linkCategory);
  if (!catDiv) catDiv = addCategory(item.linkCategory.trim(), { addEmptyStep: false });
  addStep(catDiv, item.linkStep.trim(), { linkedChecklistId: item.id });
  updatePreview();
}

function removeChecklistLink(item) {
  const row = findLinkedStepRow(item.id);
  if (row) {
    row.remove();
    updatePreview();
  }
}

function reapplyChecklistLink(item) {
  removeChecklistLink(item);
  applyChecklistLink(item);
}

function collectReport() {
  const dur = computeDuration();
  const lines = [];
  lines.push(`Date: ${dateEl.value ? formatDateForReport(dateEl.value) : ""}`);
  lines.push(`Name: ${nameEl.value}`);
  lines.push(`Location: ${locationEl.value}`);
  lines.push(`Duration: ${dur ? dur.label : ""}`);
  lines.push("");

  const categoryNames = [];
  document.querySelectorAll(".category").forEach((catDiv) => {
    const title = catDiv.querySelector(".cat-title").value.trim();
    const steps = Array.from(catDiv.querySelectorAll(".step-row input"))
      .map((i) => i.value.trim())
      .filter((v) => v.length > 0);
    if (!title && steps.length === 0) return;
    if (title) categoryNames.push(title);
    lines.push(title ? `*${title}*` : "(untitled)");
    steps.forEach((s) => lines.push(`• ${s}`));
    lines.push("");
  });

  while (lines.length && lines[lines.length - 1] === "") lines.pop();

  return { text: lines.join("\n"), categoryNames };
}

function updatePreview() {
  const { text } = collectReport();
  previewEl.textContent = text;
  writeReportDraft();
}

function writeReportDraft() {
  const categories = Array.from(categoriesEl.querySelectorAll(".category")).map((catDiv) => ({
    title: catDiv.querySelector(".cat-title").value,
    steps: Array.from(catDiv.querySelectorAll(".step-row")).map((row) => ({
      text: row.querySelector("input").value,
      checklistId: row.dataset.checklistId || null,
    })),
  }));
  const draft = {
    date: dateEl.value,
    name: nameEl.value,
    location: locationEl.value,
    clockin: clockinEl.value,
    clockout: clockoutEl.value,
    categories,
  };
  localStorage.setItem(REPORT_DRAFT_KEY, JSON.stringify(draft));
}

function readReportDraft() {
  try {
    const raw = localStorage.getItem(REPORT_DRAFT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function restoreReportDraft() {
  const draft = readReportDraft();
  if (!draft || !draft.categories || !draft.categories.length) {
    dateEl.value = todayISO();
    addCategory();
    return;
  }
  dateEl.value = draft.date || todayISO();
  nameEl.value = draft.name || nameEl.value;
  locationEl.value = draft.location || locationEl.value;
  clockinEl.value = draft.clockin || "";
  clockoutEl.value = draft.clockout || "";
  draft.categories.forEach((cat) => {
    const catDiv = addCategory(cat.title, { addEmptyStep: false });
    if (!cat.steps.length) {
      addStep(catDiv);
    } else {
      cat.steps.forEach((step) => {
        addStep(catDiv, step.text, { linkedChecklistId: step.checklistId || null });
      });
    }
  });
  updatePreview();
}

function clearReport() {
  if (!confirm("Clear the current report? This can't be undone.")) return;
  categoriesEl.innerHTML = "";
  dateEl.value = todayISO();
  nameEl.value = currentSettings.name || "";
  locationEl.value = currentSettings.location || "";
  clockinEl.value = "";
  clockoutEl.value = "";
  logDate = null; // release this day's time record; clearing never deletes logged hours
  addCategory();
  allChecklistItems().forEach((item) => {
    if (item.done && item.linkCategory && item.linkStep) {
      item.done = false;
    }
  });
  writeChecklists();
  renderChecklists();
  updatePreview();
  updateTimeline();
}

document.getElementById("addCategoryBtn").addEventListener("click", () => addCategory());
document.getElementById("clearReportBtn").addEventListener("click", clearReport);

function formatTimestamp(isoString) {
  const d = new Date(isoString);
  if (isNaN(d)) return isoString;
  const dateStr = d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  const timeStr = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${dateStr} · ${timeStr}`;
}

async function openHistory() {
  historyList.innerHTML = "<p class='hint'>Loading…</p>";
  historyModal.classList.remove("hidden");

  const entries = readHistory();

  if (!entries.length) {
    historyList.innerHTML = "<p class='hint'>No reports sent yet.</p>";
    return;
  }

  historyList.innerHTML = "";
  entries.slice().reverse().forEach((entry) => {
    const item = document.createElement("div");
    item.className = "history-item";

    const headerRow = document.createElement("div");
    headerRow.className = "history-item-row";

    const header = document.createElement("button");
    header.className = "history-item-header";
    header.textContent = formatTimestamp(entry.timestamp);

    const body = document.createElement("pre");
    body.className = "preview history-item-body hidden";
    body.textContent = entry.report_text;

    header.addEventListener("click", () => body.classList.toggle("hidden"));

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "icon-btn history-delete";
    deleteBtn.setAttribute("aria-label", "Delete report");
    deleteBtn.textContent = "🗑";
    deleteBtn.addEventListener("click", () => {
      if (!confirm("Delete this report? This can't be undone.")) return;
      writeHistory(readHistory().filter((e) => e.timestamp !== entry.timestamp));
      openHistory();
      showUndo("Report deleted", () => {
        const restored = readHistory();
        restored.push(entry);
        restored.sort((a, b) => (a.timestamp < b.timestamp ? -1 : 1));
        writeHistory(restored);
        if (!historyModal.classList.contains("hidden")) openHistory();
      });
    });

    headerRow.appendChild(header);
    headerRow.appendChild(deleteBtn);
    item.appendChild(headerRow);
    item.appendChild(body);
    historyList.appendChild(item);
  });
}

historyBtn.addEventListener("click", openHistory);
historyClose.addEventListener("click", () => historyModal.classList.add("hidden"));

settingsBtn.addEventListener("click", () => {
  settingsName.value = nameEl.value;
  settingsLocation.value = locationEl.value;
  settingsModal.classList.remove("hidden");
});

settingsCancel.addEventListener("click", () => {
  settingsModal.classList.add("hidden");
});

settingsSave.addEventListener("click", () => {
  currentSettings.name = settingsName.value;
  currentSettings.location = settingsLocation.value;
  writeSettings(currentSettings);
  nameEl.value = currentSettings.name || "";
  locationEl.value = currentSettings.location || "";
  settingsModal.classList.add("hidden");
  updatePreview();
});

document.getElementById("sendBtn").addEventListener("click", async () => {
  const { text, categoryNames } = collectReport();

  if (!text.trim()) {
    alert("Add at least a header or a task before sending.");
    return;
  }

  const history = readHistory();
  history.push({ timestamp: new Date().toISOString(), report_text: text });
  writeHistory(history.slice(-90));

  const recents = currentSettings.recent_categories || [];
  categoryNames.forEach((cat) => {
    cat = cat.trim();
    if (!cat) return;
    const idx = recents.indexOf(cat);
    if (idx !== -1) recents.splice(idx, 1);
    recents.unshift(cat);
    addSavedTitle(cat);
  });
  currentSettings.recent_categories = recents.slice(0, 12);
  writeSettings(currentSettings);
  renderRecentChips();
  renderTitleSuggestions();

  const encoded = encodeURIComponent(text);
  window.location.href = `https://wa.me/?text=${encoded}`;
});

[dateEl, nameEl, locationEl, clockinEl, clockoutEl].forEach((el) => {
  el.addEventListener("input", updatePreview);
});

/* ---------- Checklists (multiple) ---------- */

const checklistsEl = document.getElementById("checklistsContainer");
const checklistCardTemplate = document.getElementById("checklistCardTemplate");
const checklistItemTemplate = document.getElementById("checklistItemTemplate");
const addChecklistBtn = document.getElementById("addChecklistBtn");

const CHECKLISTS_KEY = "sitrep_checklists";
const LEGACY_CHECKLIST_KEY = "sitrep_checklist";
let checklists = [];
const editingChecklists = new Set();

function normalizeChecklistItem(item) {
  return { id: newId("t"), text: "", done: false, linkCategory: "", linkStep: "", ...item };
}

function readChecklists() {
  try {
    const raw = localStorage.getItem(CHECKLISTS_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      if (Array.isArray(data) && data.length) {
        return data.map((l) => ({
          id: l.id || newId("c"),
          name: l.name || "",
          items: (l.items || []).map(normalizeChecklistItem),
        }));
      }
    }
    // Migration: the old single checklist becomes the first of many.
    const legacy = localStorage.getItem(LEGACY_CHECKLIST_KEY);
    if (legacy) {
      const items = JSON.parse(legacy).map(normalizeChecklistItem);
      return [{ id: newId("c"), name: "Daily Checklist", items }];
    }
  } catch (e) {}
  return [{ id: newId("c"), name: "Daily Checklist", items: [] }];
}

function writeChecklists() {
  localStorage.setItem(CHECKLISTS_KEY, JSON.stringify(checklists));
}

function allChecklistItems() {
  return checklists.flatMap((l) => l.items);
}

function createChecklistItemEl(list, item) {
  const editing = editingChecklists.has(list.id);
  const node = checklistItemTemplate.content.cloneNode(true);
  const row = node.querySelector(".checklist-item");
  row.dataset.id = item.id;

  const checkbox = row.querySelector(".check-toggle");
  const textInput = row.querySelector(".checklist-text");
  const removeBtn = row.querySelector(".remove-checklist-item");
  const linkCategoryInput = row.querySelector(".checklist-link-category");
  const linkStepInput = row.querySelector(".checklist-link-step");

  linkCategoryInput.setAttribute("list", "titleSuggestions");

  checkbox.checked = item.done;
  textInput.value = item.text;
  row.classList.toggle("done", item.done);
  textInput.readOnly = !editing;
  linkCategoryInput.value = item.linkCategory || "";
  linkStepInput.value = item.linkStep || "";

  checkbox.addEventListener("change", () => {
    item.done = checkbox.checked;
    row.classList.toggle("done", item.done);
    writeChecklists();
    if (item.done) {
      applyChecklistLink(item);
    } else {
      removeChecklistLink(item);
    }
  });

  textInput.addEventListener("input", () => {
    item.text = textInput.value;
    writeChecklists();
  });

  linkCategoryInput.addEventListener("input", () => {
    item.linkCategory = linkCategoryInput.value;
    writeChecklists();
    if (item.done) reapplyChecklistLink(item);
  });

  linkStepInput.addEventListener("input", () => {
    item.linkStep = linkStepInput.value;
    writeChecklists();
    if (item.done) reapplyChecklistLink(item);
  });

  removeBtn.addEventListener("click", () => {
    const index = list.items.indexOf(item);
    list.items = list.items.filter((t) => t.id !== item.id);
    row.remove();
    writeChecklists();
    showUndo("Task removed", () => {
      if (!checklists.includes(list)) return;
      list.items.splice(Math.min(index, list.items.length), 0, item);
      writeChecklists();
      renderChecklists();
    });
  });

  return row;
}

function createChecklistCardEl(list) {
  const editing = editingChecklists.has(list.id);
  const node = checklistCardTemplate.content.cloneNode(true);
  const card = node.querySelector(".checklist-card");
  card.dataset.id = list.id;

  const nameLabel = card.querySelector(".checklist-name");
  const nameInput = card.querySelector(".checklist-name-input");
  const clearBtn = card.querySelector(".checklist-clear");
  const editBtn = card.querySelector(".checklist-edit");
  const itemsEl = card.querySelector(".checklist-items");
  const addItemBtn = card.querySelector(".add-checklist-item");
  const deleteBtn = card.querySelector(".delete-checklist");

  nameLabel.textContent = list.name || "Untitled checklist";
  nameInput.value = list.name;
  nameLabel.classList.toggle("hidden", editing);
  nameInput.classList.toggle("hidden", !editing);
  editBtn.textContent = editing ? "Done" : "Edit";
  itemsEl.classList.toggle("edit-mode", editing);
  addItemBtn.classList.toggle("hidden", !editing);
  deleteBtn.classList.toggle("hidden", !editing);

  list.items.forEach((item) => itemsEl.appendChild(createChecklistItemEl(list, item)));

  nameInput.addEventListener("input", () => {
    list.name = nameInput.value;
    writeChecklists();
  });

  editBtn.addEventListener("click", () => {
    if (editingChecklists.has(list.id)) editingChecklists.delete(list.id);
    else editingChecklists.add(list.id);
    renderChecklists();
  });

  clearBtn.addEventListener("click", () => {
    if (!list.items.length) return;
    if (!confirm("Uncheck all items in this checklist?")) return;
    list.items.forEach((item) => {
      if (item.done) {
        removeChecklistLink(item);
        item.done = false;
      }
    });
    writeChecklists();
    renderChecklists();
  });

  addItemBtn.addEventListener("click", () => {
    const newItem = normalizeChecklistItem({});
    list.items.push(newItem);
    const el = createChecklistItemEl(list, newItem);
    itemsEl.appendChild(el);
    el.querySelector(".checklist-text").focus();
    writeChecklists();
  });

  deleteBtn.addEventListener("click", () => {
    if (!confirm(`Delete "${list.name || "this checklist"}" and all its items?`)) return;
    list.items.forEach((item) => {
      if (item.done) removeChecklistLink(item);
    });
    const index = checklists.indexOf(list);
    checklists = checklists.filter((l) => l.id !== list.id);
    editingChecklists.delete(list.id);
    writeChecklists();
    renderChecklists();
    showUndo("Checklist deleted", () => {
      checklists.splice(Math.min(index, checklists.length), 0, list);
      writeChecklists();
      renderChecklists();
      list.items.filter((item) => item.done).forEach(applyChecklistLink);
    });
  });

  enableDragReorder(itemsEl, ".checklist-item", () => {
    const ids = Array.from(itemsEl.querySelectorAll(".checklist-item")).map((el) => el.dataset.id);
    list.items.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
    writeChecklists();
  });

  return card;
}

function renderChecklists() {
  checklistsEl.innerHTML = "";
  if (!checklists.length) {
    checklistsEl.innerHTML = "<p class='hint'>No checklists yet.</p>";
    return;
  }
  checklists.forEach((list) => checklistsEl.appendChild(createChecklistCardEl(list)));
}

function syncChecklistsOrderFromDOM() {
  const ids = Array.from(checklistsEl.querySelectorAll(".checklist-card")).map((el) => el.dataset.id);
  checklists.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
  writeChecklists();
}

addChecklistBtn.addEventListener("click", () => {
  const list = { id: newId("c"), name: "New Checklist", items: [] };
  checklists.push(list);
  editingChecklists.add(list.id);
  writeChecklists();
  renderChecklists();
});

enableDragReorder(checklistsEl, ".checklist-card", syncChecklistsOrderFromDOM);
checklists = readChecklists();
writeChecklists();
renderChecklists();

/* ---------- Notes (multiple tabs) ---------- */

const notesTextarea = document.getElementById("notesTextarea");
const noteTabsEl = document.getElementById("noteTabs");
const noteRenameBtn = document.getElementById("noteRenameBtn");
const noteDeleteBtn = document.getElementById("noteDeleteBtn");

const LEGACY_NOTES_KEY = "sitrep_notes";
const NOTES_V2_KEY = "sitrep_notes_v2";
let notesData = { notes: [], activeId: null };

function readNotes() {
  try {
    const raw = localStorage.getItem(NOTES_V2_KEY);
    if (raw) {
      const d = JSON.parse(raw);
      if (d && Array.isArray(d.notes) && d.notes.length) {
        const activeId = d.notes.some((n) => n.id === d.activeId) ? d.activeId : d.notes[0].id;
        return { notes: d.notes, activeId };
      }
    }
  } catch (e) {}
  // Migration: the old single note becomes the first tab.
  const legacy = localStorage.getItem(LEGACY_NOTES_KEY) || "";
  const first = { id: newId("n"), title: "Notes", text: legacy };
  return { notes: [first], activeId: first.id };
}

function writeNotes() {
  localStorage.setItem(NOTES_V2_KEY, JSON.stringify(notesData));
}

function activeNote() {
  return notesData.notes.find((n) => n.id === notesData.activeId) || notesData.notes[0];
}

function renderNotes() {
  noteTabsEl.innerHTML = "";
  notesData.notes.forEach((note) => {
    const tab = document.createElement("button");
    tab.className = "note-tab" + (note.id === notesData.activeId ? " active" : "");
    tab.textContent = note.title || "Untitled";
    tab.addEventListener("click", () => {
      notesData.activeId = note.id;
      writeNotes();
      renderNotes();
    });
    noteTabsEl.appendChild(tab);
  });

  const addTab = document.createElement("button");
  addTab.className = "note-tab add";
  addTab.setAttribute("aria-label", "Add note");
  addTab.textContent = "+";
  addTab.addEventListener("click", () => {
    const note = { id: newId("n"), title: `Note ${notesData.notes.length + 1}`, text: "" };
    notesData.notes.push(note);
    notesData.activeId = note.id;
    writeNotes();
    renderNotes();
    notesTextarea.focus();
  });
  noteTabsEl.appendChild(addTab);

  notesTextarea.value = activeNote().text || "";
}

notesTextarea.addEventListener("input", () => {
  activeNote().text = notesTextarea.value;
  writeNotes();
});

noteRenameBtn.addEventListener("click", () => {
  const note = activeNote();
  const title = prompt("Rename note:", note.title);
  if (title === null) return;
  note.title = title.trim() || note.title;
  writeNotes();
  renderNotes();
});

noteDeleteBtn.addEventListener("click", () => {
  const note = activeNote();
  if (!confirm(`Delete "${note.title}"? This can't be undone.`)) return;
  const index = notesData.notes.indexOf(note);
  notesData.notes = notesData.notes.filter((n) => n.id !== note.id);
  let placeholderId = null;
  if (!notesData.notes.length) {
    const placeholder = { id: newId("n"), title: "Notes", text: "" };
    placeholderId = placeholder.id;
    notesData.notes.push(placeholder);
  }
  notesData.activeId = notesData.notes[0].id;
  writeNotes();
  renderNotes();
  showUndo(`Deleted "${note.title}"`, () => {
    if (placeholderId) notesData.notes = notesData.notes.filter((n) => n.id !== placeholderId);
    notesData.notes.splice(Math.min(index, notesData.notes.length), 0, note);
    notesData.activeId = note.id;
    writeNotes();
    renderNotes();
  });
});

notesData = readNotes();
writeNotes();
renderNotes();

/* ---------- Quick links ---------- */

const linksListEl = document.getElementById("linksList");
const linkItemTemplate = document.getElementById("linkItemTemplate");
const addLinkBtn = document.getElementById("addLinkBtn");

const linkModal = document.getElementById("linkModal");
const linkModalTitle = document.getElementById("linkModalTitle");
const linkTitleInput = document.getElementById("linkTitleInput");
const linkUrlInput = document.getElementById("linkUrlInput");
const linkExternalInput = document.getElementById("linkExternalInput");
const linkModalCancel = document.getElementById("linkModalCancel");
const linkModalSave = document.getElementById("linkModalSave");
const linkModalDelete = document.getElementById("linkModalDelete");

const browserOverlay = document.getElementById("browserOverlay");
const browserFrame = document.getElementById("browserFrame");
const browserTitle = document.getElementById("browserTitle");
const browserClose = document.getElementById("browserClose");
const browserOpenExternal = document.getElementById("browserOpenExternal");

const LINKS_KEY = "sitrep_links";
let linksData = [];
let editingLinkId = null;

function readLinks() {
  try {
    const raw = localStorage.getItem(LINKS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function writeLinks() {
  localStorage.setItem(LINKS_KEY, JSON.stringify(linksData));
}

function normalizeUrl(rawUrl) {
  let url = rawUrl.trim();
  if (!url) return url;
  if (!/^https?:\/\//i.test(url)) url = "https://" + url;
  return url;
}

function createLinkItemEl(link) {
  const node = linkItemTemplate.content.cloneNode(true);
  const row = node.querySelector(".link-item");
  row.dataset.id = link.id;
  row.querySelector(".link-title").textContent = link.title || link.url;
  const urlEl = row.querySelector(".link-url");
  urlEl.textContent = "";
  if (link.external) {
    const badge = document.createElement("span");
    badge.className = "external-badge";
    badge.textContent = "↗";
    urlEl.appendChild(badge);
  }
  urlEl.appendChild(document.createTextNode(link.url));

  row.querySelector(".link-open").addEventListener("click", () => openLink(link));
  row.querySelector(".link-edit").addEventListener("click", () => openLinkModal(link));

  return row;
}

function renderLinks() {
  linksListEl.innerHTML = "";
  if (!linksData.length) {
    linksListEl.innerHTML = "<p class='hint'></p>";
    return;
  }
  linksData.forEach((link) => linksListEl.appendChild(createLinkItemEl(link)));
}

function syncLinksOrderFromDOM() {
  const ids = Array.from(linksListEl.querySelectorAll(".link-item")).map((el) => el.dataset.id);
  linksData.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
  writeLinks();
}

function openLinkModal(link = null) {
  editingLinkId = link ? link.id : null;
  linkModalTitle.textContent = link ? "Edit Link" : "Add Link";
  linkTitleInput.value = link ? link.title : "";
  linkUrlInput.value = link ? link.url : "";
  linkExternalInput.checked = link ? !!link.external : false;
  linkModalDelete.classList.toggle("hidden", !link);
  linkModal.classList.remove("hidden");
  linkTitleInput.focus();
}

addLinkBtn.addEventListener("click", () => openLinkModal());
linkModalCancel.addEventListener("click", () => linkModal.classList.add("hidden"));

linkModalSave.addEventListener("click", () => {
  const title = linkTitleInput.value.trim();
  const url = normalizeUrl(linkUrlInput.value);
  if (!url) {
    alert("Add a URL before saving.");
    return;
  }

  const external = linkExternalInput.checked;

  if (editingLinkId) {
    const existing = linksData.find((l) => l.id === editingLinkId);
    if (existing) {
      existing.title = title;
      existing.url = url;
      existing.external = external;
    }
  } else {
    linksData.push({ id: `l${Date.now()}`, title, url, external });
  }

  writeLinks();
  renderLinks();
  linkModal.classList.add("hidden");
});

linkModalDelete.addEventListener("click", () => {
  if (!editingLinkId) return;
  if (!confirm("Delete this link?")) return;
  const removed = linksData.find((l) => l.id === editingLinkId);
  const index = linksData.indexOf(removed);
  linksData = linksData.filter((l) => l.id !== editingLinkId);
  writeLinks();
  renderLinks();
  linkModal.classList.add("hidden");
  if (removed) {
    showUndo("Link deleted", () => {
      linksData.splice(Math.min(index, linksData.length), 0, removed);
      writeLinks();
      renderLinks();
    });
  }
});

function openLink(link) {
  if (link.external) {
    openExternal(link);
  } else {
    openInOverlay(link);
  }
}

function openInOverlay(link) {
  browserTitle.textContent = link.title || link.url;
  browserFrame.src = link.url;
  browserOverlay.classList.remove("hidden");
}

function openExternal(link) {
  window.open(link.url, `sitrep_link_${link.id}`);
}

browserClose.addEventListener("click", () => {
  browserOverlay.classList.add("hidden");
  browserFrame.src = "about:blank";
});

browserOpenExternal.addEventListener("click", () => {
  window.open(browserFrame.src, "_blank");
});

enableDragReorder(linksListEl, ".link-item", syncLinksOrderFromDOM);
linksData = readLinks();
renderLinks();

/* ---------- Timeline, weekly stats & pay ---------- */

const TIMELOG_KEY = "sitrep_timelog";
const TIMELOG_BACKFILL_KEY = "sitrep_timelog_backfilled";
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const STALE_MS = 24 * 60 * 60 * 1000; // an open shift older than this is treated as a missed clock-out

const clockBtn = document.getElementById("clockBtn");
const tlStatus = document.getElementById("tlStatus");
const tlOff = document.getElementById("tlOff");
const tlElapsed = document.getElementById("tlElapsed");
const tlOf = document.getElementById("tlOf");
const tlRemaining = document.getElementById("tlRemaining");
const tlBar = document.getElementById("tlBar");
const tlBarFill = document.getElementById("tlBarFill");
const tlNext = document.getElementById("tlNext");
const tlWeekHours = document.getElementById("tlWeekHours");
const tlWeekBar = document.getElementById("tlWeekBar");
const tlWeekFill = document.getElementById("tlWeekFill");
const tlWeekMoney = document.getElementById("tlWeekMoney");

const shiftModal = document.getElementById("shiftModal");
const shiftSettingsBtn = document.getElementById("shiftSettingsBtn");
const shiftDefaultHours = document.getElementById("shiftDefaultHours");
const shiftWeekStart = document.getElementById("shiftWeekStart");
const shiftRate = document.getElementById("shiftRate");
const shiftTax = document.getElementById("shiftTax");
const shiftScheduleEl = document.getElementById("shiftSchedule");
const shiftCancel = document.getElementById("shiftCancel");
const shiftSave = document.getElementById("shiftSave");

// One record per day: { "2026-10-08": { in: "17:30", out: "00:30" | null } }.
// The report form owns one record at a time (logDate) and keeps it in sync;
// clearing the report releases ownership but never deletes logged hours.
let timelog = readTimelog();
let logDate = null;

function readTimelog() {
  try {
    const raw = localStorage.getItem(TIMELOG_KEY);
    const obj = raw ? JSON.parse(raw) : {};
    return obj && typeof obj === "object" ? obj : {};
  } catch (e) {
    return {};
  }
}

function writeTimelog() {
  localStorage.setItem(TIMELOG_KEY, JSON.stringify(timelog));
}

function syncTimelog() {
  const date = dateEl.value;
  const cin = clockinEl.value;
  const cout = clockoutEl.value;
  if (date && cin) {
    if (logDate && logDate !== date) delete timelog[logDate];
    timelog[date] = { in: cin, out: cout || null };
    logDate = date;
  } else if (logDate) {
    delete timelog[logDate];
    logDate = null;
  } else {
    return;
  }
  writeTimelog();
}

function to24(h, m, ap) {
  let hour = Number(h) % 12;
  if (ap === "pm") hour += 12;
  return `${pad2(hour)}:${m}`;
}

// One-time import of hours from reports you've already sent, so the
// weekly total isn't empty on day one.
function backfillTimelogFromHistory() {
  if (localStorage.getItem(TIMELOG_BACKFILL_KEY)) return;
  const added = new Set();
  readHistory().forEach((entry) => {
    const text = entry.report_text || "";
    const dm = text.match(/^Date:\s*(\d{2})\/(\d{2})\/(\d{2})/m);
    const tm = text.match(/^Duration:\s*(\d{1,2}):(\d{2})(am|pm)-(\d{1,2}):(\d{2})(am|pm)/m);
    if (!dm || !tm) return;
    const key = `20${dm[3]}-${dm[1]}-${dm[2]}`;
    if (timelog[key] && !added.has(key)) return;
    timelog[key] = { in: to24(tm[1], tm[2], tm[3]), out: to24(tm[4], tm[5], tm[6]) };
    added.add(key);
  });
  writeTimelog();
  localStorage.setItem(TIMELOG_BACKFILL_KEY, "1");
}

function parseLocal(dateStr, hhmm) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const [h, mi] = hhmm.split(":").map(Number);
  return new Date(y, m - 1, d, h, mi, 0, 0);
}

function nowHHMM() {
  const d = new Date();
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function fmtDuration(ms) {
  const mins = Math.max(0, Math.floor(ms / 60000));
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

function fmtHoursNum(h) {
  return Number.isInteger(h) ? String(h) : h.toFixed(2).replace(/\.?0+$/, "");
}

function fmtMoney(n) {
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtClock(d, now) {
  const t = to12Hour(`${pad2(d.getHours())}:${pad2(d.getMinutes())}`);
  const dayDiff = Math.round(
    (new Date(d.getFullYear(), d.getMonth(), d.getDate()) -
      new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000
  );
  if (dayDiff === 0) return t;
  if (dayDiff === 1) return `${t} tomorrow`;
  return `${t} ${d.toLocaleDateString(undefined, { weekday: "short" })}`;
}

function timeToMinutes(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

// Scheduled length (hours) for one day's schedule entry. Start + end gives the exact
// length (overnight is fine); start alone falls back to the default shift length.
function entryHours(entry) {
  if (!entry || !entry.start) return 0;
  if (!entry.end) return currentSettings.shift.default_hours;
  let mins = timeToMinutes(entry.end) - timeToMinutes(entry.start);
  if (mins < 0) mins += 24 * 60;
  return mins / 60;
}

// Planned length of a shift starting on the given day: that weekday's scheduled
// hours if set, otherwise the default shift length.
function shiftHoursFor(date) {
  const scheduled = entryHours(currentSettings.shift.schedule[date.getDay()]);
  return scheduled > 0 ? scheduled : currentSettings.shift.default_hours;
}

// The next scheduled shift that hasn't been worked yet. With includeStarted, a shift
// that's already underway (you haven't clocked in) counts as well.
function nextScheduledShift(now, includeStarted) {
  const sched = currentSettings.shift.schedule;
  for (let off = -1; off <= 7; off++) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + off);
    const entry = sched[day.getDay()];
    const hours = entryHours(entry);
    if (!entry.start || hours <= 0) continue;
    const [h, m] = entry.start.split(":").map(Number);
    const start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m);
    const end = new Date(start.getTime() + hours * 3600000);
    if (end <= now) continue;
    if (start <= now && !includeStarted) continue;
    if (timelog[localISO(start)]) continue; // already worked (or working) that day's shift
    return { start, end, hours, started: start <= now };
  }
  return null;
}

function getClockState(now) {
  const date = dateEl.value;
  const cin = clockinEl.value;
  const cout = clockoutEl.value;
  if (!date || !cin) return { state: "idle" };
  const start = parseLocal(date, cin);
  if (cout) {
    const end = parseLocal(date, cout);
    if (end < start) end.setDate(end.getDate() + 1);
    return { state: "done", start, end };
  }
  if (now - start > STALE_MS) return { state: "stale", start };
  return { state: "active", start };
}

function weekRange(now) {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  start.setDate(start.getDate() - ((now.getDay() - currentSettings.shift.week_start + 7) % 7));
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return { start, end };
}

function weekWorkedMs(now, st) {
  const { start: weekStart, end: weekEnd } = weekRange(now);
  let total = 0;
  Object.entries(timelog).forEach(([key, entry]) => {
    if (!entry || !entry.in || !/^\d{4}-\d{2}-\d{2}$/.test(key)) return;
    const s = parseLocal(key, entry.in);
    if (s < weekStart || s >= weekEnd) return;
    if (entry.out) {
      const e = parseLocal(key, entry.out);
      if (e < s) e.setDate(e.getDate() + 1);
      total += e - s;
    } else if (st.state === "active" && key === dateEl.value) {
      total += Math.max(0, now - s);
    }
  });
  return total;
}

function shiftCompleteText(overMs) {
  return overMs < 60000 ? "Shift complete" : `Shift complete · +${fmtDuration(overMs)}`;
}

function updateTimeline() {
  const now = new Date();
  const st = getClockState(now);
  const shift = currentSettings.shift;
  // A finished shift stays on screen for a while; after that you're effectively "not clocked in".
  const view = st.state === "done" && now - st.end > 12 * 3600000 ? "idle" : st.state;
  const next = view === "active" ? null : nextScheduledShift(now, view === "idle");
  const noShiftHint = "Set a shift length in Settings";

  let shiftMs =
    view === "idle"
      ? (next ? next.hours : shiftHoursFor(now)) * 3600000
      : shiftHoursFor(st.start) * 3600000;

  let status = "Not clocked in";
  let big = fmtDuration(0);
  let of = "";
  let remaining = "";
  let off = "";
  let pct = 0;
  let over = false;

  if (view === "active") {
    status = "On the clock";
    const elapsed = Math.max(0, now - st.start);
    big = fmtDuration(elapsed);
    if (shiftMs > 0) {
      of = `of ${fmtDuration(shiftMs)}`;
      pct = (elapsed / shiftMs) * 100;
      if (elapsed < shiftMs) {
        remaining = `${fmtDuration(shiftMs - elapsed)} left`;
      } else {
        over = true;
        remaining = shiftCompleteText(elapsed - shiftMs);
      }
      off = `Off at ${fmtClock(new Date(st.start.getTime() + shiftMs), now)}`;
    } else {
      remaining = noShiftHint;
    }
  } else if (view === "done") {
    status = "Clocked out";
    const elapsed = st.end - st.start;
    big = fmtDuration(elapsed);
    if (shiftMs > 0) {
      of = `of ${fmtDuration(shiftMs)}`;
      pct = (elapsed / shiftMs) * 100;
      if (elapsed >= shiftMs) {
        over = true;
        remaining = shiftCompleteText(elapsed - shiftMs);
      } else {
        remaining = `${fmtDuration(shiftMs - elapsed)} short of shift`;
      }
    }
    off = `${to12Hour(clockinEl.value)} – ${to12Hour(clockoutEl.value)}`;
  } else if (view === "stale") {
    status = "Missed a clock out?";
    big = "--";
    remaining = `Clocked in ${st.start.toLocaleDateString(undefined, { weekday: "short" })} ${to12Hour(clockinEl.value)}`;
  } else if (next && next.started) {
    status = "Running late?";
    big = fmtDuration(now - next.start);
    of = "since shift start";
    off = `Scheduled ${fmtClock(next.start, now)} – ${fmtClock(next.end, now)}`;
    remaining = `${fmtDuration(shiftMs)} shift`;
  } else if (next) {
    big = fmtDuration(next.start - now);
    of = "until work";
    off = `Starts ${fmtClock(next.start, now)}`;
    remaining = `${fmtDuration(shiftMs)} shift`;
  } else {
    remaining = shiftMs > 0 ? `${fmtDuration(shiftMs)} shift today` : noShiftHint;
  }

  tlStatus.textContent = status;
  tlStatus.classList.toggle("live", view === "active");
  tlOff.textContent = off;
  tlElapsed.textContent = big;
  tlOf.textContent = of;
  tlRemaining.textContent = remaining;
  tlBarFill.style.width = `${Math.min(100, Math.max(0, pct))}%`;
  tlBarFill.classList.toggle("over", over);
  tlBar.classList.toggle("hidden", view === "idle" || shiftMs <= 0);
  tlNext.textContent =
    next && (view === "done" || view === "stale")
      ? `Next shift: ${fmtClock(next.start, now)} · in ${fmtDuration(next.start - now)}`
      : "";

  clockBtn.textContent = st.state === "active" ? "Clock Out" : "Clock In";
  clockBtn.classList.toggle("clock-out", st.state === "active");

  // Weekly totals
  const worked = weekWorkedMs(now, st);
  const scheduledHours = shift.schedule.reduce((sum, e) => sum + entryHours(e), 0);
  tlWeekHours.textContent =
    fmtDuration(worked) + (scheduledHours > 0 ? ` of ${fmtHoursNum(scheduledHours)}h scheduled` : "");
  tlWeekBar.classList.toggle("hidden", scheduledHours <= 0);
  tlWeekFill.style.width = `${Math.min(100, (worked / (scheduledHours * 3600000 || 1)) * 100)}%`;

  if (shift.hourly_rate > 0) {
    const gross = (worked / 3600000) * shift.hourly_rate;
    const net = gross * (1 - shift.tax_percent / 100);
    tlWeekMoney.textContent =
      shift.tax_percent > 0
        ? `${fmtMoney(net)} est. take-home · ${fmtMoney(gross)} gross`
        : `${fmtMoney(gross)} earned (est.)`;
    tlWeekMoney.classList.remove("muted");
  } else {
    tlWeekMoney.textContent = "Add your hourly pay in Settings to see earnings";
    tlWeekMoney.classList.add("muted");
  }
}

clockBtn.addEventListener("click", () => {
  const st = getClockState(new Date());
  if (st.state === "active") {
    clockoutEl.value = nowHHMM();
  } else {
    const replacingToday = st.state === "done" && dateEl.value === todayISO();
    if (replacingToday && !confirm("Start a new shift? This replaces today's clock in and out times.")) return;
    if (!replacingToday) logDate = null; // keep the earlier day's record
    dateEl.value = todayISO();
    clockinEl.value = nowHHMM();
    clockoutEl.value = "";
  }
  updatePreview();
  syncTimelog();
  updateTimeline();
});

[dateEl, clockinEl, clockoutEl].forEach((el) => {
  el.addEventListener("input", () => {
    syncTimelog();
    updateTimeline();
  });
});

/* Shift & Pay settings screen */

let scheduleDraft = normalizeShift().schedule;

DAY_NAMES.forEach((name, i) => {
  const opt = document.createElement("option");
  opt.value = String(i);
  opt.textContent = name;
  shiftWeekStart.appendChild(opt);
});

function renderScheduleInputs() {
  const weekStart = Number(shiftWeekStart.value);
  shiftScheduleEl.innerHTML = "";
  for (let i = 0; i < 7; i++) {
    const dow = (weekStart + i) % 7;
    const row = document.createElement("div");
    row.className = "schedule-row";

    const label = document.createElement("label");
    label.textContent = DAY_NAMES[dow];

    const makeTime = (field, aria) => {
      const input = document.createElement("input");
      input.type = "time";
      input.value = scheduleDraft[dow][field] || "";
      input.setAttribute("aria-label", `${DAY_NAMES[dow]} ${aria}`);
      input.addEventListener("input", () => {
        scheduleDraft[dow][field] = input.value;
      });
      return input;
    };
    const startInput = makeTime("start", "start time");
    const endInput = makeTime("end", "end time");

    const to = document.createElement("span");
    to.className = "schedule-to";
    to.textContent = "to";

    const clear = document.createElement("button");
    clear.className = "icon-btn";
    clear.setAttribute("aria-label", `Clear ${DAY_NAMES[dow]}`);
    clear.textContent = "✕";
    clear.addEventListener("click", () => {
      scheduleDraft[dow] = { start: "", end: "" };
      startInput.value = "";
      endInput.value = "";
    });

    row.append(label, startInput, to, endInput, clear);
    shiftScheduleEl.appendChild(row);
  }
}

shiftWeekStart.addEventListener("change", renderScheduleInputs);

shiftSettingsBtn.addEventListener("click", () => {
  const s = currentSettings.shift;
  shiftDefaultHours.value = s.default_hours || "";
  shiftRate.value = s.hourly_rate || "";
  shiftTax.value = s.tax_percent || "";
  shiftWeekStart.value = String(s.week_start);
  scheduleDraft = s.schedule.map((e) => ({ ...e }));
  renderScheduleInputs();
  shiftModal.classList.remove("hidden");
});

shiftCancel.addEventListener("click", () => shiftModal.classList.add("hidden"));

shiftSave.addEventListener("click", () => {
  currentSettings.shift = normalizeShift({
    default_hours: shiftDefaultHours.value,
    hourly_rate: shiftRate.value,
    tax_percent: shiftTax.value,
    week_start: shiftWeekStart.value,
    schedule: scheduleDraft,
  });
  writeSettings(currentSettings);
  shiftModal.classList.add("hidden");
  updateTimeline();
});

/* ---------- Tabs & startup ---------- */

const tabBtns = document.querySelectorAll(".tab-btn");
tabBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    tabBtns.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    document.querySelectorAll(".screen").forEach((s) => s.classList.add("hidden"));
    document.getElementById(btn.dataset.screen).classList.remove("hidden");
  });
});

enableDragReorder(categoriesEl, ".category", updatePreview);
loadSettings().then(() => {
  restoreReportDraft();
  allChecklistItems().filter((item) => item.done).forEach(applyChecklistLink);
  backfillTimelogFromHistory();
  if (dateEl.value && clockinEl.value) syncTimelog();
  updateTimeline();
  setInterval(updateTimeline, 1000);
});