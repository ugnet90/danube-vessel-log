/*
 * Danube Vessel Log
 * File: docs/js/location_areas.js
 * Version: 0.14.40
 * Updated: 2026-08-20
 */

"use strict";

(async function () {
  const maps = window.DanubeLocationMap;
  const status = document.getElementById("locationAreasStatus");
  const list = document.getElementById("locationAreasList");
  const selectedPhotoCard = document.getElementById("selectedPhotoCard");
  const showAreas = document.getElementById("showAreas");
  const showBerths = document.getElementById("showBerths");
  const showPhotos = document.getElementById("showPhotos");
  const showVesselBerths = document.getElementById("showVesselBerths");
  const showVertices = document.getElementById("showVertices");
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

  if (!maps || !window.L) {
    status.textContent = "Die Kartenbibliothek konnte nicht geladen werden.";
    status.classList.add("error");
    return;
  }

  const workerUrl = String(
    window.VesselConfig?.workerUrl ?? ""
  ).trim();

  let map;
  let areas = [];
  let photos = [];
  let sightings = [];
  let locationIndexSchemaVersion = 0;
  let berths = [];
  let areaLayers;
  let berthLayers;
  let photoLayer = L.layerGroup();
  let vesselBerthLayer = L.layerGroup();
  let connectionLayer = L.layerGroup();
  let selectedPhotoLayer = null;

  function selectedPhotoFromQuery() {
    const params = new URLSearchParams(window.location.search);
    const coords = maps.validCoordinates(
      params.get("lat"),
      params.get("lon")
    );
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
    const vesselKey = String(
      sighting?.vessel_id || sighting?.vessel_name || ""
    ).trim();

    if (
      vesselFilter.value &&
      vesselKey !== vesselFilter.value
    ) {
      return false;
    }

    /*
     * Sobald explizit nach einer Fotoart gefiltert wird,
     * wird eine Schiffsposition nur dann gezeigt, wenn mindestens
     * ein aktuell sichtbares Foto genau zu dieser Sichtung gehört.
     * Damit können auch nachträglich zugeordnete Zusatzfotos
     * ihren Sichtungs-/Schiffspunkt einblenden.
     */
    if (sourceFilter.value) {
      const submissionId = String(
        sighting?.submission_id || ""
      ).trim();

      return Boolean(submissionId) && photos.some(photo =>
        String(photo?.submission_id || "").trim() === submissionId &&
        photoMatches(photo)
      );
    }

    if (
      areaFilter.value &&
      String(sighting?.location?.name || "") !==
        areaFilter.value
    ) {
      return false;
    }

    const day = maps.localDateKey(sighting?.captured_at);
    if (dateFrom.value && (!day || day < dateFrom.value)) {
      return false;
    }
    if (dateTo.value && (!day || day > dateTo.value)) {
      return false;
    }

    return true;
  }

  function renderPhotos() {
    photoLayer.clearLayers();
    const visiblePhotos = photos.filter(photoMatches);

    for (const photo of visiblePhotos) {
      const marker = maps.createPhotoMarker(map, photo, {
        addToMap: false,
        labelMode: labelMode.value
      });
      if (marker) marker.addTo(photoLayer);
    }

    setLayerVisible(photoLayer, showPhotos.checked);
    photoCount.textContent = `${visiblePhotos.length} ${visiblePhotos.length === 1 ? "Foto" : "Fotos"}`;
    return visiblePhotos;
  }

  function berthById() {
    return new Map(
      berths
        .filter(berth => String(berth?.berth_id || "").trim())
        .map(berth => [String(berth.berth_id).trim(), berth])
    );
  }

  function vesselBerthRecords() {
    const berthLookup = berthById();

    return sightings
      .filter(sightingMatches)
      .filter(sighting =>
        String(sighting?.movement || "") === "moored"
      )
      .map(sighting => {
        const berthId = String(
          sighting?.berth?.id || ""
        ).trim();

        if (!berthId || !berthLookup.has(berthId)) {
          return null;
        }

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

  function renderConnections(entries, visiblePhotos) {
    connectionLayer.clearLayers();
    let renderedCount = 0;

    const bySubmission = new Map(
      entries
        .map(entry => [
          String(entry?.record?.submission_id || "").trim(),
          entry
        ])
        .filter(([submissionId]) => Boolean(submissionId))
    );

    for (const photo of visiblePhotos) {
      const submissionId = String(
        photo?.submission_id || ""
      ).trim();
      if (!submissionId || !bySubmission.has(submissionId)) {
        continue;
      }

      const entry = bySubmission.get(submissionId);
      const photoCoordinates = maps.validCoordinates(
        photo?.photo_lat,
        photo?.photo_lon
      );
      const berthCoordinates = maps.validCoordinates(
        entry?.berth?.latitude,
        entry?.berth?.longitude
      );
      if (!photoCoordinates || !berthCoordinates) continue;

      const vesselName =
        entry?.record?.vessel_name ||
        entry?.record?.vessel_id ||
        "Schiff";
      const berthName =
        entry?.berth?.short_name ||
        entry?.berth?.public_name ||
        entry?.record?.berth?.short_name ||
        entry?.record?.berth?.name ||
        "Anlegestelle";

      const line = maps.createPhotoVesselConnection(
        map,
        photoCoordinates,
        berthCoordinates,
        {
          addToMap: false,
          color: "#0f4c81",
          weight: 2.4,
          opacity: 0.9,
          dashArray: "6 6",
          tooltip:
            `${vesselName}: Foto-Aufnahmeort → ${berthName}`
        }
      );

      if (line) {
        line.addTo(connectionLayer);
        renderedCount += 1;
      }
    }

    setLayerVisible(
      connectionLayer,
      showPhotos.checked && showVesselBerths.checked
    );

    if (connectionCount) {
      connectionCount.textContent =
        `${renderedCount} ${renderedCount === 1 ? "Verbindung" : "Verbindungen"}`;
    }
  }

  function renderVesselBerths(visiblePhotos) {
    vesselBerthLayer.clearLayers();
    const entries = vesselBerthRecords();

    const groups = new Map();
    for (const entry of entries) {
      const berthId = String(
        entry?.record?.berth_id || ""
      ).trim();
      if (!berthId) continue;
      if (!groups.has(berthId)) groups.set(berthId, []);
      groups.get(berthId).push(entry);
    }

    for (const groupedEntries of groups.values()) {
      const berth = groupedEntries[0]?.berth;
      let marker = null;

      if (groupedEntries.length === 1) {
        marker = maps.createVesselBerthMarker(
          map,
          groupedEntries[0].record,
          berth,
          { addToMap: false }
        );
      } else {
        marker = maps.createVesselBerthGroupMarker(
          map,
          groupedEntries.map(entry => entry.record),
          berth,
          {
            addToMap: false,
            spiderfy: true
          }
        );
      }

      if (marker) marker.addTo(vesselBerthLayer);
    }

    setLayerVisible(
      vesselBerthLayer,
      showVesselBerths.checked
    );

    renderConnections(entries, visiblePhotos);

    const uniqueVessels = new Set(
      entries
        .map(entry => String(
          entry?.record?.vessel_id ||
          entry?.record?.vessel_name ||
          ""
        ).trim())
        .filter(Boolean)
    ).size;

    vesselBerthCount.textContent =
      `${entries.length} ${entries.length === 1 ? "Anlege-Sichtung" : "Anlege-Sichtungen"} · ` +
      `${uniqueVessels} ${uniqueVessels === 1 ? "Schiff" : "Schiffe"}`;
  }

  function renderMapData() {
    const visiblePhotos = renderPhotos();
    renderVesselBerths(visiblePhotos);
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

    selectedPhotoLayer = maps.createPhotoMarker(map, {
      ...photo,
      vessel_name: "Ausgewähltes Foto",
      location: { name: inferred }
    }, {
      color: "#991b1b",
      fillColor: "#ffffff",
      radius: 9,
      weight: 4
    });

    if (selectedPhotoLayer) {
      map.setView([photo.photo_lat, photo.photo_lon], 18);
      selectedPhotoLayer.openPopup();
    }
  }

  function setMapFullscreen(active) {
    if (!mapCard || !fullscreenButton) return;

    mapCard.classList.toggle("is-fullscreen", active);
    document.body.classList.toggle(
      "location-map-fullscreen",
      active
    );

    fullscreenButton.textContent = active
      ? "Vollbild schließen"
      : "Vollbild";
    fullscreenButton.setAttribute(
      "aria-pressed",
      active ? "true" : "false"
    );

    window.setTimeout(() => {
      map?.invalidateSize();
    }, 40);
  }

  function wireControls() {
    showAreas.addEventListener("change", () => setLayerVisible(areaLayers.group, showAreas.checked));
    showBerths.addEventListener("change", () => setLayerVisible(berthLayers?.group, showBerths.checked));
    showPhotos.addEventListener("change", renderMapData);
    showVesselBerths.addEventListener("change", renderMapData);
    showVertices.addEventListener("change", () => setLayerVisible(areaLayers.vertexGroup, showVertices.checked));

    [vesselFilter, areaFilter, sourceFilter, dateFrom, dateTo, labelMode]
      .forEach(control => control.addEventListener("change", renderMapData));

    resetFilters.addEventListener("click", () => {
      vesselFilter.value = "";
      areaFilter.value = "";
      sourceFilter.value = "";
      dateFrom.value = "";
      dateTo.value = "";
      labelMode.value = "none";
      renderMapData();
    });

    if (fullscreenButton && mapCard) {
      fullscreenButton.addEventListener("click", () => {
        setMapFullscreen(
          !mapCard.classList.contains("is-fullscreen")
        );
      });

      document.addEventListener("keydown", event => {
        if (
          event.key === "Escape" &&
          mapCard.classList.contains("is-fullscreen")
        ) {
          setMapFullscreen(false);
        }
      });
    }
  }

  try {
    map = maps.createMap(document.getElementById("locationAreasMap"));

    const [loadedAreas, locationIndex] = await Promise.all([
      maps.loadAreas(),
      maps.loadLocationIndex().catch(() => ({
        schema_version: 0,
        photos: [],
        sightings: []
      }))
    ]);

    areas = loadedAreas;
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
      berthLayers = maps.addBerthLayers(map, berths, { addToMap: true });
    } catch (error) {
      berthLayers = { group: L.layerGroup(), markers: [] };
      console.warn(error);
    }

    fillFilterOptions();
    renderAreaList();
    renderMapData();
    wireControls();

    if (areaLayers.bounds.isValid()) {
      map.fitBounds(areaLayers.bounds.pad(0.08));
    }

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
