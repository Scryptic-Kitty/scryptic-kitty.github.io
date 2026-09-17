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

const settingsModal = document.getElementById("settingsModal");
const settingsBtn = document.getElementById("settingsBtn");
const settingsCancel = document.getElementById("settingsCancel");
const settingsSave = document.getElementById("settingsSave");
const settingsName = document.getElementById("settingsName");
const settingsLocation = document.getElementById("settingsLocation");

const historyModal = document.getElementById("historyModal");
const historyBtn = document.getElementById("historyBtn");
const historyClose = document.getElementById("historyClose");
const historyList = document.getElementById("historyList");

let currentSettings = { name: "", location: "", recent_categories: [] };

const SETTINGS_KEY = "sitrep_settings";
const HISTORY_KEY = "sitrep_history";
const REPORT_DRAFT_KEY = "sitrep_report_draft";

function readSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? JSON.parse(raw) : { name: "", location: "", recent_categories: [] };
  } catch (e) {
    return { name: "", location: "", recent_categories: [] };
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

function todayISO() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
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

function addCategory(title = "", opts = {}) {
  const { addEmptyStep = true } = opts;
  const node = catTemplate.content.cloneNode(true);
  const catDiv = node.querySelector(".category");
  const titleInput = node.querySelector(".cat-title");
  titleInput.value = title;
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
  addCategory();
  checklistData.forEach((item) => {
    if (item.done && item.linkCategory && item.linkStep) {
      item.done = false;
    }
  });
  writeChecklist();
  renderChecklist();
  updatePreview();
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
  });
  currentSettings.recent_categories = recents.slice(0, 12);
  writeSettings(currentSettings);
  renderRecentChips();

  const encoded = encodeURIComponent(text);
  window.location.href = `https://wa.me/?text=${encoded}`;
});

[dateEl, nameEl, locationEl, clockinEl, clockoutEl].forEach((el) => {
  el.addEventListener("input", updatePreview);
});

const checklistItemsEl = document.getElementById("checklistItems");
const checklistItemTemplate = document.getElementById("checklistItemTemplate");
const checklistEditBtn = document.getElementById("checklistEditBtn");
const checklistClearBtn = document.getElementById("checklistClearBtn");
const addChecklistItemBtn = document.getElementById("addChecklistItemBtn");

const CHECKLIST_KEY = "sitrep_checklist";
let checklistData = [];
let checklistEditMode = false;

function readChecklist() {
  try {
    const raw = localStorage.getItem(CHECKLIST_KEY);
    const data = raw ? JSON.parse(raw) : [];
    return data.map((item) => ({ linkCategory: "", linkStep: "", ...item }));
  } catch (e) {
    return [];
  }
}

function writeChecklist() {
  localStorage.setItem(CHECKLIST_KEY, JSON.stringify(checklistData));
}

function createChecklistItemEl(item) {
  const node = checklistItemTemplate.content.cloneNode(true);
  const row = node.querySelector(".checklist-item");
  row.dataset.id = item.id;

  const checkbox = row.querySelector(".check-toggle");
  const textInput = row.querySelector(".checklist-text");
  const removeBtn = row.querySelector(".remove-checklist-item");
  const linkCategoryInput = row.querySelector(".checklist-link-category");
  const linkStepInput = row.querySelector(".checklist-link-step");

  checkbox.checked = item.done;
  textInput.value = item.text;
  row.classList.toggle("done", item.done);
  textInput.readOnly = !checklistEditMode;
  linkCategoryInput.value = item.linkCategory || "";
  linkStepInput.value = item.linkStep || "";

  checkbox.addEventListener("change", () => {
    item.done = checkbox.checked;
    row.classList.toggle("done", item.done);
    writeChecklist();
    if (item.done) {
      applyChecklistLink(item);
    } else {
      removeChecklistLink(item);
    }
  });

  textInput.addEventListener("input", () => {
    item.text = textInput.value;
    writeChecklist();
  });

  linkCategoryInput.addEventListener("input", () => {
    item.linkCategory = linkCategoryInput.value;
    writeChecklist();
    if (item.done) reapplyChecklistLink(item);
  });

    linkStepInput.addEventListener("input", () => {
      item.linkStep = linkStepInput.value;
      writeChecklist();
      if (item.done) reapplyChecklistLink(item);
    });

      removeBtn.addEventListener("click", () => {
        checklistData = checklistData.filter((t) => t.id !== item.id);
        row.remove();
        writeChecklist();
      });

      return row;
}

function renderChecklist() {
  checklistItemsEl.innerHTML = "";
  checklistData.forEach((item) => checklistItemsEl.appendChild(createChecklistItemEl(item)));
}

function syncChecklistOrderFromDOM() {
  const ids = Array.from(checklistItemsEl.querySelectorAll(".checklist-item")).map((el) => el.dataset.id);
  checklistData.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
  writeChecklist();
}

checklistEditBtn.addEventListener("click", () => {
  checklistEditMode = !checklistEditMode;
  checklistEditBtn.textContent = checklistEditMode ? "Done" : "Edit";
  checklistItemsEl.classList.toggle("edit-mode", checklistEditMode);
  addChecklistItemBtn.classList.toggle("hidden", !checklistEditMode);
  checklistItemsEl.querySelectorAll(".checklist-text").forEach((input) => {
    input.readOnly = !checklistEditMode;
  });
});

checklistClearBtn.addEventListener("click", () => {
  if (!checklistData.length) return;
  if (!confirm("Uncheck all checklist items?")) return;
  checklistData.forEach((item) => {
    if (item.done) {
      removeChecklistLink(item);
      item.done = false;
    }
  });
  writeChecklist();
  renderChecklist();
});

addChecklistItemBtn.addEventListener("click", () => {
  const newItem = { id: `t${Date.now()}`, text: "", done: false, linkCategory: "", linkStep: "" };
  checklistData.push(newItem);
  const el = createChecklistItemEl(newItem);
  checklistItemsEl.appendChild(el);
  el.querySelector(".checklist-text").focus();
  writeChecklist();
});

enableDragReorder(checklistItemsEl, ".checklist-item", syncChecklistOrderFromDOM);
checklistData = readChecklist();
renderChecklist();

const notesTextarea = document.getElementById("notesTextarea");
const NOTES_KEY = "sitrep_notes";

function loadNotes() {
  notesTextarea.value = localStorage.getItem(NOTES_KEY) || "";
}

notesTextarea.addEventListener("input", () => {
  localStorage.setItem(NOTES_KEY, notesTextarea.value);
});

loadNotes();

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
  linksData = linksData.filter((l) => l.id !== editingLinkId);
  writeLinks();
  renderLinks();
  linkModal.classList.add("hidden");
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
  checklistData.filter((item) => item.done).forEach(applyChecklistLink);
});
