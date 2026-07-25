// Danube Vessel Log
// File: docs/js/ais_live.js
// Version: 0.12.1
// Updated: 2026-07-25

"use strict";

document.addEventListener("DOMContentLoaded", () => {
  const byId = id => document.getElementById(id);
  const ref = window.AisReference;
  const decoder = window.AisDecoder;
  const workerUrl = String(window.VesselConfig?.workerUrl ?? "").trim().replace(/\/+$/, "");

  const elements = {
    apiKey: byId("apiKey"), testArea: byId("testArea"), messageFilter: byId("messageFilter"), durationSeconds: byId("durationSeconds"),
    startButton: byId("startButton"), stopButton: byId("stopButton"), clearButton: byId("clearButton"),
    connectionStatus: byId("connectionStatus"), messageCount: byId("messageCount"), messagesPerMinute: byId("messagesPerMinute"),
    vesselCount: byId("vesselCount"), senderCount: byId("senderCount"), remainingTime: byId("remainingTime"),
    statusMessage: byId("statusMessage"), boundingBoxText: byId("boundingBoxText"),
    messageTypeEmpty: byId("messageTypeEmpty"), messageTypeWrapper: byId("messageTypeWrapper"), messageTypeRows: byId("messageTypeRows"),
    emptyState: byId("emptyState"), tableWrapper: byId("tableWrapper"), vesselRows: byId("vesselRows"), diagnosticLog: byId("diagnosticLog"),
    inspectorCard: byId("inspectorCard"), inspectorTitle: byId("inspectorTitle"), inspectorSubtitle: byId("inspectorSubtitle"),
    closeInspectorButton: byId("closeInspectorButton"), generalFields: byId("generalFields"), positionFields: byId("positionFields"),
    vesselFields: byId("vesselFields"), navigationFields: byId("navigationFields"), diagnosticFields: byId("diagnosticFields"),
    rawKeyList: byId("rawKeyList"), rawJson: byId("rawJson"), copyRawButton: byId("copyRawButton"),
    downloadRawButton: byId("downloadRawButton"), copyStatus: byId("copyStatus")
  };

  let socket = null;
  let receivedMessageCount = 0;
  let sessionStartedAt = null;
  let sessionEndsAt = null;
  let countdownTimer = null;
  let selectedSenderKey = "";

  const senders = new Map();
  const messageTypeCounts = new Map();
  const diagnostics = [];
  const senderClassPriority = { other: 0, vessel: 10, base_station: 10, aid_to_navigation: 10, sar_aircraft: 10 };

  const websocketUrl = url => url.replace(/^https:/i, "wss:").replace(/^http:/i, "ws:");
  const finite = value => Number.isFinite(Number(value)) ? Number(value) : null;
  const visible = value => value !== null && value !== undefined && value !== "";

  function setStatus(status, message = "") {
    const labels = {
      disconnected: "Nicht verbunden", connecting_worker: "Worker wird verbunden …", worker_connected: "Worker verbunden",
      connecting_aisstream: "AISStream wird verbunden …", subscribed: "Empfang aktiv", stopped: "Beendet",
      aisstream_closed: "AISStream getrennt", error: "Fehler"
    };
    elements.connectionStatus.textContent = labels[status] ?? status;
    elements.statusMessage.textContent = message;
    elements.statusMessage.className = status === "error" ? "status-message error" : status === "subscribed" ? "status-message success" : "status-message";
  }

  function addDiagnostic(message) {
    const time = new Intl.DateTimeFormat("de-AT", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date());
    diagnostics.unshift(`${time} · ${message}`);
    diagnostics.splice(30);
    elements.diagnosticLog.textContent = diagnostics.join("\n") || "Noch keine Ereignisse.";
  }

  function formatDateTime(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "–";
    return new Intl.DateTimeFormat("de-AT", { dateStyle: "short", timeStyle: "medium" }).format(date);
  }

  function formatAisTime(value) {
    if (!value) return "–";
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return formatDateTime(date);
    return String(value);
  }

  function formatNumber(value, digits = 1) {
    const number = finite(value);
    if (number === null) return "–";
    return new Intl.NumberFormat("de-AT", { maximumFractionDigits: digits }).format(number);
  }

  function hasPosition(position) {
    return Boolean(position && Number.isFinite(position.latitude) && Number.isFinite(position.longitude));
  }

  function formatPosition(position, digits = 6) {
    return hasPosition(position) ? `${position.latitude.toFixed(digits)}, ${position.longitude.toFixed(digits)}` : "–";
  }

  function mapUrl(position) {
    if (!hasPosition(position)) return "";
    return `https://www.openstreetmap.org/?mlat=${encodeURIComponent(position.latitude)}&mlon=${encodeURIComponent(position.longitude)}#map=15/${encodeURIComponent(position.latitude)}/${encodeURIComponent(position.longitude)}`;
  }

  function mergeSender(previous = {}, update = {}) {
    const next = { ...previous };
    for (const [key, value] of Object.entries(update)) {
      if (!visible(value)) continue;
      if (["message_position", "metadata_position"].includes(key) && !hasPosition(value)) continue;
      next[key] = value;
    }
    const previousClass = previous.sender_class ?? "other";
    const updateClass = update.sender_class ?? "other";
    if ((senderClassPriority[previousClass] ?? 0) > (senderClassPriority[updateClass] ?? 0)) next.sender_class = previousClass;
    const messageTypes = new Set(previous.message_types ?? []);
    if (update.message_type) messageTypes.add(update.message_type);
    next.message_types = [...messageTypes].sort();
    const history = [...(previous.message_history ?? [])];
    history.unshift({ message_type: update.message_type, received_at: update.received_at, raw_payload: update.raw_payload });
    next.message_history = history.slice(0, 25);
    return next;
  }

  function buildSenderKey(sender) {
    if (sender.mmsi) return sender.mmsi;
    const position = sender.message_position ?? sender.metadata_position;
    if (hasPosition(position)) return [sender.sender_class ?? "other", sender.message_type ?? "unknown", position.latitude.toFixed(5), position.longitude.toFixed(5)].join("|");
    return `${sender.sender_class ?? "other"}|${sender.message_type ?? "unknown"}|${receivedMessageCount}`;
  }

  function createSenderBadge(senderClass) {
    const badge = document.createElement("span");
    badge.className = `sender-badge sender-${senderClass || "other"}`;
    badge.textContent = ref.senderClasses[senderClass] ?? ref.senderClasses.other;
    return badge;
  }

  function appendPosition(cell, position) {
    const url = mapUrl(position);
    if (!url) { cell.textContent = "–"; return; }
    const link = document.createElement("a");
    link.href = url; link.target = "_blank"; link.rel = "noopener noreferrer"; link.textContent = formatPosition(position, 5);
    cell.append(link);
  }

  function renderCounts(items) {
    elements.senderCount.textContent = String(items.length);
    elements.vesselCount.textContent = String(items.filter(sender => sender.sender_class === "vessel").length);
    elements.messageCount.textContent = String(receivedMessageCount);
    const elapsedMinutes = sessionStartedAt ? Math.max((Date.now() - sessionStartedAt) / 60000, 1 / 60) : 0;
    elements.messagesPerMinute.textContent = elapsedMinutes ? formatNumber(receivedMessageCount / elapsedMinutes, 1) : "0";
  }

  function renderMessageTypes() {
    const items = [...messageTypeCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    elements.messageTypeRows.replaceChildren();
    elements.messageTypeEmpty.classList.toggle("hidden", items.length > 0);
    elements.messageTypeWrapper.classList.toggle("hidden", items.length === 0);
    for (const [type, count] of items) {
      const info = ref.messageTypes[type] ?? ref.messageTypes.UnknownMessage;
      const row = document.createElement("tr");
      for (const text of [type || "UnknownMessage", info.title, info.ids, String(count)]) {
        const cell = document.createElement("td"); cell.textContent = text; row.append(cell);
      }
      elements.messageTypeRows.append(row);
    }
  }

  function renderSenders() {
    const items = [...senders.entries()].map(([key, sender]) => ({ key, sender })).sort((a, b) => String(b.sender.received_at ?? "").localeCompare(String(a.sender.received_at ?? "")));
    renderCounts(items.map(item => item.sender));
    elements.vesselRows.replaceChildren();
    elements.emptyState.classList.toggle("hidden", items.length > 0);
    elements.tableWrapper.classList.toggle("hidden", items.length === 0);

    for (const { key, sender } of items) {
      const row = document.createElement("tr");
      row.className = `sender-row${selectedSenderKey === key ? " selected" : ""}`;
      row.dataset.senderKey = key;
      const category = document.createElement("td"); category.append(createSenderBadge(sender.sender_class));
      const nameCell = document.createElement("td");
      const name = document.createElement("strong"); name.textContent = sender.name || "Unbekannt"; nameCell.append(name);
      if (sender.imo || sender.call_sign) { const sub = document.createElement("span"); sub.className = "table-subline"; sub.textContent = [sender.imo ? `IMO ${sender.imo}` : "", sender.call_sign ? `Rufzeichen ${sender.call_sign}` : ""].filter(Boolean).join(" · "); nameCell.append(sub); }
      const mmsi = document.createElement("td"); mmsi.textContent = sender.mmsi || "–";
      const time = document.createElement("td"); time.textContent = formatDateTime(sender.received_at);
      const speed = document.createElement("td"); speed.textContent = visible(sender.sog) ? `${formatNumber(sender.sog)} kn` : "–";
      const course = document.createElement("td"); course.textContent = visible(sender.cog) ? `${formatNumber(sender.cog)}°` : "–";
      const heading = document.createElement("td"); heading.textContent = visible(sender.true_heading) ? `${formatNumber(sender.true_heading, 0)}°` : "–";
      const pos = document.createElement("td"); appendPosition(pos, sender.message_position);
      const types = document.createElement("td"); types.textContent = (sender.message_types ?? []).join(", ") || "–";
      const action = document.createElement("td");
      const button = document.createElement("button"); button.type = "button"; button.className = "secondary-button"; button.dataset.inspectKey = key; button.textContent = selectedSenderKey === key ? "Geöffnet" : "Öffnen"; action.append(button);
      row.append(category, nameCell, mmsi, time, speed, course, heading, pos, types, action);
      elements.vesselRows.append(row);
    }
  }

  function field(label, value, options = {}) {
    const wrapper = document.createElement("div");
    const dt = document.createElement("dt"); dt.textContent = label;
    const dd = document.createElement("dd");
    if (options.link && value !== "–") { const a = document.createElement("a"); a.href = options.link; a.target = "_blank"; a.rel = "noopener noreferrer"; a.textContent = value; dd.append(a); }
    else { dd.textContent = value; }
    if (options.className) dd.className = options.className;
    wrapper.append(dt, dd); return wrapper;
  }

  function boolText(value) {
    if (value === true) return { text: "Ja", className: "boolean-yes" };
    if (value === false) return { text: "Nein", className: "boolean-no" };
    return { text: "–", className: "" };
  }

  function setFields(container, rows) {
    container.replaceChildren(...rows.map(row => field(row.label, row.value, row.options)));
  }

  function openInspector(key, scroll = true) {
    const sender = senders.get(key);
    if (!sender) return;
    selectedSenderKey = key;
    const data = decoder.decode(sender);
    const senderName = data.vessel.name || "Unbekannter Sender";
    elements.inspectorTitle.textContent = senderName;
    elements.inspectorSubtitle.textContent = `${data.general.senderClassLabel} · MMSI ${data.general.mmsi || "–"} · Meldungstypen: ${data.message.observedTypes.join(", ") || data.message.type}`;

    setFields(elements.generalFields, [
      { label: "Letzte Meldung", value: data.message.type },
      { label: "Bedeutung der letzten Meldung", value: data.message.title },
      { label: "Beobachtete Meldungstypen", value: data.message.observedTypes.join(", ") || data.message.type },
      { label: "AIS-Nachrichten-ID", value: data.message.messageId ?? data.message.ids },
      { label: "Meldungsgruppe", value: data.message.group },
      { label: "Senderklasse", value: data.general.senderClassLabel },
      { label: "MMSI", value: data.general.mmsi || "–" },
      { label: "MID / Staat", value: data.general.mid ? `${data.general.mid} · ${data.general.country}` : "–" },
      { label: "Empfangen", value: formatDateTime(data.general.receivedAt) },
      { label: "AIS-Zeit", value: formatAisTime(data.general.aisTime) }
    ]);

    setFields(elements.positionFields, [
      { label: "Meldungsposition", value: formatPosition(data.position.message), options: { link: mapUrl(data.position.message) } },
      { label: "Metadatenposition", value: formatPosition(data.position.metadata), options: { link: mapUrl(data.position.metadata) } },
      { label: "Geschwindigkeit", value: data.position.sog === null ? "–" : `${formatNumber(data.position.sog)} kn` },
      { label: "Kurs über Grund", value: data.position.cog === null ? "–" : `${formatNumber(data.position.cog)}°` },
      { label: "Rechtweisender Kurs", value: data.position.heading === null ? "Unbekannt" : `${formatNumber(data.position.heading, 0)}°` },
      { label: "Drehrate (Rohwert)", value: data.position.rateOfTurn === null ? "Nicht verfügbar" : formatNumber(data.position.rateOfTurn, 0) },
      { label: "UTC-Sekunde", value: data.position.timestampSecond ?? "–" },
      { label: "Positionsgenauigkeit", value: data.position.accuracy === true ? "Hoch (AIS-Flag gesetzt)" : data.position.accuracy === false ? "Niedrig (AIS-Flag nicht gesetzt)" : "–" }
    ]);

    setFields(elements.vesselFields, [
      { label: "Name", value: data.vessel.name || "–" },
      { label: "IMO", value: data.vessel.imo || "–" },
      { label: "Rufzeichen", value: data.vessel.callSign || "–" },
      { label: "Schiffstyp", value: data.vessel.shipType },
      { label: "AIS-Typcode", value: data.vessel.shipTypeCode ?? "–" },
      { label: "Länge", value: data.vessel.length === null ? "–" : `${formatNumber(data.vessel.length, 1)} m` },
      { label: "Breite", value: data.vessel.width === null ? "–" : `${formatNumber(data.vessel.width, 1)} m` },
      { label: "Tiefgang", value: data.vessel.draught === null ? "–" : `${formatNumber(data.vessel.draught, 1)} m` },
      { label: "Ziel", value: data.vessel.destination || "–" },
      { label: "ETA", value: data.vessel.eta || "–" }
    ]);

    setFields(elements.navigationFields, [
      { label: "Navigationsstatus", value: data.navigation.status },
      { label: "Statuscode", value: data.navigation.statusCode ?? "–" },
      { label: "Besonderes Manöver", value: data.navigation.special },
      { label: "Manövercode", value: data.navigation.specialCode ?? "–" }
    ]);

    const valid = boolText(data.diagnostics.valid), raim = boolText(data.diagnostics.raim), longRange = boolText(data.diagnostics.longRangeEnable);
    setFields(elements.diagnosticFields, [
      { label: "Valid", value: valid.text, options: { className: valid.className } },
      { label: "RAIM", value: raim.text, options: { className: raim.className } },
      { label: "EPFD / Fix-Typ", value: data.diagnostics.fixType },
      { label: "EPFD-Code", value: data.diagnostics.fixTypeCode ?? "–" },
      { label: "Repeat Indicator", value: data.general.repeatIndicator ?? "–" },
      { label: "UserID", value: data.general.userId ?? "–" },
      { label: "Communication State", value: data.diagnostics.communicationState ?? "–" },
      { label: "Long Range Enable", value: longRange.text, options: { className: longRange.className } },
      { label: "Meldungen dieses Senders", value: String(sender.message_history?.length ?? 1) },
      { label: "Beobachtete Meldungstypen", value: (sender.message_types ?? []).join(", ") || "–" }
    ]);

    elements.rawKeyList.replaceChildren(...data.diagnostics.rawKeys.map(keyName => { const chip = document.createElement("span"); chip.className = "chip"; chip.textContent = keyName; return chip; }));
    elements.rawJson.textContent = JSON.stringify({ normalized: data, raw_payload: sender.raw_payload, recent_message_history: sender.message_history ?? [] }, null, 2);
    elements.inspectorCard.classList.remove("hidden");
    elements.copyStatus.textContent = "";
    renderSenders();
    if (scroll) elements.inspectorCard.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function closeInspector() {
    selectedSenderKey = "";
    elements.inspectorCard.classList.add("hidden");
    renderSenders();
  }

  function handleAisMessage(sender) {
    if (!sessionStartedAt) sessionStartedAt = Date.now();
    receivedMessageCount += 1;
    const type = sender.message_type || "UnknownMessage";
    messageTypeCounts.set(type, (messageTypeCounts.get(type) ?? 0) + 1);
    const key = buildSenderKey(sender);
    senders.set(key, mergeSender(senders.get(key), sender));
    renderMessageTypes(); renderSenders();
    if (selectedSenderKey === key) openInspector(key, false);
  }

  function stopCountdown() {
    if (countdownTimer) clearInterval(countdownTimer);
    countdownTimer = null; sessionEndsAt = null; elements.remainingTime.textContent = "–";
  }

  function startCountdown(seconds) {
    stopCountdown(); sessionEndsAt = Date.now() + seconds * 1000;
    const update = () => {
      const remaining = Math.max(0, Math.ceil((sessionEndsAt - Date.now()) / 1000));
      elements.remainingTime.textContent = `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")}`;
      renderCounts([...senders.values()]);
      if (remaining <= 0) stopCountdown();
    };
    update(); countdownTimer = setInterval(update, 1000);
  }

  function closeSocket() {
    stopCountdown();
    if (socket && socket.readyState < WebSocket.CLOSING) socket.close(1000, "Browser beendet den AIS-Test");
    socket = null; elements.startButton.disabled = false; elements.stopButton.disabled = true;
  }

  function handleWorkerMessage(event) {
    let message;
    try { message = JSON.parse(String(event.data ?? "")); }
    catch { addDiagnostic("Nicht lesbare Worker-Nachricht empfangen."); return; }
    if (message.type === "ais_message") { handleAisMessage(message.vessel ?? {}); return; }
    if (message.type === "status") {
      setStatus(message.status, message.message ?? ""); addDiagnostic(message.message ?? message.status);
      if (message.status === "subscribed") { sessionStartedAt = Date.now(); startCountdown(Number(message.duration_seconds) || 300); elements.boundingBoxText.textContent = JSON.stringify(message.bounding_boxes ?? []); }
      if (["stopped", "aisstream_closed"].includes(message.status)) closeSocket();
      return;
    }
    if (message.type === "error") { setStatus("error", message.error ?? "Unbekannter Fehler."); addDiagnostic(message.error ?? "Unbekannter Fehler."); closeSocket(); return; }
    if (message.type === "warning") addDiagnostic(message.warning ?? "Warnung ohne Text.");
  }

  function startStream() {
    if (!workerUrl) { setStatus("error", "In docs/js/config.js ist keine Worker-URL konfiguriert."); return; }
    if (!elements.apiKey.value.trim()) { setStatus("error", "Bitte den Wert des Cloudflare-Secrets API_KEY eingeben."); elements.apiKey.focus(); return; }
    closeSocket(); setStatus("connecting_worker", "WebSocket zum Worker wird aufgebaut …");
    addDiagnostic(`Verbindung wird gestartet · Bereich: ${elements.testArea.options[elements.testArea.selectedIndex].text} · Filter: ${elements.messageFilter.options[elements.messageFilter.selectedIndex].text}.`);
    elements.startButton.disabled = true; elements.stopButton.disabled = false;
    socket = new WebSocket(`${websocketUrl(workerUrl)}/ais-live`);
    socket.binaryType = "arraybuffer";
    socket.addEventListener("open", () => socket.send(JSON.stringify({ action: "start", api_key: elements.apiKey.value.trim(), area: elements.testArea.value, message_filter: elements.messageFilter.value, duration_seconds: Number(elements.durationSeconds.value) || 300 })));
    socket.addEventListener("message", async event => {
      if (event.data instanceof ArrayBuffer) handleWorkerMessage({ data: new TextDecoder().decode(event.data) });
      else if (event.data instanceof Blob) handleWorkerMessage({ data: await event.data.text() });
      else handleWorkerMessage(event);
    });
    socket.addEventListener("error", () => { setStatus("error", "WebSocket-Verbindung zum Worker fehlgeschlagen."); addDiagnostic("WebSocket-Fehler."); });
    socket.addEventListener("close", event => { if (event.code !== 1000) addDiagnostic(`WebSocket geschlossen · Code ${event.code}.`); closeSocket(); });
  }

  function clearSession() {
    senders.clear(); messageTypeCounts.clear(); diagnostics.length = 0; receivedMessageCount = 0; sessionStartedAt = null;
    elements.diagnosticLog.textContent = "Noch keine Ereignisse."; elements.boundingBoxText.textContent = "wird beim Start geladen";
    closeInspector(); renderMessageTypes(); renderSenders(); setStatus("disconnected", "");
  }

  elements.startButton.addEventListener("click", startStream);
  elements.stopButton.addEventListener("click", () => { if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ action: "stop" })); closeSocket(); setStatus("stopped", "AIS-Empfang wurde manuell beendet."); addDiagnostic("AIS-Empfang manuell beendet."); });
  elements.clearButton.addEventListener("click", clearSession);
  elements.closeInspectorButton.addEventListener("click", closeInspector);
  elements.vesselRows.addEventListener("click", event => { const target = event.target.closest("[data-inspect-key], [data-sender-key]"); const key = target?.dataset.inspectKey ?? target?.dataset.senderKey; if (key) openInspector(key); });

  document.querySelectorAll(".inspector-tab").forEach(tab => tab.addEventListener("click", () => {
    document.querySelectorAll(".inspector-tab").forEach(item => item.classList.toggle("active", item === tab));
    document.querySelectorAll(".inspector-panel").forEach(panel => panel.classList.toggle("active", panel.dataset.panel === tab.dataset.tab));
  }));

  elements.copyRawButton.addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(elements.rawJson.textContent); elements.copyStatus.textContent = "JSON wurde kopiert."; }
    catch { elements.copyStatus.textContent = "Kopieren nicht möglich."; }
  });

  elements.downloadRawButton.addEventListener("click", () => {
    if (!selectedSenderKey) return;
    const sender = senders.get(selectedSenderKey);
    const safeMmsi = String(sender?.mmsi || "unknown").replace(/[^0-9A-Za-z_-]/g, "_");
    const blob = new Blob([elements.rawJson.textContent], { type: "application/json;charset=utf-8" });
    const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `ais_${safeMmsi}_${Date.now()}.json`; link.click(); URL.revokeObjectURL(link.href);
  });

  renderMessageTypes(); renderSenders(); setStatus("disconnected");
});
