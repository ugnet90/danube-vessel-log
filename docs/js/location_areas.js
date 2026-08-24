/*
 * Danube Vessel Log
 * File: docs/js/location_areas.js
 * Version: 0.14.51
 * Updated: 2026-08-24
 */

"use strict";

(async function () {
  const maps = window.DanubeLocationMap;
  const status = document.getElementById("locationAreasStatus");
  const list = document.getElementById("locationAreasList");
  const selectedPhotoCard = document.getElementById("selectedPhotoCard");
  const showAreas = document.getElementById("showAreas");
  const baseMapMode = document.getElementById("baseMapMode");
  const baseMapNotice = document.getElementById("baseMapNotice");
  const mapBaseNotice = document.getElementById("mapBaseNotice");
  const showBerths = document.getElementById("showBerths");
  const showPhotos = document.getElementById("showPhotos");
  const showVesselBerths = document.getElementById("showVesselBerths");
  const showVertices = document.getElementById("showVertices");
  const connectionMode = document.getElementById("connectionMode");
  const vesselFilter = document.getElementById("photoVesselFilter");
  const areaFilter = document.getElementById("photoAreaFilter");
  const sourceFilter = document.getElementById("photoSourceFilter");
  const dateFrom = document.getElementById("photoDateFrom");
  const dateTo = document.getElementById("photoDateTo");
  const labelMode = document.getElementById("photoLabelMode");
  const resetFilters = document.getElementById("resetPhotoFilters");
  const photoCount = document.getElementById("photoCount");
  const vesselBerthCount = document.getElementById("vesselBerthCount");
  const connectionCount = document.getElementById("connectionCount");
  const fullscreenButton = document.getElementById("toggleMapFullscreen");
  const mapCard = document.querySelector(".location-areas-map-card");
  const detailPanel = document.getElementById("mapDetailPanel");
  const detailContent = document.getElementById("mapDetailContent");
  const closeDetailButton = document.getElementById("closeMapDetail");

  if (!maps || !window.L) {
    status.textContent = "Die Kartenbibliothek konnte nicht geladen werden.";
    status.classList.add("error");
    return;
  }

  const SETTINGS_KEY = "danube.locationAreas.settings.v2";
  const PHOTO_CLUSTER_PIXEL_DISTANCE = 19;
  const DEFAULT_SETTINGS = Object.freeze({
    showAreas: true,
    showBerths: true,
    showPhotos: true,
    showVesselBerths: true,
    showVertices: false,
    baseMapMode: "osm",
    connectionMode: "all",
    vesselFilter: "",
    areaFilter: "",
    sourceFilter: "",
    dateFrom: "",
    dateTo: "",
    labelMode: "none"
  });
  const workerUrl = String(window.VesselConfig?.workerUrl ?? "").trim();

  let map;
  let areas = [];
  let photos = [];
  let sightings = [];
  let locationIndexSchemaVersion = 0;
  let berths = [];
  let berthGeometryIndex = new Map();
  let areaLayers;
  let berthLayers;
  const photoLayer = L.layerGroup();
  const vesselBerthLayer = L.layerGroup();
  const connectionLayer = L.layerGroup();
  let selectedPhotoLayer = null;
  let currentEntries = [];
  let currentVisiblePhotos = [];
  let selectedConnection = null;
  let vesselDisplayCoordinates = new Map();

  function selectedPhotoFromQuery() {
    const params = new URLSearchParams(window.location.search);
    const coords = maps.validCoordinates(params.get("lat"), params.get("lon"));
    if (!coords) return null;
    return {
      photo_id: params.get("photo_id") || "",
      captured_at: params.get("captured_at") || "",
      current_location: params.get("location") || "",
      photo_lat: coords.latitude,
      photo_lon: coords.longitude,
      source_type: "selected"
    };
  }

  function setLayerVisible(group, visible) {
    if (!group) return;
    if (visible) {
      if (!map.hasLayer(group)) group.addTo(map);
    } else if (map.hasLayer(group)) {
      map.removeLayer(group);
    }
  }

  function readSettings() {
    try {
      const parsed = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }

  function selectHasValue(select, value) {
    return [...select.options].some(option => option.value === value);
  }

  function restoreSettings() {
    const saved = { ...DEFAULT_SETTINGS, ...readSettings() };
    const checkboxValues = {
      showAreas,
      showBerths,
      showPhotos,
      showVesselBerths,
      showVertices
    };

    Object.entries(checkboxValues).forEach(([key, control]) => {
      if (typeof saved[key] === "boolean") control.checked = saved[key];
    });

    const selectValues = {
      baseMapMode,
      connectionMode,
      vesselFilter,
      areaFilter,
      sourceFilter,
      labelMode
    };
    Object.entries(selectValues).forEach(([key, control]) => {
      const value = String(saved[key] ?? "");
      if (selectHasValue(control, value)) control.value = value;
    });

    if (typeof saved.dateFrom === "string") dateFrom.value = saved.dateFrom;
    if (typeof saved.dateTo === "string") dateTo.value = saved.dateTo;
  }

  function saveSettings() {
    const value = {
      showAreas: showAreas.checked,
      showBerths: showBerths.checked,
      showPhotos: showPhotos.checked,
      showVesselBerths: showVesselBerths.checked,
      showVertices: showVertices.checked,
      baseMapMode: baseMapMode.value,
      connectionMode: connectionMode.value,
      vesselFilter: vesselFilter.value,
      areaFilter: areaFilter.value,
      sourceFilter: sourceFilter.value,
      dateFrom: dateFrom.value,
      dateTo: dateTo.value,
      labelMode: labelMode.value
    };

    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(value));
    } catch {
      // Lokale Speicherung ist Komfortfunktion; die Karte bleibt nutzbar.
    }
  }

  function addDetailLine(text, className = "map-detail-line") {
    if (!text) return;
    const line = document.createElement("div");
    line.className = className;
    line.textContent = text;
    detailContent.append(line);
  }

  function showDetail({ title, lines = [], note = "", vesselId = "" }) {
    detailContent.replaceChildren();
    const heading = document.createElement("strong");
    heading.textContent = title || "Kartendetail";
    detailContent.append(heading);
    lines.filter(Boolean).forEach(line => addDetailLine(line));
    if (note) addDetailLine(note, "map-detail-note");

    if (vesselId) {
      const link = document.createElement("a");
      link.href = `vessel.html?id=${encodeURIComponent(vesselId)}`;
      link.textContent = "Schiff öffnen";
      link.className = "map-popup-link";
      detailContent.append(link);
    }

    detailPanel.classList.remove("hidden");
  }

  function closeDetail({ clearSelection = true } = {}) {
    detailPanel.classList.add("hidden");
    detailContent.replaceChildren();
    if (clearSelection && selectedConnection) {
      selectedConnection = null;
      renderConnections(currentEntries, currentVisiblePhotos);
    }
  }

  function connectionSelectionId(selection) {
    if (!selection) return "";
    return `${selection.kind}:${selection.key || selection.submissionId || ""}`;
  }

  function selectConnection(nextSelection) {
    if (connectionMode.value !== "selected") {
      selectedConnection = nextSelection;
      return;
    }

    if (
      connectionSelectionId(selectedConnection) &&
      connectionSelectionId(selectedConnection) === connectionSelectionId(nextSelection)
    ) {
      selectedConnection = null;
    } else {
      selectedConnection = nextSelection;
    }
    renderConnections(currentEntries, currentVisiblePhotos);
  }

  function photoSubmissionId(photo) {
    return String(photo?.submission_id || photo?.relation?.submission_id || "").trim();
  }

  function showPhotoDetail({ photo, relationState, photoKey }) {
    const submissionId = photoSubmissionId(photo);
    selectConnection({
      kind: "photo",
      key: photoKey || maps.photoMarkerKey(photo),
      submissionId
    });

    const typeText = photo?.source_type === "direct"
      ? (submissionId ? "Zusatzfoto zu Sichtung" : "Zusatzfoto nur zum Schiff")
      : "Sichtungsfoto";

    showDetail({
      title: photo?.vessel_name || photo?.vessel_id || "Fotoaufnahme",
      lines: [
        maps.formatDateTime(photo?.captured_at),
        photo?.location?.name ? `Ort: ${photo.location.name}` : "Ort: unbekannt",
        `Typ: ${typeText}`,
        submissionId ? `Sichtung: ${submissionId}` : ""
      ],
      note: relationState === "sighting-unlocated"
        ? "Schiffsposition dieser Sichtung ist nicht kartierbar; daher gibt es keine Verbindungslinie."
        : "",
      vesselId: String(photo?.vessel_id || "").trim()
    });
  }

  function showVesselDetail({ record }) {
    const submissionId = String(record?.submission_id || "").trim();
    if (submissionId) {
      selectConnection({ kind: "sighting", key: submissionId, submissionId });
    }

    showDetail({
      title: record?.vessel_name || record?.vessel_id || "Schiff",
      lines: [
        maps.formatDateTime(record?.captured_at),
        record?.berth?.short_name || record?.berth?.name
          ? `Anlegestelle: ${record.berth.short_name || record.berth.name}`
          : "",
        submissionId ? `Sichtung: ${submissionId}` : "",
        record?.direction === "upstream"
          ? "Ausrichtung: flussaufwärts"
          : record?.direction === "downstream"
            ? "Ausrichtung: flussabwärts"
            : ""
      ],
      note: "Position = aus der aktuellen Liegekante flussseitig abgeleitet; noch keine gemessene Schiff-GPS-Position.",
      vesselId: String(record?.vessel_id || "").trim()
    });
  }

  function showBerthDetail({ berth }) {
    const station = String(berth?.station_number || "").trim();
    const orthophotoNote = ["11", "12"].includes(station)
      ? "Hinweis: Die aktuelle Lage von Linz 11/12 stammt aus der neuen Anlegergeometrie. Orthofotos können hier noch den Zustand vor dem Umbau 2025/26 zeigen."
      : "";

    showDetail({
      title: berth?.short_name || berth?.public_name || berth?.name || "Anlegestelle",
      lines: [
        berth?.station_number ? `Station: ${berth.station_number}` : "",
        berth?.river_km_text
          ? `Donau-km: ${berth.river_km_text}`
          : Number.isFinite(Number(berth?.river_km))
            ? `Donau-km: ${berth.river_km}`
            : "",
        berth?.bank
          ? `Ufer: ${berth.bank === "right" ? "rechts" : berth.bank === "left" ? "links" : berth.bank}`
          : "",
        berth?.facility_type ? `Typ: ${berth.facility_type}` : ""
      ],
      note: orthophotoNote
    });
  }

  function fillFilterOptions() {
    const vesselValues = new Map();
    const areaValues = new Set();

    const addFilterValues = item => {
      const id = String(item?.vessel_id || "").trim();
      const name = String(item?.vessel_name || id || "").trim();
      const key = id || name;
      if (key) vesselValues.set(key, name || key);
      const areaName = String(item?.location?.name || "").trim();
      if (areaName) areaValues.add(areaName);
    };

    photos.forEach(addFilterValues);
    sightings.forEach(addFilterValues);

    [...vesselValues.entries()]
      .sort((a, b) => a[1].localeCompare(b[1], "de"))
      .forEach(([value, text]) => {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = text;
        vesselFilter.append(option);
      });

    [...areaValues]
      .sort((a, b) => a.localeCompare(b, "de"))
      .forEach(value => {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = value;
        areaFilter.append(option);
      });
  }

  function photoMatches(photo) {
    const vesselKey = String(photo?.vessel_id || photo?.vessel_name || "").trim();
    if (vesselFilter.value && vesselKey !== vesselFilter.value) return false;
    if (areaFilter.value && String(photo?.location?.name || "") !== areaFilter.value) return false;
    if (sourceFilter.value && String(photo?.source_type || "") !== sourceFilter.value) return false;
    const day = maps.localDateKey(photo?.captured_at);
    if (dateFrom.value && (!day || day < dateFrom.value)) return false;
    if (dateTo.value && (!day || day > dateTo.value)) return false;
    return true;
  }

  function sightingMatches(sighting) {
    const vesselKey = String(sighting?.vessel_id || sighting?.vessel_name || "").trim();
    if (vesselFilter.value && vesselKey !== vesselFilter.value) return false;

    if (sourceFilter.value) {
      const submissionId = String(sighting?.submission_id || "").trim();
      return Boolean(submissionId) && photos.some(photo =>
        photoSubmissionId(photo) === submissionId && photoMatches(photo)
      );
    }

    if (areaFilter.value && String(sighting?.location?.name || "") !== areaFilter.value) return false;
    const day = maps.localDateKey(sighting?.captured_at);
    if (dateFrom.value && (!day || day < dateFrom.value)) return false;
    if (dateTo.value && (!day || day > dateTo.value)) return false;
    return true;
  }

  function mappableSubmissionIds(entries) {
    return new Set(entries
      .filter(entry => berthAnchorCoordinates(entry?.berth))
      .map(entry => String(entry?.record?.submission_id || "").trim())
      .filter(Boolean));
  }

  function relationStateForPhoto(photo, mappableSightings) {
    const submissionId = photoSubmissionId(photo);
    if (!submissionId) return "vessel";
    return mappableSightings.has(submissionId)
      ? "sighting-connected"
      : "sighting-unlocated";
  }

  function clusterPhotoItems(items) {
    const unassigned = new Set(items.map((_, index) => index));
    const clusters = [];

    while (unassigned.size) {
      const first = unassigned.values().next().value;
      unassigned.delete(first);
      const queue = [first];
      const indexes = [first];

      while (queue.length) {
        const current = queue.shift();
        const currentPoint = items[current].point;
        for (const candidate of [...unassigned]) {
          const point = items[candidate].point;
          const distance = Math.hypot(point.x - currentPoint.x, point.y - currentPoint.y);
          if (distance <= PHOTO_CLUSTER_PIXEL_DISTANCE) {
            unassigned.delete(candidate);
            queue.push(candidate);
            indexes.push(candidate);
          }
        }
      }

      clusters.push(indexes.map(index => items[index]));
    }

    return clusters;
  }

  function photoMarkerOptions(item) {
    return {
      labelMode: labelMode.value,
      relationState: item.relationState,
      onSelect: showPhotoDetail
    };
  }

  function renderPhotos(entries) {
    if (map._danubePhotoSpiderfy?.collapse) map._danubePhotoSpiderfy.collapse();
    photoLayer.clearLayers();

    const visiblePhotos = photos.filter(photoMatches);
    const mappableSightings = mappableSubmissionIds(entries);
    const items = visiblePhotos.map(photo => {
      const coords = maps.validCoordinates(photo?.photo_lat, photo?.photo_lon);
      if (!coords) return null;
      return {
        photo,
        relationState: relationStateForPhoto(photo, mappableSightings),
        coords,
        point: map.latLngToLayerPoint([coords.latitude, coords.longitude])
      };
    }).filter(Boolean);

    const clusters = clusterPhotoItems(items);
    for (const cluster of clusters) {
      if (cluster.length === 1) {
        const item = cluster[0];
        const marker = maps.createPhotoMarker(map, item.photo, {
          addToMap: false,
          ...photoMarkerOptions(item)
        });
        if (marker) marker.addTo(photoLayer);
        continue;
      }

      const centerCoordinates = {
        latitude: cluster.reduce((sum, item) => sum + item.coords.latitude, 0) / cluster.length,
        longitude: cluster.reduce((sum, item) => sum + item.coords.longitude, 0) / cluster.length
      };
      const marker = maps.createPhotoGroupMarker(map, cluster, {
        addToMap: false,
        centerCoordinates,
        markerOptions: photoMarkerOptions
      });
      if (marker) marker.addTo(photoLayer);
    }

    setLayerVisible(photoLayer, showPhotos.checked);
    photoCount.textContent = `${visiblePhotos.length} ${visiblePhotos.length === 1 ? "Foto" : "Fotos"}`;
    currentVisiblePhotos = visiblePhotos;
    return visiblePhotos;
  }

  function berthById() {
    return new Map(berths
      .filter(berth => String(berth?.berth_id || "").trim())
      .map(berth => [String(berth.berth_id).trim(), berth]));
  }

  function vesselBerthRecords() {
    const berthLookup = berthById();
    return sightings
      .filter(sightingMatches)
      .filter(sighting => String(sighting?.movement || "") === "moored")
      .map(sighting => {
        const berthId = String(sighting?.berth?.id || "").trim();
        if (!berthId || !berthLookup.has(berthId)) return null;
        return {
          record: {
            ...sighting,
            berth: { ...(sighting.berth || {}) },
            berth_id: berthId
          },
          berth: berthLookup.get(berthId)
        };
      })
      .filter(Boolean);
  }

  function connectionMatchesSelection(photo, submissionId) {
    if (connectionMode.value === "all") return true;
    if (connectionMode.value === "none") return false;
    if (!selectedConnection) return false;

    if (selectedConnection.kind === "photo") {
      return maps.photoMarkerKey(photo) === selectedConnection.key;
    }
    if (selectedConnection.kind === "sighting") {
      return submissionId === selectedConnection.submissionId;
    }
    return false;
  }

  function berthAnchorCoordinates(berth) {
    return maps.berthAnchorCoordinates(
      berthGeometryIndex,
      berth
    ) || maps.validCoordinates(
      berth?.latitude,
      berth?.longitude
    );
  }

  function riverwardDisplayCoordinates(berth) {
    return maps.berthRiverwardDisplayCoordinates(
      map,
      berth,
      berthGeometryIndex,
      { distanceMeters: 10 }
    ) || berthAnchorCoordinates(berth);
  }


  function addBerthGuide(berth, displayCoordinates) {
    const berthCoordinates = berthAnchorCoordinates(berth);
    const display = maps.validCoordinates(displayCoordinates?.latitude, displayCoordinates?.longitude);
    if (!berthCoordinates || !display) return;

    L.polyline(
      [
        [berthCoordinates.latitude, berthCoordinates.longitude],
        [display.latitude, display.longitude]
      ],
      {
        color: "#94a3b8",
        weight: 1.4,
        opacity: 0.8,
        dashArray: "2 4",
        interactive: false
      }
    ).addTo(vesselBerthLayer);
  }

  function renderConnections(entries, visiblePhotos) {
    connectionLayer.clearLayers();
    let renderedCount = 0;

    const bySubmission = new Map(entries
      .map(entry => [String(entry?.record?.submission_id || "").trim(), entry])
      .filter(([submissionId]) => Boolean(submissionId)));

    if (connectionMode.value !== "none") {
      for (const photo of visiblePhotos) {
        const submissionId = photoSubmissionId(photo);
        if (!submissionId || !bySubmission.has(submissionId)) continue;
        if (!connectionMatchesSelection(photo, submissionId)) continue;

        const entry = bySubmission.get(submissionId);
        const photoCoordinates = maps.validCoordinates(photo?.photo_lat, photo?.photo_lon);
        const berthCoordinates = berthAnchorCoordinates(entry?.berth);
        if (!photoCoordinates || !berthCoordinates) continue;

        const photoSpiderCoordinates =
          map._danubePhotoSpiderfy?.positions instanceof Map
            ? map._danubePhotoSpiderfy.positions.get(maps.photoMarkerKey(photo))
            : null;
        const vesselSpiderCoordinates =
          map._danubeVesselSpiderfy?.positions instanceof Map
            ? map._danubeVesselSpiderfy.positions.get(submissionId)
            : null;

        const sourceCoordinates = maps.validCoordinates(
          photoSpiderCoordinates?.latitude,
          photoSpiderCoordinates?.longitude
        ) || photoCoordinates;
        const storedDisplayCoordinates = vesselDisplayCoordinates.get(submissionId);
        const targetCoordinates = maps.validCoordinates(
          vesselSpiderCoordinates?.latitude,
          vesselSpiderCoordinates?.longitude
        ) || maps.validCoordinates(
          storedDisplayCoordinates?.latitude,
          storedDisplayCoordinates?.longitude
        ) || berthCoordinates;

        const vesselName = entry?.record?.vessel_name || entry?.record?.vessel_id || "Schiff";
        const berthName = entry?.berth?.short_name || entry?.berth?.public_name ||
          entry?.record?.berth?.short_name || entry?.record?.berth?.name || "Anlegestelle";

        const line = maps.createPhotoVesselConnection(map, sourceCoordinates, targetCoordinates, {
          addToMap: false,
          color: "#0f4c81",
          weight: 2.4,
          opacity: 0.9,
          dashArray: "6 6",
          tooltip: `${vesselName}: Foto-Aufnahmeort → ${berthName}`
        });
        if (line) {
          line.addTo(connectionLayer);
          renderedCount += 1;
        }
      }
    }

    setLayerVisible(
      connectionLayer,
      showPhotos.checked && showVesselBerths.checked && connectionMode.value !== "none"
    );

    const modeLabel = connectionMode.value === "all"
      ? "Alle"
      : connectionMode.value === "none"
        ? "Keine"
        : "Nur Auswahl";
    connectionCount.textContent =
      `${renderedCount} ${renderedCount === 1 ? "Verbindung" : "Verbindungen"} · ${modeLabel}`;
  }

  function renderVesselBerths(entries, visiblePhotos) {
    if (map._danubeVesselSpiderfy?.collapse) map._danubeVesselSpiderfy.collapse();
    vesselBerthLayer.clearLayers();
    vesselDisplayCoordinates = new Map();

    const groups = new Map();
    for (const entry of entries) {
      const berthId = String(entry?.record?.berth_id || "").trim();
      if (!berthId) continue;
      if (!groups.has(berthId)) groups.set(berthId, []);
      groups.get(berthId).push(entry);
    }

    for (const groupedEntries of groups.values()) {
      const berth = groupedEntries[0]?.berth;
      const displayCoordinates = riverwardDisplayCoordinates(berth);
      let marker = null;

      if (displayCoordinates) {
        addBerthGuide(berth, displayCoordinates);
        groupedEntries.forEach(entry => {
          const submissionId = String(entry?.record?.submission_id || "").trim();
          if (submissionId) vesselDisplayCoordinates.set(submissionId, displayCoordinates);
        });
      }

      if (groupedEntries.length === 1) {
        marker = maps.createVesselBerthMarker(map, groupedEntries[0].record, berth, {
          addToMap: false,
          displayCoordinates,
          onSelect: showVesselDetail
        });
      } else {
        marker = maps.createVesselBerthGroupMarker(
          map,
          groupedEntries.map(entry => entry.record),
          berth,
          {
            addToMap: false,
            displayCoordinates,
            spiderfy: true,
            onSelect: showVesselDetail
          }
        );
      }
      if (marker) marker.addTo(vesselBerthLayer);
    }

    setLayerVisible(vesselBerthLayer, showVesselBerths.checked);
    renderConnections(entries, visiblePhotos);

    const uniqueVessels = new Set(entries
      .map(entry => String(entry?.record?.vessel_id || entry?.record?.vessel_name || "").trim())
      .filter(Boolean)).size;
    vesselBerthCount.textContent =
      `${entries.length} ${entries.length === 1 ? "Anlege-Sichtung" : "Anlege-Sichtungen"} · ` +
      `${uniqueVessels} ${uniqueVessels === 1 ? "Schiff" : "Schiffe"}`;
  }

  function renderMapData() {
    currentEntries = vesselBerthRecords();
    const visiblePhotos = renderPhotos(currentEntries);
    renderVesselBerths(currentEntries, visiblePhotos);
  }

  function renderAreaList() {
    list.replaceChildren();
    areaLayers.entries.forEach(entry => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "location-area-item";
      const swatch = document.createElement("span");
      swatch.className = "location-area-swatch";
      swatch.style.background = entry.color;
      const text = document.createElement("span");
      text.textContent = maps.areaName(entry.feature);
      button.append(swatch, text);
      button.addEventListener("click", () => {
        const bounds = entry.layer.getBounds();
        if (bounds?.isValid()) map.fitBounds(bounds.pad(0.15));
        entry.layer.openPopup?.();
      });
      list.append(button);
    });
  }

  function showSelectedPhoto() {
    const photo = selectedPhotoFromQuery();
    if (!photo) return;

    const matches = maps.matchingAreas(areas, photo.photo_lat, photo.photo_lon);
    const best = matches[0] || null;
    const inferred = best ? maps.areaName(best) : "Kein Polygon-Treffer";

    selectedPhotoCard.classList.remove("hidden");
    selectedPhotoCard.replaceChildren();
    const title = document.createElement("strong");
    title.textContent = "Ausgewähltes Foto";
    const info = document.createElement("div");
    info.textContent = [
      maps.formatDateTime(photo.captured_at),
      photo.current_location ? `gespeichert: ${photo.current_location}` : "",
      `GPS-Punkt liegt in: ${inferred}`
    ].filter(Boolean).join(" · ");
    selectedPhotoCard.append(title, info);

    const selected = {
      ...photo,
      vessel_name: "Ausgewähltes Foto",
      location: { name: inferred }
    };
    selectedPhotoLayer = maps.createPhotoMarker(map, selected, {
      color: "#991b1b",
      fillColor: "#ffffff",
      radius: 9,
      weight: 4,
      onSelect: showPhotoDetail
    });

    if (selectedPhotoLayer) {
      map.setView([photo.photo_lat, photo.photo_lon], 18);
      showPhotoDetail({
        photo: selected,
        relationState: "vessel",
        photoKey: maps.photoMarkerKey(selected)
      });
    }
  }

  function setMapFullscreen(active) {
    if (!mapCard || !fullscreenButton) return;
    mapCard.classList.toggle("is-fullscreen", active);
    document.body.classList.toggle("location-map-fullscreen", active);
    fullscreenButton.textContent = active ? "Vollbild schließen" : "Vollbild";
    fullscreenButton.setAttribute("aria-pressed", active ? "true" : "false");
    window.setTimeout(() => map?.invalidateSize(), 40);
  }

  function updateBaseMapNotice() {
    const orthophoto = String(baseMapMode?.value || "").startsWith("orthophoto");
    const settingsText =
      "Orthofoto: Aufnahmejahr und Datenstand können je nach Gebiet abweichen. " +
      "Bei Linz 11/12 kann noch die Anlegerlage vor dem Umbau 2025/26 sichtbar sein.";
    const mapText =
      "Orthofoto: Datenstand je Gebiet unterschiedlich; Linz 11/12 können noch die Lage vor dem Umbau 2025/26 zeigen.";

    if (baseMapNotice) {
      baseMapNotice.classList.toggle("hidden", !orthophoto);
      if (orthophoto) baseMapNotice.textContent = settingsText;
    }
    if (mapBaseNotice) {
      mapBaseNotice.classList.toggle("hidden", !orthophoto);
      if (orthophoto) mapBaseNotice.textContent = mapText;
    }
  }

  function applyLayerSettings() {
    if (typeof map?._danubeSetBaseLayer === "function") {
      baseMapMode.value = map._danubeSetBaseLayer(baseMapMode.value);
    }
    updateBaseMapNotice();
    setLayerVisible(areaLayers?.group, showAreas.checked);
    setLayerVisible(berthLayers?.group, showBerths.checked);
    setLayerVisible(areaLayers?.vertexGroup, showVertices.checked);
    renderMapData();
  }

  function wireControls() {
    const persistAndRender = () => {
      saveSettings();
      renderMapData();
    };

    baseMapMode.addEventListener("change", () => {
      if (typeof map?._danubeSetBaseLayer === "function") {
        baseMapMode.value = map._danubeSetBaseLayer(baseMapMode.value);
      }
      updateBaseMapNotice();
      saveSettings();
    });

    showAreas.addEventListener("change", () => {
      setLayerVisible(areaLayers.group, showAreas.checked);
      saveSettings();
    });
    showBerths.addEventListener("change", () => {
      setLayerVisible(berthLayers?.group, showBerths.checked);
      saveSettings();
    });
    showPhotos.addEventListener("change", persistAndRender);
    showVesselBerths.addEventListener("change", persistAndRender);
    showVertices.addEventListener("change", () => {
      setLayerVisible(areaLayers.vertexGroup, showVertices.checked);
      saveSettings();
    });
    connectionMode.addEventListener("change", () => {
      saveSettings();
      renderConnections(currentEntries, currentVisiblePhotos);
    });

    [vesselFilter, areaFilter, sourceFilter, dateFrom, dateTo, labelMode]
      .forEach(control => control.addEventListener("change", persistAndRender));

    resetFilters.addEventListener("click", () => {
      showAreas.checked = DEFAULT_SETTINGS.showAreas;
      showBerths.checked = DEFAULT_SETTINGS.showBerths;
      showPhotos.checked = DEFAULT_SETTINGS.showPhotos;
      showVesselBerths.checked = DEFAULT_SETTINGS.showVesselBerths;
      showVertices.checked = DEFAULT_SETTINGS.showVertices;
      baseMapMode.value = DEFAULT_SETTINGS.baseMapMode;
      connectionMode.value = DEFAULT_SETTINGS.connectionMode;
      vesselFilter.value = DEFAULT_SETTINGS.vesselFilter;
      areaFilter.value = DEFAULT_SETTINGS.areaFilter;
      sourceFilter.value = DEFAULT_SETTINGS.sourceFilter;
      dateFrom.value = DEFAULT_SETTINGS.dateFrom;
      dateTo.value = DEFAULT_SETTINGS.dateTo;
      labelMode.value = DEFAULT_SETTINGS.labelMode;
      selectedConnection = null;
      closeDetail({ clearSelection: false });
      saveSettings();
      applyLayerSettings();
    });

    closeDetailButton?.addEventListener("click", () => closeDetail());

    if (fullscreenButton && mapCard) {
      fullscreenButton.addEventListener("click", () => {
        setMapFullscreen(!mapCard.classList.contains("is-fullscreen"));
      });
      document.addEventListener("keydown", event => {
        if (event.key === "Escape" && mapCard.classList.contains("is-fullscreen")) {
          setMapFullscreen(false);
        } else if (event.key === "Escape" && !detailPanel.classList.contains("hidden")) {
          closeDetail();
        }
      });
    }
  }

  try {
    map = maps.createMap(document.getElementById("locationAreasMap"));

    const refreshConnections = () => renderConnections(currentEntries, currentVisiblePhotos);
    map.on("danube:vessel-spiderfy-change", refreshConnections);
    map.on("danube:photo-spiderfy-change", refreshConnections);

    const [loadedAreas, locationIndex, berthGeometryFeatures] = await Promise.all([
      maps.loadAreas(),
      maps.loadLocationIndex().catch(() => ({ schema_version: 0, photos: [], sightings: [] })),
      maps.loadBerthGeometries().catch(() => [])
    ]);

    areas = loadedAreas;
    berthGeometryIndex = maps.indexBerthGeometries(berthGeometryFeatures);
    photos = locationIndex.photos;
    sightings = locationIndex.sightings;
    locationIndexSchemaVersion = locationIndex.schema_version;

    areaLayers = maps.addAreaLayers(map, areas, {
      addToMap: true,
      fillOpacity: 0.22,
      weight: 4
    });

    connectionLayer.addTo(map);
    photoLayer.addTo(map);
    vesselBerthLayer.addTo(map);

    try {
      berths = await maps.loadBerths(workerUrl, "LOC-001");
      berthLayers = maps.addBerthLayers(map, berths, {
        addToMap: true,
        geometryIndex: berthGeometryIndex,
        onSelect: showBerthDetail
      });
    } catch (error) {
      berthLayers = { group: L.layerGroup(), markers: [] };
      console.warn(error);
    }

    fillFilterOptions();
    restoreSettings();
    renderAreaList();
    wireControls();
    applyLayerSettings();

    if (areaLayers.bounds.isValid()) map.fitBounds(areaLayers.bounds.pad(0.08));

    map.on("zoomend", () => {
      renderMapData();
    });

    showSelectedPhoto();

    const indexNote = locationIndexSchemaVersion >= 3
      ? `${sightings.length} bestätigte Sichtungen`
      : locationIndexSchemaVersion >= 2
        ? `${sightings.length} bestätigte Sichtungen · Rebuild für Zusatzfoto-Bezüge ausführen`
        : "Kartenindex noch ohne Sichtungsebene – Rebuild ausführen";

    status.textContent =
      `${areas.length} Bereiche · ${berths.length} Anlegestellen · ` +
      `${photos.length} Fotoorte · ${indexNote}.`;
  } catch (error) {
    status.textContent = error instanceof Error ? error.message : String(error);
    status.classList.add("error");
  }
})();
