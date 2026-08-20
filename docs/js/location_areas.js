/*
 * Danube Vessel Log
 * File: docs/js/location_areas.js
 * Version: 0.14.35
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
  const showVertices = document.getElementById("showVertices");
  const vesselFilter = document.getElementById("photoVesselFilter");
  const areaFilter = document.getElementById("photoAreaFilter");
  const sourceFilter = document.getElementById("photoSourceFilter");
  const dateFrom = document.getElementById("photoDateFrom");
  const dateTo = document.getElementById("photoDateTo");
  const labelMode = document.getElementById("photoLabelMode");
  const resetFilters = document.getElementById("resetPhotoFilters");
  const photoCount = document.getElementById("photoCount");

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
  let berths = [];
  let areaLayers;
  let berthLayers;
  let photoLayer = L.layerGroup();
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

    photos.forEach(photo => {
      const id = String(photo?.vessel_id || "").trim();
      const name = String(photo?.vessel_name || id || "").trim();
      const key = id || name;
      if (key) vesselValues.set(key, name || key);
      const areaName = String(photo?.location?.name || "").trim();
      if (areaName) areaValues.add(areaName);
    });

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

  function wireControls() {
    showAreas.addEventListener("change", () => setLayerVisible(areaLayers.group, showAreas.checked));
    showBerths.addEventListener("change", () => setLayerVisible(berthLayers?.group, showBerths.checked));
    showPhotos.addEventListener("change", () => setLayerVisible(photoLayer, showPhotos.checked));
    showVertices.addEventListener("change", () => setLayerVisible(areaLayers.vertexGroup, showVertices.checked));

    [vesselFilter, areaFilter, sourceFilter, dateFrom, dateTo, labelMode]
      .forEach(control => control.addEventListener("change", renderPhotos));

    resetFilters.addEventListener("click", () => {
      vesselFilter.value = "";
      areaFilter.value = "";
      sourceFilter.value = "";
      dateFrom.value = "";
      dateTo.value = "";
      labelMode.value = "none";
      renderPhotos();
    });
  }

  try {
    map = maps.createMap(document.getElementById("locationAreasMap"));
    [areas, photos] = await Promise.all([
      maps.loadAreas(),
      maps.loadPhotoLocations().catch(() => [])
    ]);

    areaLayers = maps.addAreaLayers(map, areas, {
      addToMap: true,
      fillOpacity: 0.22,
      weight: 4
    });

    photoLayer.addTo(map);

    try {
      berths = await maps.loadBerths(workerUrl, "LOC-001");
      berthLayers = maps.addBerthLayers(map, berths, { addToMap: true });
    } catch (error) {
      berthLayers = { group: L.layerGroup(), markers: [] };
      console.warn(error);
    }

    fillFilterOptions();
    renderAreaList();
    renderPhotos();
    wireControls();

    if (areaLayers.bounds.isValid()) {
      map.fitBounds(areaLayers.bounds.pad(0.08));
    }

    showSelectedPhoto();

    status.textContent = `${areas.length} Bereiche · ${berths.length} Anlegestellen · ${photos.length} Fotoorte geladen.`;
  } catch (error) {
    status.textContent = error instanceof Error ? error.message : String(error);
    status.classList.add("error");
  }
})();
