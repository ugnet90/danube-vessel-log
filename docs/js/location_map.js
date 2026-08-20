/*
 * Danube Vessel Log
 * File: docs/js/location_map.js
 * Version: 0.14.35
 * Updated: 2026-08-20
 *
 * Gemeinsame Kartenlogik für Standortseite und Foto-Kartenoverlay.
 */

"use strict";

(function () {
  const AREA_DATA_URL = "data/location_areas.geojson";
  const PHOTO_DATA_URL = "data/photo_locations.json";
  const AREA_COLORS = [
    "#d7191c",
    "#2c7bb6",
    "#fdae61",
    "#7b3294",
    "#1a9641"
  ];

  function requireLeaflet() {
    if (!window.L) {
      throw new Error(
        "Die Kartenbibliothek Leaflet konnte nicht geladen werden."
      );
    }
  }

  function parseCoordinate(value, minimum, maximum) {
    const parsed = Number(
      String(value ?? "")
        .trim()
        .replace(",", ".")
    );

    return (
      Number.isFinite(parsed) &&
      parsed >= minimum &&
      parsed <= maximum
    )
      ? parsed
      : null;
  }

  function validCoordinates(latitudeValue, longitudeValue) {
    const latitude = parseCoordinate(latitudeValue, -90, 90);
    const longitude = parseCoordinate(longitudeValue, -180, 180);

    if (
      latitude === null ||
      longitude === null ||
      (latitude === 0 && longitude === 0)
    ) {
      return null;
    }

    return { latitude, longitude };
  }

  function formatDateTime(valueText) {
    if (!valueText) return "";

    const date = new Date(valueText);
    if (Number.isNaN(date.getTime())) {
      return String(valueText);
    }

    return new Intl.DateTimeFormat("de-AT", {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(date);
  }

  function formatDate(valueText) {
    if (!valueText) return "";

    const date = new Date(valueText);
    if (Number.isNaN(date.getTime())) {
      return String(valueText);
    }

    return new Intl.DateTimeFormat("de-AT", {
      dateStyle: "medium"
    }).format(date);
  }

  function localDateKey(valueText) {
    if (!valueText) return "";
    const date = new Date(valueText);
    if (Number.isNaN(date.getTime())) return "";

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  async function fetchJson(url) {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`${url}: HTTP ${response.status}`);
    }
    return response.json();
  }

  async function loadAreas() {
    const data = await fetchJson(AREA_DATA_URL);
    const features = Array.isArray(data?.features)
      ? data.features
      : [];

    if (features.length === 0) {
      throw new Error("Keine Standortpolygone vorhanden.");
    }

    return features;
  }

  async function loadPhotoLocations() {
    const data = await fetchJson(PHOTO_DATA_URL);
    return Array.isArray(data?.photos)
      ? data.photos
      : [];
  }

  async function loadBerths(workerUrl, locationId = "") {
    const normalizedWorkerUrl = String(workerUrl ?? "")
      .trim()
      .replace(/\/+$/, "");

    if (!normalizedWorkerUrl) {
      throw new Error("Die Worker-URL fehlt.");
    }

    const params = new URLSearchParams();
    if (locationId) {
      params.set("location_id", locationId);
    }

    const response = await fetch(
      normalizedWorkerUrl +
      "/berths" +
      (params.toString() ? `?${params.toString()}` : ""),
      { cache: "no-store" }
    );

    const body = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(
        body?.error || `Anlegestellen: HTTP ${response.status}`
      );
    }

    return Array.isArray(body?.berths)
      ? body.berths
      : [];
  }

  function createMap(container, options = {}) {
    requireLeaflet();

    const map = L.map(container, {
      zoomControl: true,
      preferCanvas: true,
      ...(options.leafletOptions || {})
    });

    L.tileLayer(
      "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
      {
        maxZoom: 20,
        attribution: "&copy; OpenStreetMap contributors"
      }
    ).addTo(map);

    const center = Array.isArray(options.center)
      ? options.center
      : [48.3092, 14.2854];

    map.setView(center, options.zoom || 16);
    return map;
  }

  function pointOnSegment(longitude, latitude, left, right) {
    const x1 = Number(left?.[0]);
    const y1 = Number(left?.[1]);
    const x2 = Number(right?.[0]);
    const y2 = Number(right?.[1]);

    if (![x1, y1, x2, y2].every(Number.isFinite)) {
      return false;
    }

    const cross =
      (longitude - x1) * (y2 - y1) -
      (latitude - y1) * (x2 - x1);

    if (Math.abs(cross) > 1e-10) {
      return false;
    }

    return (
      longitude >= Math.min(x1, x2) - 1e-10 &&
      longitude <= Math.max(x1, x2) + 1e-10 &&
      latitude >= Math.min(y1, y2) - 1e-10 &&
      latitude <= Math.max(y1, y2) + 1e-10
    );
  }

  function pointInRing(longitude, latitude, ring) {
    if (!Array.isArray(ring) || ring.length < 3) {
      return false;
    }

    let inside = false;

    for (
      let index = 0, previous = ring.length - 1;
      index < ring.length;
      previous = index, index += 1
    ) {
      const currentPoint = ring[index];
      const previousPoint = ring[previous];

      if (
        pointOnSegment(
          longitude,
          latitude,
          previousPoint,
          currentPoint
        )
      ) {
        return true;
      }

      const currentLon = Number(currentPoint?.[0]);
      const currentLat = Number(currentPoint?.[1]);
      const previousLon = Number(previousPoint?.[0]);
      const previousLat = Number(previousPoint?.[1]);

      if (
        ![
          currentLon,
          currentLat,
          previousLon,
          previousLat
        ].every(Number.isFinite)
      ) {
        continue;
      }

      const crosses =
        (currentLat > latitude) !==
        (previousLat > latitude);

      if (!crosses) continue;

      const intersectionLongitude =
        ((previousLon - currentLon) *
          (latitude - currentLat)) /
          (previousLat - currentLat) +
        currentLon;

      if (longitude < intersectionLongitude) {
        inside = !inside;
      }
    }

    return inside;
  }

  function pointInPolygon(longitude, latitude, rings) {
    if (!Array.isArray(rings) || rings.length === 0) {
      return false;
    }

    if (!pointInRing(longitude, latitude, rings[0])) {
      return false;
    }

    return !rings.slice(1).some(
      hole => pointInRing(longitude, latitude, hole)
    );
  }

  function pointInFeature(longitude, latitude, feature) {
    const geometry = feature?.geometry;
    const coordinates = geometry?.coordinates;

    if (geometry?.type === "Polygon") {
      return pointInPolygon(longitude, latitude, coordinates);
    }

    if (geometry?.type === "MultiPolygon") {
      return Array.isArray(coordinates) &&
        coordinates.some(
          polygon => pointInPolygon(longitude, latitude, polygon)
        );
    }

    return false;
  }

  function matchingAreas(features, latitude, longitude) {
    return (Array.isArray(features) ? features : [])
      .filter(feature =>
        pointInFeature(longitude, latitude, feature)
      )
      .sort((left, right) =>
        Number(right?.properties?.priority ?? 0) -
        Number(left?.properties?.priority ?? 0)
      );
  }

  function areaName(feature) {
    return (
      feature?.properties?.public_name ||
      feature?.properties?.name ||
      "Standortbereich"
    );
  }

  function areaPopupContent(properties) {
    const container = document.createElement("div");
    container.className = "location-area-popup";

    const title = document.createElement("strong");
    title.textContent =
      properties?.public_name ||
      properties?.name ||
      "Standortbereich";

    const priority = document.createElement("div");
    priority.textContent =
      `Priorität: ${properties?.priority ?? "–"}`;

    container.append(title, priority);

    if (properties?.description) {
      const description = document.createElement("p");
      description.textContent = properties.description;
      container.append(description);
    }

    return container;
  }

  function addAreaLayers(map, features, options = {}) {
    requireLeaflet();

    const group = L.layerGroup();
    const vertexGroup = L.layerGroup();
    const bounds = L.latLngBounds();
    const entries = [];

    (features || []).forEach((feature, index) => {
      const color =
        options.colors?.[index % options.colors.length] ||
        AREA_COLORS[index % AREA_COLORS.length];

      const layer = L.geoJSON(feature, {
        style: {
          color,
          weight: options.weight ?? 4,
          opacity: 1,
          fillColor: color,
          fillOpacity: options.fillOpacity ?? 0.25
        }
      });

      layer.bindPopup(
        areaPopupContent(feature.properties)
      );

      layer.eachLayer(child => {
        if (typeof child.getBounds === "function") {
          bounds.extend(child.getBounds());
        }
      });

      layer.addTo(group);

      const ring = feature?.geometry?.coordinates?.[0];
      if (Array.isArray(ring)) {
        const points = (
          ring.length > 1 &&
          ring[0][0] === ring[ring.length - 1][0] &&
          ring[0][1] === ring[ring.length - 1][1]
        )
          ? ring.slice(0, -1)
          : ring;

        points.forEach((coordinate, vertexIndex) => {
          const coords = validCoordinates(
            coordinate?.[1],
            coordinate?.[0]
          );
          if (!coords) return;

          const marker = L.marker(
            [coords.latitude, coords.longitude],
            {
              icon: L.divIcon({
                className: "",
                html:
                  '<div class="location-area-vertex-label" ' +
                  `style="border-color:${color}">` +
                  `${vertexIndex + 1}</div>`,
                iconSize: [24, 24],
                iconAnchor: [12, 12]
              })
            }
          );

          marker.bindPopup(
            `<strong>${areaName(feature)} – Eckpunkt ${vertexIndex + 1}</strong><br>` +
            `Breitengrad: ${coords.latitude.toFixed(7)}<br>` +
            `Längengrad: ${coords.longitude.toFixed(7)}`
          );

          marker.addTo(vertexGroup);
        });
      }

      entries.push({ feature, layer, color });
    });

    if (options.addToMap !== false) {
      group.addTo(map);
    }

    return { group, vertexGroup, bounds, entries };
  }

  function berthPopup(berth) {
    const container = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent =
      berth?.short_name ||
      berth?.public_name ||
      berth?.name ||
      "Anlegestelle";
    container.append(title);

    const lines = [
      berth?.station_number
        ? `Station: ${berth.station_number}`
        : "",
      berth?.river_km_text
        ? `Donau-km: ${berth.river_km_text}`
        : (
          Number.isFinite(Number(berth?.river_km))
            ? `Donau-km: ${berth.river_km}`
            : ""
        ),
      berth?.bank
        ? `Ufer: ${berth.bank === "right" ? "rechts" : berth.bank === "left" ? "links" : berth.bank}`
        : "",
      berth?.facility_type
        ? `Typ: ${berth.facility_type}`
        : "",
      berth?.access_type
        ? `Zugang: ${berth.access_type}`
        : ""
    ].filter(Boolean);

    lines.forEach(line => {
      const div = document.createElement("div");
      div.textContent = line;
      container.append(div);
    });

    return container;
  }

  function addBerthLayers(map, berths, options = {}) {
    requireLeaflet();
    const group = L.layerGroup();
    const bounds = L.latLngBounds();
    const markers = [];

    (berths || []).forEach(berth => {
      const coords = validCoordinates(
        berth?.latitude,
        berth?.longitude
      );
      if (!coords) return;

      const label = String(
        berth?.station_number ||
        berth?.short_name ||
        "⚓"
      );

      const marker = L.marker(
        [coords.latitude, coords.longitude],
        {
          icon: L.divIcon({
            className: "",
            html:
              '<div class="berth-map-marker">⚓' +
              (berth?.station_number
                ? `<span>${berth.station_number}</span>`
                : "") +
              "</div>",
            iconSize: [34, 34],
            iconAnchor: [17, 17]
          })
        }
      );

      marker.bindPopup(berthPopup(berth));
      marker.bindTooltip(
        berth?.short_name ||
        berth?.public_name ||
        label,
        { direction: "top" }
      );
      marker.addTo(group);
      bounds.extend([coords.latitude, coords.longitude]);
      markers.push({ marker, berth });
    });

    if (options.addToMap !== false) {
      group.addTo(map);
    }

    return { group, bounds, markers };
  }

  function photoLabel(photo, mode = "none") {
    const vessel = String(
      photo?.vessel_name || photo?.vessel_id || ""
    ).trim();
    const date = formatDate(photo?.captured_at);

    if (mode === "vessel") return vessel;
    if (mode === "date") return date;
    if (mode === "sighting") return String(photo?.submission_id || "").trim();
    if (mode === "vessel-date") {
      return [vessel, date].filter(Boolean).join(" · ");
    }
    return "";
  }

  function photoPopup(photo) {
    const container = document.createElement("div");
    container.className = "photo-location-popup";

    const title = document.createElement("strong");
    title.textContent =
      photo?.vessel_name ||
      photo?.vessel_id ||
      "Fotoaufnahme";
    container.append(title);

    const addLine = text => {
      if (!text) return;
      const line = document.createElement("div");
      line.textContent = text;
      container.append(line);
    };

    addLine(formatDateTime(photo?.captured_at));
    addLine(
      photo?.location?.name
        ? `Ort: ${photo.location.name}`
        : ""
    );
    addLine(
      photo?.source_type === "direct"
        ? "Typ: Zusätzliches Schiffsfoto"
        : "Typ: Sichtungsfoto"
    );
    addLine(
      photo?.submission_id
        ? `Sichtung: ${photo.submission_id}`
        : ""
    );

    if (photo?.vessel_id) {
      const link = document.createElement("a");
      link.href =
        `vessel.html?id=${encodeURIComponent(photo.vessel_id)}`;
      link.textContent = "Schiff öffnen";
      link.className = "map-popup-link";
      container.append(link);
    }

    return container;
  }

  function createPhotoMarker(map, photo, options = {}) {
    const coords = validCoordinates(
      photo?.photo_lat ?? photo?.latitude,
      photo?.photo_lon ?? photo?.longitude
    );
    if (!coords) return null;

    const marker = L.circleMarker(
      [coords.latitude, coords.longitude],
      {
        radius: options.radius ?? 7,
        color: options.color || "#111827",
        weight: options.weight ?? 2,
        fillColor: options.fillColor || "#facc15",
        fillOpacity: options.fillOpacity ?? 0.9
      }
    );

    marker.bindPopup(photoPopup(photo));

    const label = photoLabel(
      photo,
      options.labelMode || "none"
    );

    if (label) {
      marker.bindTooltip(label, {
        permanent: true,
        direction: "top",
        className: "photo-location-label"
      });
    }

    if (options.addToMap !== false) {
      marker.addTo(map);
    }

    return marker;
  }

  window.DanubeLocationMap = Object.freeze({
    AREA_COLORS,
    parseCoordinate,
    validCoordinates,
    formatDateTime,
    formatDate,
    localDateKey,
    loadAreas,
    loadPhotoLocations,
    loadBerths,
    createMap,
    matchingAreas,
    areaName,
    addAreaLayers,
    addBerthLayers,
    createPhotoMarker
  });
})();
