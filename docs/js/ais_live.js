// Danube Vessel Log
// File: docs/js/ais_live.js
// Version: 0.11.2
// Updated: 2026-07-24

"use strict";

document.addEventListener("DOMContentLoaded", () => {
  const byId = id => document.getElementById(id);

  const workerUrl = String(
    window.VesselConfig?.workerUrl ?? ""
  )
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
  const remainingTime = byId("remainingTime");
  const statusMessage = byId("statusMessage");
  const boundingBoxText = byId("boundingBoxText");
  const emptyState = byId("emptyState");
  const tableWrapper = byId("tableWrapper");
  const vesselRows = byId("vesselRows");
  const diagnosticLog = byId("diagnosticLog");

  let socket = null;
  let receivedMessageCount = 0;
  let sessionEndsAt = null;
  let countdownTimer = null;

  const vessels = new Map();
  const diagnostics = [];

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

    connectionStatus.textContent =
      labels[status] ?? status;

    statusMessage.textContent = message;

    statusMessage.className =
      status === "error"
        ? "status-message error"
        : status === "subscribed"
          ? "status-message success"
          : "status-message";
  }

  function addDiagnostic(message) {
    const time = new Intl.DateTimeFormat(
      "de-AT",
      {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
      }
    ).format(new Date());

    diagnostics.unshift(
      `${time} · ${message}`
    );

    diagnostics.splice(20);

    diagnosticLog.textContent =
      diagnostics.join("\n");
  }

  function formatDateTime(value) {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return "–";
    }

    return new Intl.DateTimeFormat(
      "de-AT",
      {
        dateStyle: "short",
        timeStyle: "medium"
      }
    ).format(date);
  }

  function formatNumber(
    value,
    maximumFractionDigits = 1
  ) {
    const number = Number(value);

    if (!Number.isFinite(number)) {
      return "–";
    }

    return new Intl.NumberFormat(
      "de-AT",
      {
        maximumFractionDigits
      }
    ).format(number);
  }

  function formatPosition(vessel) {
    if (
      !Number.isFinite(vessel.latitude) ||
      !Number.isFinite(vessel.longitude)
    ) {
      return "–";
    }

    return (
      `${vessel.latitude.toFixed(5)}, ` +
      `${vessel.longitude.toFixed(5)}`
    );
  }

  function mapUrl(vessel) {
    if (
      !Number.isFinite(vessel.latitude) ||
      !Number.isFinite(vessel.longitude)
    ) {
      return "";
    }

    return (
      `https://www.openstreetmap.org/` +
      `?mlat=${encodeURIComponent(vessel.latitude)}` +
      `&mlon=${encodeURIComponent(vessel.longitude)}` +
      `#map=15/` +
      `${encodeURIComponent(vessel.latitude)}/` +
      `${encodeURIComponent(vessel.longitude)}`
    );
  }

  function mergeVessel(previous, update) {
    const next = {
      ...previous
    };

    for (
      const [key, value]
      of Object.entries(update)
    ) {
      if (
        value === null ||
        value === undefined ||
        value === ""
      ) {
        continue;
      }

      next[key] = value;
    }

    const messageTypes =
      new Set(
        previous?.message_types ?? []
      );

    if (update.message_type) {
      messageTypes.add(
        update.message_type
      );
    }

    next.message_types = [
      ...messageTypes
    ].sort();

    return next;
  }

  function renderVessels() {
    const items = [
      ...vessels.values()
    ].sort(
      (left, right) =>
        String(
          right.received_at ?? ""
        ).localeCompare(
          String(
            left.received_at ?? ""
          )
        )
    );

    vesselCount.textContent =
      String(items.length);

    vesselRows.replaceChildren();

    emptyState.classList.toggle(
      "hidden",
      items.length > 0
    );

    tableWrapper.classList.toggle(
      "hidden",
      items.length === 0
    );

    for (const vessel of items) {
      const row =
        document.createElement("tr");

      const nameCell =
        document.createElement("td");

      const name =
        document.createElement("strong");

      name.textContent =
        vessel.name ||
        "Unbekannt";

      nameCell.append(name);

      if (
        vessel.imo ||
        vessel.call_sign
      ) {
        const subline =
          document.createElement("span");

        subline.className =
          "table-subline";

        subline.textContent = [
          vessel.imo
            ? `IMO ${vessel.imo}`
            : "",

          vessel.call_sign
            ? `Rufzeichen ${vessel.call_sign}`
            : ""
        ]
          .filter(Boolean)
          .join(" · ");

        nameCell.append(subline);
      }

      const mmsiCell =
        document.createElement("td");

      mmsiCell.textContent =
        vessel.mmsi || "–";

      const timeCell =
        document.createElement("td");

      timeCell.textContent =
        formatDateTime(
          vessel.received_at
        );

      const speedCell =
        document.createElement("td");

      speedCell.textContent =
        vessel.sog === null ||
        vessel.sog === undefined
          ? "–"
          : `${formatNumber(vessel.sog)} kn`;

      const courseCell =
        document.createElement("td");

      courseCell.textContent =
        vessel.cog === null ||
        vessel.cog === undefined
          ? "–"
          : `${formatNumber(vessel.cog)}°`;

      const headingCell =
        document.createElement("td");

      headingCell.textContent =
        vessel.true_heading === null ||
        vessel.true_heading === undefined
          ? "–"
          : (
              `${formatNumber(
                vessel.true_heading,
                0
              )}°`
            );

      const positionCell =
        document.createElement("td");

      const positionLink =
        mapUrl(vessel);

      if (positionLink) {
        const link =
          document.createElement("a");

        link.href =
          positionLink;

        link.target =
          "_blank";

        link.rel =
          "noopener noreferrer";

        link.textContent =
          formatPosition(vessel);

        positionCell.append(link);
      } else {
        positionCell.textContent =
          "–";
      }

      const typeCell =
        document.createElement("td");

      typeCell.textContent =
        (
          vessel.message_types ??
          []
        ).join(", ") || "–";

      row.append(
        nameCell,
        mmsiCell,
        timeCell,
        speedCell,
        courseCell,
        headingCell,
        positionCell,
        typeCell
      );

      vesselRows.append(row);
    }
  }

  function handleAisMessage(vessel) {
    receivedMessageCount += 1;

    messageCount.textContent =
      String(receivedMessageCount);

    const key =
      vessel.mmsi ||
      (
        `${vessel.message_type}-` +
        `${receivedMessageCount}`
      );

    vessels.set(
      key,
      mergeVessel(
        vessels.get(key),
        vessel
      )
    );

    renderVessels();
  }

  function stopCountdown() {
    if (countdownTimer) {
      clearInterval(
        countdownTimer
      );

      countdownTimer = null;
    }

    sessionEndsAt = null;
    remainingTime.textContent = "–";
  }

  function startCountdown(seconds) {
    stopCountdown();

    sessionEndsAt =
      Date.now() +
      seconds * 1000;

    const update = () => {
      const remaining =
        Math.max(
          0,
          Math.ceil(
            (
              sessionEndsAt -
              Date.now()
            ) /
            1000
          )
        );

      const minutes =
        Math.floor(
          remaining / 60
        );

      const secondsPart =
        String(
          remaining % 60
        ).padStart(2, "0");

      remainingTime.textContent =
        `${minutes}:${secondsPart}`;

      if (remaining <= 0) {
        stopCountdown();
      }
    };

    update();

    countdownTimer =
      setInterval(
        update,
        1000
      );
  }

  function closeSocket() {
    stopCountdown();

    if (
      socket &&
      socket.readyState <
        WebSocket.CLOSING
    ) {
      socket.close(
        1000,
        "Browser beendet den AIS-Test"
      );
    }

    socket = null;
    startButton.disabled = false;
    stopButton.disabled = true;
  }

  function handleWorkerMessage(event) {
    let message;

    try {
      message =
        JSON.parse(
          String(
            event.data ?? ""
          )
        );
    } catch {
      addDiagnostic(
        "Nicht lesbare Worker-Nachricht empfangen."
      );

      return;
    }

    if (
      message.type ===
      "ais_message"
    ) {
      handleAisMessage(
        message.vessel ?? {}
      );

      return;
    }

    if (
      message.type ===
      "status"
    ) {
      setStatus(
        message.status,
        message.message ?? ""
      );

      addDiagnostic(
        message.message ??
        message.status
      );

      if (
        message.status ===
        "subscribed"
      ) {
        startCountdown(
          Number(
            message.duration_seconds
          ) || 300
        );

        boundingBoxText.textContent =
          JSON.stringify(
            message.bounding_boxes ??
            []
          );
      }

      if (
        [
          "stopped",
          "aisstream_closed"
        ].includes(
          message.status
        )
      ) {
        closeSocket();
      }

      return;
    }

    if (
      message.type ===
      "error"
    ) {
      setStatus(
        "error",
        message.error ??
        "Unbekannter Fehler."
      );

      addDiagnostic(
        message.error ??
        "Unbekannter Fehler."
      );

      closeSocket();
      return;
    }

    if (
      message.type ===
      "warning"
    ) {
      addDiagnostic(
        message.warning ??
        "Warnung ohne Text."
      );
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

    setStatus(
      "connecting_worker",
      "WebSocket zum Worker wird aufgebaut …"
    );

    addDiagnostic(
      `Verbindung zum Worker wird gestartet · ` +
      `Bereich: ${testArea.options[testArea.selectedIndex].text} · ` +
      `Filter: ${messageFilter.options[messageFilter.selectedIndex].text}.`
    );

    startButton.disabled = true;
    stopButton.disabled = false;

    socket = new WebSocket(
      `${websocketUrl(workerUrl)}/ais-live`
    );

    socket.addEventListener(
      "open",
      () => {
        socket.send(
          JSON.stringify({
            action: "start",
            api_key: apiKey.value.trim(),
            area: testArea.value,
            use_message_filter:
              messageFilter.value !== "all",
            duration_seconds:
              Number(durationSeconds.value)
          })
        );
      }
    );

    socket.addEventListener(
      "message",
      handleWorkerMessage
    );

    socket.addEventListener(
      "close",
      event => {
        addDiagnostic(
          `Worker-WebSocket beendet · Code ${event.code}.`
        );

        socket = null;
        startButton.disabled = false;
        stopButton.disabled = true;
        stopCountdown();

        if (
          !connectionStatus
            .textContent
            .includes("Fehler")
        ) {
          connectionStatus.textContent =
            "Nicht verbunden";
        }
      }
    );

    socket.addEventListener(
      "error",
      () => {
        setStatus(
          "error",
          "Die WebSocket-Verbindung zum Worker ist fehlgeschlagen."
        );

        addDiagnostic(
          "WebSocket-Fehler zum Worker."
        );

        closeSocket();
      }
    );
  }

  function stopStream() {
    if (
      socket &&
      socket.readyState ===
        WebSocket.OPEN
    ) {
      socket.send(
        JSON.stringify({
          action: "stop"
        })
      );

      stopButton.disabled =
        true;

      return;
    }

    closeSocket();

    setStatus(
      "stopped",
      "AIS-Liveempfang beendet."
    );
  }

  function clearList() {
    vessels.clear();
    receivedMessageCount = 0;

    messageCount.textContent =
      "0";

    renderVessels();

    addDiagnostic(
      "Empfangsliste geleert."
    );
  }

  startButton.addEventListener(
    "click",
    startStream
  );

  stopButton.addEventListener(
    "click",
    stopStream
  );

  clearButton.addEventListener(
    "click",
    clearList
  );

  window.addEventListener(
    "beforeunload",
    closeSocket
  );

  setStatus("disconnected");
  renderVessels();
});
