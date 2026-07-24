// Danube Vessel Log
// File: docs/js/ais_live.js
// Version: 0.11.3
// Updated: 2026-07-24

"use strict";

document.addEventListener("DOMContentLoaded", () => {
  const byId = id => document.getElementById(id);

  const workerUrl = String(window.VesselConfig?.workerUrl ?? "")
    .trim()
    .replace(/\/+$/, "");

  const apiKey = byId("apiKey");
  const testArea = byId("testArea");
  const messageFilter = byId("messageFilter");
  const durationSeconds = byId("durationSeconds");
  const startButton = byId("startButton");
  const stopButton = byId("stopButton");
  const clearButton = byId("clearButton");
  const connectionStatus = byId("connectionStatus");
  const messageCount = byId("messageCount");
  const vesselCount = byId("vesselCount");
  const senderCount = byId("senderCount");
  const remainingTime = byId("remainingTime");
  const statusMessage = byId("statusMessage");
  const boundingBoxText = byId("boundingBoxText");
  const messageTypeEmpty = byId("messageTypeEmpty");
  const messageTypeWrapper = byId("messageTypeWrapper");
  const messageTypeRows = byId("messageTypeRows");
  const emptyState = byId("emptyState");
  const tableWrapper = byId("tableWrapper");
  const vesselRows = byId("vesselRows");
  const diagnosticLog = byId("diagnosticLog");

  let socket = null;
  let receivedMessageCount = 0;
  let sessionEndsAt = null;
  let countdownTimer = null;

  const senders = new Map();
  const messageTypeCounts = new Map();
  const openRawKeys = new Set();
  const diagnostics = [];

  const senderClassLabels = {
    vessel: "Schiff",
    base_station: "Basisstation",
    aid_to_navigation: "Navigationszeichen",
    sar_aircraft: "SAR-Luftfahrzeug",
    other: "Sonstiger Sender"
  };

  const senderClassPriority = {
    other: 0,
    vessel: 10,
    base_station: 10,
    aid_to_navigation: 10,
    sar_aircraft: 10
  };

  function websocketUrl(httpUrl) {
    return httpUrl
      .replace(/^https:/i, "wss:")
      .replace(/^http:/i, "ws:");
  }

  function setStatus(status, message = "") {
    const labels = {
      disconnected: "Nicht verbunden",
      connecting_worker: "Worker wird verbunden …",
      worker_connected: "Worker verbunden",
      connecting_aisstream: "AISStream wird verbunden …",
      subscribed: "Empfang aktiv",
      stopped: "Beendet",
      aisstream_closed: "AISStream getrennt",
      error: "Fehler"
    };

    connectionStatus.textContent = labels[status] ?? status;
    statusMessage.textContent = message;
    statusMessage.className =
      status === "error"
        ? "status-message error"
        : status === "subscribed"
          ? "status-message success"
          : "status-message";
  }

  function addDiagnostic(message) {
    const time = new Intl.DateTimeFormat("de-AT", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    }).format(new Date());

    diagnostics.unshift(`${time} · ${message}`);
    diagnostics.splice(20);
    diagnosticLog.textContent = diagnostics.join("\n");
  }

  function formatDateTime(value) {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) return "–";

    return new Intl.DateTimeFormat("de-AT", {
      dateStyle: "short",
      timeStyle: "medium"
    }).format(date);
  }

  function formatNumber(value, maximumFractionDigits = 1) {
    const number = Number(value);

    if (!Number.isFinite(number)) return "–";

    return new Intl.NumberFormat("de-AT", {
      maximumFractionDigits
    }).format(number);
  }

  function hasPosition(position) {
    return Boolean(
      position &&
      Number.isFinite(position.latitude) &&
      Number.isFinite(position.longitude)
    );
  }

  function formatPosition(position) {
    if (!hasPosition(position)) return "–";

    return (
      `${position.latitude.toFixed(5)}, ` +
      `${position.longitude.toFixed(5)}`
    );
  }

  function mapUrl(position) {
    if (!hasPosition(position)) return "";

    return (
      "https://www.openstreetmap.org/" +
      `?mlat=${encodeURIComponent(position.latitude)}` +
      `&mlon=${encodeURIComponent(position.longitude)}` +
      "#map=15/" +
      `${encodeURIComponent(position.latitude)}/` +
      `${encodeURIComponent(position.longitude)}`
    );
  }

  function appendPosition(cell, position) {
    const positionLink = mapUrl(position);

    if (!positionLink) {
      cell.textContent = "–";
      return;
    }

    const link = document.createElement("a");
    link.href = positionLink;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = formatPosition(position);
    cell.append(link);
  }

  function mergeSender(previous, update) {
    const next = { ...previous };

    for (const [key, value] of Object.entries(update)) {
      if (value === null || value === undefined || value === "") continue;
      next[key] = value;
    }

    const previousClass = previous?.sender_class ?? "other";
    const updateClass = update?.sender_class ?? "other";

    if (
      (senderClassPriority[previousClass] ?? 0) >
      (senderClassPriority[updateClass] ?? 0)
    ) {
      next.sender_class = previousClass;
    }

    const messageTypes = new Set(previous?.message_types ?? []);

    if (update.message_type) messageTypes.add(update.message_type);

    next.message_types = [...messageTypes].sort();
    return next;
  }

  function buildSenderKey(sender) {
    if (sender.mmsi) return sender.mmsi;

    const position = sender.message_position ?? sender.metadata_position;

    if (hasPosition(position)) {
      return [
        sender.sender_class ?? "other",
        sender.message_type ?? "unknown",
        position.latitude.toFixed(5),
        position.longitude.toFixed(5)
      ].join("|");
    }

    return (
      `${sender.sender_class ?? "other"}|` +
      `${sender.message_type ?? "unknown"}|` +
      `${receivedMessageCount}`
    );
  }

  function renderCounts(items) {
    senderCount.textContent = String(items.length);
    vesselCount.textContent = String(
      items.filter(sender => sender.sender_class === "vessel").length
    );
  }

  function createSenderBadge(senderClass) {
    const badge = document.createElement("span");
    badge.className = `sender-badge sender-${senderClass || "other"}`;
    badge.textContent = senderClassLabels[senderClass] ?? "Sonstiger Sender";
    return badge;
  }

  function buildRawDisplay(sender) {
    return {
      normalized: {
        message_type: sender.message_type ?? "",
        sender_class: sender.sender_class ?? "other",
        received_at: sender.received_at ?? "",
        ais_time: sender.ais_time ?? "",
        mmsi: sender.mmsi ?? "",
        raw_user_id: sender.raw_user_id ?? null,
        name: sender.name ?? "",
        message_position: sender.message_position ?? null,
        metadata_position: sender.metadata_position ?? null,
        sog: sender.sog ?? null,
        cog: sender.cog ?? null,
        true_heading: sender.true_heading ?? null,
        diagnostics: sender.diagnostics ?? null
      },
      raw_payload: sender.raw_payload ?? null
    };
  }

  function renderSenders() {
    const items = [...senders.entries()]
      .map(([key, sender]) => ({ key, sender }))
      .sort((left, right) =>
        String(right.sender.received_at ?? "").localeCompare(
          String(left.sender.received_at ?? "")
        )
      );

    renderCounts(items.map(item => item.sender));
    vesselRows.replaceChildren();
    emptyState.classList.toggle("hidden", items.length > 0);
    tableWrapper.classList.toggle("hidden", items.length === 0);

    for (const { key, sender } of items) {
      const row = document.createElement("tr");
      row.className = "sender-row";

      const categoryCell = document.createElement("td");
      categoryCell.append(createSenderBadge(sender.sender_class));

      const nameCell = document.createElement("td");
      const name = document.createElement("strong");
      name.textContent = sender.name || "Unbekannt";
      nameCell.append(name);

      if (sender.imo || sender.call_sign) {
        const subline = document.createElement("span");
        subline.className = "table-subline";
        subline.textContent = [
          sender.imo ? `IMO ${sender.imo}` : "",
          sender.call_sign ? `Rufzeichen ${sender.call_sign}` : ""
        ].filter(Boolean).join(" · ");
        nameCell.append(subline);
      }

      const mmsiCell = document.createElement("td");
      mmsiCell.textContent = sender.mmsi || "–";

      const timeCell = document.createElement("td");
      timeCell.textContent = formatDateTime(sender.received_at);

      const speedCell = document.createElement("td");
      speedCell.textContent =
        sender.sog === null || sender.sog === undefined
          ? "–"
          : `${formatNumber(sender.sog)} kn`;

      const courseCell = document.createElement("td");
      courseCell.textContent =
        sender.cog === null || sender.cog === undefined
          ? "–"
          : `${formatNumber(sender.cog)}°`;

      const headingCell = document.createElement("td");
      headingCell.textContent =
        sender.true_heading === null || sender.true_heading === undefined
          ? "–"
          : `${formatNumber(sender.true_heading, 0)}°`;

      const messagePositionCell = document.createElement("td");
      appendPosition(messagePositionCell, sender.message_position);

      const metadataPositionCell = document.createElement("td");
      appendPosition(metadataPositionCell, sender.metadata_position);

      const typeCell = document.createElement("td");
      typeCell.textContent = (sender.message_types ?? []).join(", ") || "–";

      const rawCell = document.createElement("td");
      const rawButton = document.createElement("button");
      rawButton.type = "button";
      rawButton.className = "secondary-button raw-toggle-button";
      rawButton.dataset.rawKey = key;
      rawButton.textContent = openRawKeys.has(key) ? "Ausblenden" : "Anzeigen";
      rawCell.append(rawButton);

      row.append(
        categoryCell,
        nameCell,
        mmsiCell,
        timeCell,
        speedCell,
        courseCell,
        headingCell,
        messagePositionCell,
        metadataPositionCell,
        typeCell,
        rawCell
      );

      vesselRows.append(row);

      if (openRawKeys.has(key)) {
        const detailRow = document.createElement("tr");
        detailRow.className = "raw-detail-row";

        const detailCell = document.createElement("td");
        detailCell.colSpan = 11;

        const pre = document.createElement("pre");
        pre.className = "raw-json";
        pre.textContent = JSON.stringify(buildRawDisplay(sender), null, 2);
        detailCell.append(pre);
        detailRow.append(detailCell);
        vesselRows.append(detailRow);
      }
    }
  }

  function renderMessageTypes() {
    const items = [...messageTypeCounts.entries()].sort(
      (left, right) => right[1] - left[1] || left[0].localeCompare(right[0])
    );

    messageTypeRows.replaceChildren();
    messageTypeEmpty.classList.toggle("hidden", items.length > 0);
    messageTypeWrapper.classList.toggle("hidden", items.length === 0);

    for (const [messageType, count] of items) {
      const row = document.createElement("tr");
      const typeCell = document.createElement("td");
      const countCell = document.createElement("td");
      typeCell.textContent = messageType || "Unbekannter Meldungstyp";
      countCell.textContent = String(count);
      row.append(typeCell, countCell);
      messageTypeRows.append(row);
    }
  }

  function handleAisMessage(sender) {
    receivedMessageCount += 1;
    messageCount.textContent = String(receivedMessageCount);

    const messageType = sender.message_type || "UnknownMessage";
    messageTypeCounts.set(
      messageType,
      (messageTypeCounts.get(messageType) ?? 0) + 1
    );

    const key = buildSenderKey(sender);
    senders.set(key, mergeSender(senders.get(key), sender));
    renderMessageTypes();
    renderSenders();
  }

  function stopCountdown() {
    if (countdownTimer) {
      clearInterval(countdownTimer);
      countdownTimer = null;
    }

    sessionEndsAt = null;
    remainingTime.textContent = "–";
  }

  function startCountdown(seconds) {
    stopCountdown();
    sessionEndsAt = Date.now() + seconds * 1000;

    const update = () => {
      const remaining = Math.max(
        0,
        Math.ceil((sessionEndsAt - Date.now()) / 1000)
      );

      const minutes = Math.floor(remaining / 60);
      const secondsPart = String(remaining % 60).padStart(2, "0");
      remainingTime.textContent = `${minutes}:${secondsPart}`;

      if (remaining <= 0) stopCountdown();
    };

    update();
    countdownTimer = setInterval(update, 1000);
  }

  function closeSocket() {
    stopCountdown();

    if (socket && socket.readyState < WebSocket.CLOSING) {
      socket.close(1000, "Browser beendet den AIS-Test");
    }

    socket = null;
    startButton.disabled = false;
    stopButton.disabled = true;
  }

  function handleWorkerMessage(event) {
    let message;

    try {
      message = JSON.parse(String(event.data ?? ""));
    } catch {
      addDiagnostic("Nicht lesbare Worker-Nachricht empfangen.");
      return;
    }

    if (message.type === "ais_message") {
      handleAisMessage(message.vessel ?? {});
      return;
    }

    if (message.type === "status") {
      setStatus(message.status, message.message ?? "");
      addDiagnostic(message.message ?? message.status);

      if (message.status === "subscribed") {
        startCountdown(Number(message.duration_seconds) || 300);
        boundingBoxText.textContent = JSON.stringify(
          message.bounding_boxes ?? []
        );
      }

      if (["stopped", "aisstream_closed"].includes(message.status)) {
        closeSocket();
      }

      return;
    }

    if (message.type === "error") {
      setStatus("error", message.error ?? "Unbekannter Fehler.");
      addDiagnostic(message.error ?? "Unbekannter Fehler.");
      closeSocket();
      return;
    }

    if (message.type === "warning") {
      addDiagnostic(message.warning ?? "Warnung ohne Text.");
    }
  }

  function startStream() {
    if (!workerUrl) {
      setStatus(
        "error",
        "In docs/js/config.js ist keine Worker-URL konfiguriert."
      );
      return;
    }

    if (!apiKey.value.trim()) {
      setStatus(
        "error",
        "Bitte den Wert des Cloudflare-Secrets API_KEY eingeben."
      );
      apiKey.focus();
      return;
    }

    closeSocket();
    setStatus("connecting_worker", "WebSocket zum Worker wird aufgebaut …");
    addDiagnostic(
      `Verbindung zum Worker wird gestartet · ` +
      `Bereich: ${testArea.options[testArea.selectedIndex].text} · ` +
      `Filter: ${messageFilter.options[messageFilter.selectedIndex].text}.`
    );

    startButton.disabled = true;
    stopButton.disabled = false;
    socket = new WebSocket(`${websocketUrl(workerUrl)}/ais-live`);

    socket.addEventListener("open", () => {
      socket.send(JSON.stringify({
        action: "start",
        api_key: apiKey.value.trim(),
        area: testArea.value,
        use_message_filter: messageFilter.value !== "all",
        duration_seconds: Number(durationSeconds.value)
      }));
    });

    socket.addEventListener("message", handleWorkerMessage);

    socket.addEventListener("close", event => {
      addDiagnostic(`Worker-WebSocket beendet · Code ${event.code}.`);
      socket = null;
      startButton.disabled = false;
      stopButton.disabled = true;
      stopCountdown();

      if (!connectionStatus.textContent.includes("Fehler")) {
        connectionStatus.textContent = "Nicht verbunden";
      }
    });

    socket.addEventListener("error", () => {
      setStatus(
        "error",
        "Die WebSocket-Verbindung zum Worker ist fehlgeschlagen."
      );
      addDiagnostic("WebSocket-Fehler zum Worker.");
      closeSocket();
    });
  }

  function stopStream() {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ action: "stop" }));
      stopButton.disabled = true;
      return;
    }

    closeSocket();
    setStatus("stopped", "AIS-Liveempfang beendet.");
  }

  function clearList() {
    senders.clear();
    messageTypeCounts.clear();
    openRawKeys.clear();
    receivedMessageCount = 0;
    messageCount.textContent = "0";
    renderMessageTypes();
    renderSenders();
    addDiagnostic("Empfangsliste und Meldungsstatistik geleert.");
  }

  vesselRows.addEventListener("click", event => {
    const button = event.target.closest("[data-raw-key]");
    if (!button) return;

    const key = button.dataset.rawKey;
    if (!key) return;

    if (openRawKeys.has(key)) {
      openRawKeys.delete(key);
    } else {
      openRawKeys.add(key);
    }

    renderSenders();
  });

  startButton.addEventListener("click", startStream);
  stopButton.addEventListener("click", stopStream);
  clearButton.addEventListener("click", clearList);
  window.addEventListener("beforeunload", closeSocket);

  setStatus("disconnected");
  renderMessageTypes();
  renderSenders();
});
