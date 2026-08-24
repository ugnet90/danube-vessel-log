/*
 * Danube Vessel Log
 * File: docs/js/location_map.js
 * Version: 0.15.4
 * Updated: 2026-08-24
 *
 * Gemeinsame Kartenlogik für Standortseite und Foto-Kartenoverlay.
 */

"use strict";

(function () {
  const AREA_DATA_URL = "data/location_areas.geojson";
  const PHOTO_DATA_URL = "data/photo_locations.json";
  const BERTH_GEOMETRY_URL = "data/berth_geometries.geojson";
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

  async function loadLocationIndex() {
    const data = await fetchJson(PHOTO_DATA_URL);

    return {
      schema_version: Number(data?.schema_version || 0),
      photos: Array.isArray(data?.photos)
        ? data.photos
        : [],
      sightings: Array.isArray(data?.sightings)
        ? data.sightings
        : []
    };
  }

  async function loadPhotoLocations() {
    const index = await loadLocationIndex();
    return index.photos;
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


  async function loadBerthGeometries() {
    const data = await fetchJson(BERTH_GEOMETRY_URL);
    return Array.isArray(data?.features) ? data.features : [];
  }

  function indexBerthGeometries(features) {
    const index = new Map();

    (Array.isArray(features) ? features : []).forEach(feature => {
      const berthId = String(feature?.properties?.berth_id || "").trim();
      const role = String(feature?.properties?.geometry_role || "").trim();
      const type = String(feature?.geometry?.type || "").trim();
      if (!berthId) return;

      if (!index.has(berthId)) {
        index.set(berthId, {
          berth_id: berthId,
          polygon: null,
          mooringEdge: null
        });
      }

      const entry = index.get(berthId);
      if (role === "berth_polygon" && type === "Polygon") {
        entry.polygon = feature;
      } else if (role === "mooring_edge" && type === "LineString") {
        entry.mooringEdge = feature;
      }
    });

    return index;
  }

  function polygonCenterCoordinates(feature) {
    const ring = feature?.geometry?.type === "Polygon"
      ? feature.geometry.coordinates?.[0]
      : null;
    if (!Array.isArray(ring) || ring.length < 3) return null;

    const points = ring.slice(
      0,
      ring.length > 1 &&
      ring[0]?.[0] === ring[ring.length - 1]?.[0] &&
      ring[0]?.[1] === ring[ring.length - 1]?.[1]
        ? -1
        : undefined
    );
    if (!points.length) return null;

    const valid = points
      .map(point => validCoordinates(point?.[1], point?.[0]))
      .filter(Boolean);
    if (!valid.length) return null;

    // Shoelace-Formel relativ zu einem lokalen Ursprung. Die Koordinaten
    // der kleinen Anlegerpolygone unterscheiden sich nur im Bereich
    // weniger 1e-4 Grad; mit absoluten WGS84-Werten würde die Subtraktion
    // großer, fast gleicher Zahlen unnötig Präzision verlieren.
    const originLongitude = valid[0].longitude;
    const originLatitude = valid[0].latitude;
    let twiceArea = 0;
    let centroidX = 0;
    let centroidY = 0;

    for (let index = 0; index < valid.length; index += 1) {
      const current = valid[index];
      const next = valid[(index + 1) % valid.length];
      const x1 = current.longitude - originLongitude;
      const y1 = current.latitude - originLatitude;
      const x2 = next.longitude - originLongitude;
      const y2 = next.latitude - originLatitude;
      const cross = x1 * y2 - x2 * y1;
      twiceArea += cross;
      centroidX += (x1 + x2) * cross;
      centroidY += (y1 + y2) * cross;
    }

    if (Math.abs(twiceArea) > 1e-18) {
      return validCoordinates(
        originLatitude + centroidY / (3 * twiceArea),
        originLongitude + centroidX / (3 * twiceArea)
      );
    }

    return {
      latitude: valid.reduce((sum, point) => sum + point.latitude, 0) / valid.length,
      longitude: valid.reduce((sum, point) => sum + point.longitude, 0) / valid.length
    };
  }


  function lineMidpointCoordinates(feature) {
    const coordinates = feature?.geometry?.type === "LineString"
      ? feature.geometry.coordinates
      : null;
    if (!Array.isArray(coordinates) || coordinates.length < 2) return null;

    const valid = coordinates
      .map(point => validCoordinates(point?.[1], point?.[0]))
      .filter(Boolean);
    if (valid.length < 2) return null;

    const referenceLatitude =
      valid.reduce((sum, point) => sum + point.latitude, 0) / valid.length;
    const cosine = Math.cos(referenceLatitude * Math.PI / 180);

    const segments = [];
    let total = 0;

    for (let index = 0; index < valid.length - 1; index += 1) {
      const start = valid[index];
      const end = valid[index + 1];
      const dx = (end.longitude - start.longitude) * cosine;
      const dy = end.latitude - start.latitude;
      const length = Math.hypot(dx, dy);
      segments.push({ start, end, length });
      total += length;
    }

    if (!(total > 0)) return valid[0];

    const target = total / 2;
    let walked = 0;

    for (const segment of segments) {
      if (walked + segment.length >= target) {
        const ratio = segment.length
          ? (target - walked) / segment.length
          : 0;
        return {
          latitude:
            segment.start.latitude +
            (segment.end.latitude - segment.start.latitude) * ratio,
          longitude:
            segment.start.longitude +
            (segment.end.longitude - segment.start.longitude) * ratio
        };
      }
      walked += segment.length;
    }

    return valid[valid.length - 1];
  }

  function berthGeometryEntry(geometryIndex, berth) {
    const berthId = String(berth?.berth_id || berth || "").trim();
    if (!berthId || !(geometryIndex instanceof Map)) return null;
    return geometryIndex.get(berthId) || null;
  }

  function berthAnchorCoordinates(geometryIndex, berth) {
    const entry = berthGeometryEntry(geometryIndex, berth);
    return (
      lineMidpointCoordinates(entry?.mooringEdge) ||
      polygonCenterCoordinates(entry?.polygon) ||
      validCoordinates(berth?.latitude, berth?.longitude)
    );
  }

  function normalizeAlongsidePosition(value) {
    if (value === null || value === undefined || value === "") return null;
    const position = Number(String(value).trim());
    return Number.isInteger(position) && position >= 1 && position <= 3
      ? position
      : null;
  }

  function alongsidePositionLabel(value, options = {}) {
    const position = normalizeAlongsidePosition(value);
    if (!position) return options.unknownLabel || "Liegeposition unbekannt";
    if (position === 1) return "Position 1 · direkt am Anleger";
    if (position === 2) return "Position 2 · zweite Reihe";
    return "Position 3 · dritte Reihe";
  }

  function vesselDisplayDistanceMeters(options = {}) {
    const position = normalizeAlongsidePosition(options.alongsidePosition);
    if (!position) {
      return Math.max(0, Number(options.distanceMeters ?? 10) || 10);
    }

    const fallbackWidth = Math.max(6, Number(options.defaultVesselWidthM ?? 11.5) || 11.5);
    const ownWidth = Math.max(4, Number(options.vesselWidthM ?? fallbackWidth) || fallbackWidth);
    const gap = Math.max(0, Number(options.gapMeters ?? 1) || 0);

    // Ohne Kenntnis der gleichzeitig innen liegenden Schiffe werden
    // Position 2/3 als feste parallele Reihen modelliert. Die eigene
    // Schiffsbreite beeinflusst die Lage des Mittelpunktes; für die
    // innenliegenden Reihen wird die typische Donau-Kabinenschiffsbreite
    // verwendet. Es wird ausdrücklich keine Gleichzeitigkeit historischer
    // Sichtungen abgeleitet.
    return gap + ownWidth / 2 + (position - 1) * (fallbackWidth + gap);
  }

  function berthRiverwardDisplayCoordinates(
    map,
    berth,
    geometryIndex,
    options = {}
  ) {
    const entry = berthGeometryEntry(geometryIndex, berth);
    const anchor =
      lineMidpointCoordinates(entry?.mooringEdge) ||
      validCoordinates(berth?.latitude, berth?.longitude);
    if (!anchor || !map) return anchor;

    const polygonCenter = polygonCenterCoordinates(entry?.polygon);
    if (!polygonCenter) return anchor;

    const anchorLatLng = L.latLng(anchor.latitude, anchor.longitude);
    const anchorPoint = map.latLngToLayerPoint(anchorLatLng);
    const polygonPoint = map.latLngToLayerPoint([
      polygonCenter.latitude,
      polygonCenter.longitude
    ]);

    let dx = anchorPoint.x - polygonPoint.x;
    let dy = anchorPoint.y - polygonPoint.y;
    const vectorLength = Math.hypot(dx, dy);
    if (!(vectorLength > 0.001)) return anchor;

    dx /= vectorLength;
    dy /= vectorLength;

    const distanceMeters = vesselDisplayDistanceMeters(options);

    const probePixels = 100;
    const probeLatLng = map.layerPointToLatLng(
      L.point(
        anchorPoint.x + dx * probePixels,
        anchorPoint.y + dy * probePixels
      )
    );
    const metersPerPixel =
      map.distance(anchorLatLng, probeLatLng) / probePixels;
    const pixelDistance = metersPerPixel > 0
      ? distanceMeters / metersPerPixel
      : 0;

    const displayPoint = L.point(
      anchorPoint.x + dx * pixelDistance,
      anchorPoint.y + dy * pixelDistance
    );
    const displayLatLng = map.layerPointToLatLng(displayPoint);

    return {
      latitude: displayLatLng.lat,
      longitude: displayLatLng.lng
    };
  }

  function berthMooringAxis(map, berth, geometryIndex) {
    const entry = berthGeometryEntry(geometryIndex, berth);
    const coordinates = entry?.mooringEdge?.geometry?.type === "LineString"
      ? entry.mooringEdge.geometry.coordinates
      : null;
    if (!map || !Array.isArray(coordinates) || coordinates.length < 2) return null;

    const first = validCoordinates(coordinates[0]?.[1], coordinates[0]?.[0]);
    const last = validCoordinates(
      coordinates[coordinates.length - 1]?.[1],
      coordinates[coordinates.length - 1]?.[0]
    );
    if (!first || !last) return null;

    const startPoint = map.latLngToLayerPoint([first.latitude, first.longitude]);
    const endPoint = map.latLngToLayerPoint([last.latitude, last.longitude]);
    let dx = endPoint.x - startPoint.x;
    let dy = endPoint.y - startPoint.y;
    const length = Math.hypot(dx, dy);
    if (!(length > 0.001)) return null;

    dx /= length;
    dy /= length;
    return {
      ux: dx,
      uy: dy,
      nx: -dy,
      ny: dx,
      axisDirection: String(
        entry?.mooringEdge?.properties?.axis_direction || ""
      ).trim()
    };
  }

  function vesselBerthFootprintCoordinates(
    map,
    record,
    berth,
    geometryIndex,
    options = {}
  ) {
    const position = normalizeAlongsidePosition(record?.alongside_position);
    if (!position || !map) return null;

    const center = options.displayCoordinates
      ? validCoordinates(
          options.displayCoordinates.latitude,
          options.displayCoordinates.longitude
        )
      : berthRiverwardDisplayCoordinates(
          map,
          berth,
          geometryIndex,
          {
            alongsidePosition: position,
            vesselWidthM: record?.vessel_width_m,
            defaultVesselWidthM: options.defaultVesselWidthM ?? 11.5,
            gapMeters: options.gapMeters ?? 1
          }
        );
    if (!center) return null;

    const axis = berthMooringAxis(map, berth, geometryIndex);
    if (!axis) return null;

    const vesselLengthM = Math.min(
      250,
      Math.max(30, Number(record?.vessel_length_m ?? options.defaultVesselLengthM ?? 135) || 135)
    );
    const vesselWidthM = Math.min(
      35,
      Math.max(5, Number(record?.vessel_width_m ?? options.defaultVesselWidthM ?? 11.5) || 11.5)
    );

    const centerLatLng = L.latLng(center.latitude, center.longitude);
    const centerPoint = map.latLngToLayerPoint(centerLatLng);
    const probePixels = 100;
    const probeLatLng = map.layerPointToLatLng(
      L.point(centerPoint.x + probePixels, centerPoint.y)
    );
    const metersPerPixel = map.distance(centerLatLng, probeLatLng) / probePixels;
    if (!(metersPerPixel > 0)) return null;

    const halfLength = vesselLengthM / (2 * metersPerPixel);
    const halfWidth = vesselWidthM / (2 * metersPerPixel);

    const direction = String(record?.direction || "").trim().toLowerCase();
    const axisDirection = String(axis.axisDirection || "").trim().toLowerCase();
    let bowSign = 0;

    if (axisDirection === "downstream_to_upstream") {
      if (direction === "upstream") bowSign = 1;
      if (direction === "downstream") bowSign = -1;
    } else if (axisDirection === "upstream_to_downstream") {
      if (direction === "upstream") bowSign = -1;
      if (direction === "downstream") bowSign = 1;
    }

    // Bei bekannter Richtung: flaches Heck und zugespitzter Bug.
    // Bei unbekannter Richtung bleibt die bisherige neutrale, symmetrische
    // Form erhalten, damit keine nautische Ausrichtung erfunden wird.
    const localPoints = bowSign
      ? [
          [-halfLength * 0.48 * bowSign, -halfWidth],
          [ halfLength * 0.34 * bowSign, -halfWidth],
          [ halfLength * 0.50 * bowSign, 0],
          [ halfLength * 0.34 * bowSign,  halfWidth],
          [-halfLength * 0.48 * bowSign,  halfWidth]
        ]
      : [
          [-halfLength * 0.50, 0],
          [-halfLength * 0.43, -halfWidth],
          [ halfLength * 0.43, -halfWidth],
          [ halfLength * 0.50, 0],
          [ halfLength * 0.43,  halfWidth],
          [-halfLength * 0.43,  halfWidth]
        ];

    return localPoints.map(([along, across]) => {
      const point = L.point(
        centerPoint.x + axis.ux * along + axis.nx * across,
        centerPoint.y + axis.uy * along + axis.ny * across
      );
      const latLng = map.layerPointToLatLng(point);
      return [latLng.lat, latLng.lng];
    });
  }

  function createVesselBerthFootprint(
    map,
    record,
    berth,
    geometryIndex,
    options = {}
  ) {
    const coordinates = vesselBerthFootprintCoordinates(
      map,
      record,
      berth,
      geometryIndex,
      options
    );
    if (!coordinates) return null;

    const layer = L.polygon(coordinates, {
      color: options.color || "#0f4c81",
      weight: options.weight ?? 1.5,
      opacity: options.opacity ?? 0.75,
      fillColor: options.fillColor || "#93c5fd",
      fillOpacity: options.fillOpacity ?? 0.20,
      interactive: options.interactive === true
    });

    if (options.addToMap !== false) layer.addTo(map);
    return layer;
  }

  function createMap(container, options = {}) {
    requireLeaflet();

    const map = L.map(container, {
      zoomControl: true,
      preferCanvas: true,
      ...(options.leafletOptions || {})
    });

    // basemap.at dokumentiert das Orthofoto im TileMatrixSet
    // "google3857" (EPSG:3857) mit 256 x 256 px und der REST-Reihenfolge
    // {TileMatrix}/{TileRow}/{TileCol} = {z}/{y}/{x}. Die Optionen werden
    // hier absichtlich explizit gesetzt, damit Leaflet/iOS weder Retina-
    // Umschaltung noch eine implizite Zoom- oder Kachelskalierung anwendet.
    const basemapAtTileOptions = {
      tileSize: 256,
      zoomOffset: 0,
      minZoom: 6,
      maxNativeZoom: 20,
      maxZoom: 20,
      detectRetina: false,
      noWrap: true,
      bounds: L.latLngBounds(
        [46.35877, 8.782379],
        [49.037872, 17.5]
      )
    };

    function createBasemapAtLayer(path, extension, attribution) {
      const layer = L.tileLayer(
        `https://mapsneu.wien.gv.at/basemap/${path}/normal/google3857/{z}/{y}/{x}.${extension}`,
        {
          ...basemapAtTileOptions,
          attribution
        }
      );

      // Diagnose nur in der Browser-Konsole: Der Dienst liefert laut
      // TileMatrixSet 256-px-Kacheln. Eine abweichende Naturgröße wäre
      // ein Hinweis auf eine serverseitige Änderung des Dienstes.
      layer.on("tileload", event => {
        const tile = event?.tile;
        if (
          tile &&
          (tile.naturalWidth !== 256 || tile.naturalHeight !== 256)
        ) {
          console.warn(
            "basemap.at: unerwartete Kachelgröße",
            tile.naturalWidth,
            tile.naturalHeight
          );
        }
      });

      return layer;
    }

    const baseLayerFactories = {
      osm: () => [
        L.tileLayer(
          "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
          {
            tileSize: 256,
            zoomOffset: 0,
            // Der OSM-Standard-Tileserver liefert native Rasterkacheln nur
            // bis Zoom 19. Die Karte darf weiterhin bis Zoom 20 gehen;
            // Leaflet skaliert dort die Zoom-19-Kacheln hoch, statt nicht
            // vorhandene Zoom-20-Kacheln anzufordern.
            maxNativeZoom: 19,
            maxZoom: 20,
            detectRetina: false,
            attribution: "&copy; OpenStreetMap contributors"
          }
        )
      ],
      orthophoto: () => [
        createBasemapAtLayer(
          "bmaporthofoto30cm",
          "jpeg",
          'Datenquelle: <a href="https://basemap.at/" target="_blank" rel="noopener noreferrer">basemap.at</a>'
        )
      ],
      "orthophoto-labels": () => [
        createBasemapAtLayer(
          "bmaporthofoto30cm",
          "jpeg",
          'Datenquelle: <a href="https://basemap.at/" target="_blank" rel="noopener noreferrer">basemap.at</a>'
        ),
        createBasemapAtLayer(
          "bmapoverlay",
          "png",
          'Beschriftung: <a href="https://basemap.at/" target="_blank" rel="noopener noreferrer">basemap.at</a>'
        )
      ]
    };

    let activeBaseLayers = [];
    map._danubeSetBaseLayer = mode => {
      const normalized = Object.prototype.hasOwnProperty.call(baseLayerFactories, mode)
        ? mode
        : "osm";

      // Ein reiner Tile-Layer-Wechsel verändert in Leaflet weder Zentrum
      // noch Zoom. Deshalb hier bewusst kein getCenter()/setView(): Beim
      // ersten Kartenaufbau ist die Map vor dem initialen setView() noch
      // nicht geladen; getCenter() würde dann einen Fehler auslösen und
      // die gesamte Karteninitialisierung abbrechen.
      activeBaseLayers.forEach(layer => {
        if (map.hasLayer(layer)) map.removeLayer(layer);
      });

      activeBaseLayers = baseLayerFactories[normalized]();
      activeBaseLayers.forEach(layer => layer.addTo(map));
      map._danubeBaseLayerMode = normalized;

      return normalized;
    };

    map._danubeSetBaseLayer(options.baseLayerMode || "osm");

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

  function pointToSegmentDistanceMeters(
    longitude,
    latitude,
    startLongitude,
    startLatitude,
    endLongitude,
    endLatitude
  ) {
    const values = [
      longitude, latitude,
      startLongitude, startLatitude,
      endLongitude, endLatitude
    ].map(Number);
    if (!values.every(Number.isFinite)) return Number.POSITIVE_INFINITY;

    const latitudeRadians = latitude * Math.PI / 180;
    const metersPerDegreeLongitude = 111320 * Math.cos(latitudeRadians);
    const metersPerDegreeLatitude = 110540;
    const startX = (startLongitude - longitude) * metersPerDegreeLongitude;
    const startY = (startLatitude - latitude) * metersPerDegreeLatitude;
    const endX = (endLongitude - longitude) * metersPerDegreeLongitude;
    const endY = (endLatitude - latitude) * metersPerDegreeLatitude;
    const dx = endX - startX;
    const dy = endY - startY;
    const squaredLength = dx * dx + dy * dy;
    if (!(squaredLength > 0)) return Math.hypot(startX, startY);
    const ratio = Math.max(
      0,
      Math.min(1, -(startX * dx + startY * dy) / squaredLength)
    );
    return Math.hypot(startX + ratio * dx, startY + ratio * dy);
  }

  function pointToRingDistanceMeters(longitude, latitude, ring) {
    if (!Array.isArray(ring) || ring.length < 2) {
      return Number.POSITIVE_INFINITY;
    }
    let best = Number.POSITIVE_INFINITY;
    for (let index = 0; index < ring.length; index += 1) {
      const start = ring[index];
      const end = ring[(index + 1) % ring.length];
      if (!Array.isArray(start) || !Array.isArray(end)) continue;
      best = Math.min(
        best,
        pointToSegmentDistanceMeters(
          longitude, latitude,
          start[0], start[1], end[0], end[1]
        )
      );
    }
    return best;
  }

  function pointToFeatureDistanceMeters(longitude, latitude, feature) {
    if (pointInFeature(longitude, latitude, feature)) return 0;
    const geometry = feature?.geometry;
    const polygons = geometry?.type === "Polygon"
      ? [geometry.coordinates]
      : geometry?.type === "MultiPolygon"
        ? geometry.coordinates
        : [];
    let best = Number.POSITIVE_INFINITY;
    for (const polygon of Array.isArray(polygons) ? polygons : []) {
      best = Math.min(
        best,
        pointToRingDistanceMeters(longitude, latitude, polygon?.[0])
      );
    }
    return best;
  }

  function matchingAreas(features, latitude, longitude) {
    return (Array.isArray(features) ? features : [])
      .map(feature => {
        const exact = pointInFeature(longitude, latitude, feature);
        const toleranceM = Math.max(
          0,
          Number(feature?.properties?.match_tolerance_m ?? 0) || 0
        );
        const distanceM = exact
          ? 0
          : toleranceM > 0
            ? pointToFeatureDistanceMeters(longitude, latitude, feature)
            : Number.POSITIVE_INFINITY;
        return { feature, exact, distanceM, toleranceM };
      })
      .filter(item => item.exact || item.distanceM <= item.toleranceM)
      .sort((left, right) => {
        const priorityDifference =
          Number(right.feature?.properties?.priority ?? 0) -
          Number(left.feature?.properties?.priority ?? 0);
        return priorityDifference || left.distanceM - right.distanceM;
      })
      .map(item => item.feature);
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
    const geometryIndex = options.geometryIndex instanceof Map
      ? options.geometryIndex
      : indexBerthGeometries(options.geometries || []);

    (berths || []).forEach(berth => {
      const entry = berthGeometryEntry(geometryIndex, berth);
      const anchor = berthAnchorCoordinates(geometryIndex, berth);
      if (!anchor) return;

      const label = String(
        berth?.station_number ||
        berth?.short_name ||
        "⚓"
      );
      const tooltipText =
        berth?.short_name ||
        berth?.public_name ||
        label;

      const select = event => {
        if (typeof options.onSelect === "function") {
          options.onSelect({
            marker: marker,
            berth,
            event
          });
        }
      };

      let polygonLayer = null;
      let mooringEdgeLayer = null;

      if (entry?.polygon) {
        polygonLayer = L.geoJSON(entry.polygon, {
          style: {
            color: "#0f4c81",
            weight: 2,
            opacity: 0.95,
            fillColor: "#93c5fd",
            fillOpacity: 0.22
          }
        });
        polygonLayer.bindTooltip(tooltipText, {
          direction: "top",
          className: "berth-hover-tooltip"
        });
        if (typeof options.onSelect === "function") {
          polygonLayer.on("click", select);
        } else {
          polygonLayer.bindPopup(berthPopup(berth));
        }
        polygonLayer.addTo(group);
        const polygonBounds = polygonLayer.getBounds?.();
        if (polygonBounds?.isValid()) bounds.extend(polygonBounds);
      }

      if (entry?.mooringEdge) {
        mooringEdgeLayer = L.geoJSON(entry.mooringEdge, {
          style: {
            color: "#0f4c81",
            weight: 5,
            opacity: 0.96,
            lineCap: "round"
          }
        });
        mooringEdgeLayer.bindTooltip(
          `${tooltipText} · Liegekante`,
          {
            direction: "top",
            className: "berth-hover-tooltip"
          }
        );
        if (typeof options.onSelect === "function") {
          mooringEdgeLayer.on("click", select);
        } else {
          mooringEdgeLayer.bindPopup(berthPopup(berth));
        }
        mooringEdgeLayer.addTo(group);
        const edgeBounds = mooringEdgeLayer.getBounds?.();
        if (edgeBounds?.isValid()) bounds.extend(edgeBounds);
      }

      const marker = L.marker(
        [anchor.latitude, anchor.longitude],
        {
          icon: L.divIcon({
            className: "",
            html:
              '<div class="berth-map-marker berth-map-marker-geometry">' +
              '<span class="berth-map-marker-anchor">⚓</span>' +
              (berth?.station_number
                ? `<span class="berth-map-marker-number">${berth.station_number}</span>`
                : "") +
              "</div>",
            iconSize: [34, 22],
            iconAnchor: [17, 11]
          }),
          zIndexOffset: 360
        }
      );

      if (typeof options.onSelect === "function") {
        marker.on("click", event => {
          marker.closeTooltip();
          select(event);
        });
      } else {
        marker.bindPopup(berthPopup(berth));
      }

      marker.bindTooltip(tooltipText, {
        direction: "top",
        className: "berth-hover-tooltip"
      });
      marker.addTo(group);
      bounds.extend([anchor.latitude, anchor.longitude]);
      markers.push({
        marker,
        berth,
        polygonLayer,
        mooringEdgeLayer,
        geometry: entry
      });
    });

    if (options.addToMap !== false) {
      group.addTo(map);
    }

    return {
      group,
      bounds,
      markers,
      geometryIndex
    };
  }

  function photoHasSightingRelation(photo) {
    const submissionId = String(
      photo?.submission_id ||
      photo?.relation?.submission_id ||
      ""
    ).trim();

    return Boolean(submissionId);
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

  function photoHoverContent(photo, relationState = "") {
    const container = document.createElement("div");
    container.className = "photo-hover-content";

    const title = document.createElement("strong");
    title.textContent =
      photo?.vessel_name ||
      photo?.vessel_id ||
      "Fotoaufnahme";
    container.append(title);

    const compact = [
      formatDateTime(photo?.captured_at),
      String(photo?.location?.name || "").trim()
    ].filter(Boolean).join(" · ");

    if (compact) {
      const line = document.createElement("div");
      line.textContent = compact;
      container.append(line);
    }

    if (relationState === "sighting-unlocated") {
      const note = document.createElement("div");
      note.textContent = "Schiffsposition nicht kartierbar";
      container.append(note);
    }

    return container;
  }

  function photoPopup(photo, relationState = "") {
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
        ? (
          photoHasSightingRelation(photo)
            ? "Typ: Zusatzfoto zu Sichtung"
            : "Typ: Zusatzfoto nur zum Schiff"
        )
        : "Typ: Sichtungsfoto"
    );
    addLine(
      photoHasSightingRelation(photo)
        ? `Sichtung: ${photo.submission_id || photo?.relation?.submission_id}`
        : ""
    );
    addLine(
      relationState === "sighting-unlocated"
        ? "Schiffsposition dieser Sichtung ist nicht kartierbar; daher gibt es keine Verbindungslinie."
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

  function photoMarkerKey(photo) {
    const photoId = String(photo?.photo_id || "").trim();
    if (photoId) return photoId;

    return [
      String(photo?.source_type || "photo").trim(),
      String(photo?.submission_id || photo?.relation?.submission_id || "").trim(),
      String(photo?.captured_at || "").trim(),
      String(photo?.photo_lat ?? photo?.latitude ?? "").trim(),
      String(photo?.photo_lon ?? photo?.longitude ?? "").trim(),
      String(photo?.path || "").trim()
    ].join("|");
  }

  function createPhotoMarker(map, photo, options = {}) {
    const sourceCoords = validCoordinates(
      photo?.photo_lat ?? photo?.latitude,
      photo?.photo_lon ?? photo?.longitude
    );
    if (!sourceCoords) return null;

    const displayCoords = options.displayCoordinates
      ? validCoordinates(
          options.displayCoordinates.latitude,
          options.displayCoordinates.longitude
        )
      : sourceCoords;
    if (!displayCoords) return null;

    const hasSighting = photoHasSightingRelation(photo);
    const relationState =
      options.relationState ||
      (hasSighting ? "sighting-connected" : "vessel");

    const stateColors = {
      "sighting-connected": { color: "#1e3a8a", fillColor: "#60a5fa" },
      "sighting-unlocated": { color: "#5b21b6", fillColor: "#c4b5fd" },
      vessel: { color: "#92400e", fillColor: "#facc15" }
    };
    const colors = stateColors[relationState] || stateColors.vessel;

    const marker = L.circleMarker(
      [displayCoords.latitude, displayCoords.longitude],
      {
        radius: options.radius ?? 7,
        color: options.color || colors.color,
        weight: options.weight ?? 2,
        fillColor: options.fillColor || colors.fillColor,
        fillOpacity: options.fillOpacity ?? 0.92
      }
    );

    if (typeof options.onSelect === "function") {
      marker.on("click", event => {
        marker.closeTooltip();
        options.onSelect({
          marker,
          photo,
          relationState,
          photoKey: photoMarkerKey(photo),
          event
        });
      });
    } else {
      marker.bindPopup(photoPopup(photo, relationState));
    }

    const label = photoLabel(photo, options.labelMode || "none");
    const hoverContent = photoHoverContent(photo, relationState);

    if (label) {
      marker.bindTooltip(label, {
        permanent: true,
        direction: "top",
        className: "photo-location-label"
      });
      marker.on("mouseover", () => {
        marker.setTooltipContent(hoverContent);
        marker.openTooltip();
      });
      marker.on("mouseout", () => {
        marker.setTooltipContent(label);
        marker.openTooltip();
      });
    } else {
      marker.bindTooltip(hoverContent, {
        permanent: false,
        sticky: true,
        direction: "top",
        opacity: 0.97,
        className: "photo-hover-tooltip"
      });
    }

    marker._danubePhotoKey = photoMarkerKey(photo);

    if (options.addToMap !== false) marker.addTo(map);
    return marker;
  }

  function photoGroupIcon(count) {
    const safeCount = Math.max(2, Number(count) || 2);
    return L.divIcon({
      className: "",
      html:
        '<div class="photo-group-marker" aria-hidden="true">' +
        `<span class="photo-group-count">${safeCount}</span>` +
        "</div>",
      iconSize: [34, 34],
      iconAnchor: [17, 17]
    });
  }

  function createPhotoGroupMarker(map, items, options = {}) {
    const normalized = (Array.isArray(items) ? items : [])
      .map(item => item?.photo ? item : { photo: item })
      .filter(item => validCoordinates(
        item?.photo?.photo_lat ?? item?.photo?.latitude,
        item?.photo?.photo_lon ?? item?.photo?.longitude
      ));
    if (normalized.length < 2) return null;

    const centerCoords = options.centerCoordinates
      ? validCoordinates(
          options.centerCoordinates.latitude,
          options.centerCoordinates.longitude
        )
      : null;
    const fallbackCoords = validCoordinates(
      normalized[0]?.photo?.photo_lat ?? normalized[0]?.photo?.latitude,
      normalized[0]?.photo?.photo_lon ?? normalized[0]?.photo?.longitude
    );
    const coords = centerCoords || fallbackCoords;
    if (!coords) return null;

    const marker = L.marker(
      [coords.latitude, coords.longitude],
      { icon: photoGroupIcon(normalized.length), zIndexOffset: 430 }
    );

    marker.bindTooltip(
      `${normalized.length} Foto-Aufnahmeorte<br>Klick: auffächern`,
      {
        permanent: false,
        sticky: true,
        direction: "top",
        opacity: 0.97,
        className: "photo-hover-tooltip"
      }
    );

    let spiderLayer = null;

    const fireSpiderChange = expanded => {
      map.fire("danube:photo-spiderfy-change", {
        expanded,
        marker,
        positions:
          expanded && map._danubePhotoSpiderfy?.marker === marker
            ? map._danubePhotoSpiderfy.positions
            : null
      });
    };

    const collapse = () => {
      if (spiderLayer && map.hasLayer(spiderLayer)) map.removeLayer(spiderLayer);
      spiderLayer = null;
      if (map._danubePhotoSpiderfy?.marker === marker) {
        map._danubePhotoSpiderfy = null;
        fireSpiderChange(false);
      }
    };

    const expand = () => {
      if (
        map._danubePhotoSpiderfy?.collapse &&
        map._danubePhotoSpiderfy.marker !== marker
      ) {
        map._danubePhotoSpiderfy.collapse();
      }

      spiderLayer = L.layerGroup();
      const center = L.latLng(coords.latitude, coords.longitude);
      const centerPoint = map.latLngToLayerPoint(center);
      const positions = new Map();
      const count = normalized.length;
      const ringCapacity = 12;

      normalized.forEach((item, index) => {
        const ring = Math.floor(index / ringCapacity);
        const ringStart = ring * ringCapacity;
        const ringCount = Math.min(ringCapacity, count - ringStart);
        const ringIndex = index - ringStart;
        const radius = 34 + ring * 27;
        const angle = (-Math.PI / 2) + (2 * Math.PI * ringIndex / ringCount);
        const point = L.point(
          centerPoint.x + Math.cos(angle) * radius,
          centerPoint.y + Math.sin(angle) * radius
        );
        const latLng = map.layerPointToLatLng(point);
        const displayCoordinates = { latitude: latLng.lat, longitude: latLng.lng };
        positions.set(photoMarkerKey(item.photo), displayCoordinates);

        L.polyline([center, latLng], {
          color: "#64748b",
          weight: 1,
          opacity: 0.6,
          dashArray: "2 4",
          interactive: false
        }).addTo(spiderLayer);

        const markerOptions =
          typeof options.markerOptions === "function"
            ? options.markerOptions(item) || {}
            : {};
        const child = createPhotoMarker(map, item.photo, {
          ...markerOptions,
          addToMap: false,
          displayCoordinates
        });
        if (child) child.addTo(spiderLayer);
      });

      spiderLayer.addTo(map);
      map._danubePhotoSpiderfy = { marker, collapse, positions };
      fireSpiderChange(true);
    };

    marker.on("click", event => {
      if (event?.originalEvent) L.DomEvent.stopPropagation(event.originalEvent);
      marker.closeTooltip();
      if (spiderLayer) collapse();
      else expand();
    });

    const handleZoomStart = () => collapse();
    marker.on("remove", () => {
      collapse();
      map.off("zoomstart", handleZoomStart);
    });
    map.on("zoomstart", handleZoomStart);

    if (options.addToMap !== false) marker.addTo(map);
    return marker;
  }

  function vesselBerthPopup(record, options = {}) {
    const container = document.createElement("div");
    container.className = "vessel-berth-popup";

    const title = document.createElement("strong");
    title.textContent =
      record?.vessel_name ||
      record?.vessel_id ||
      "Schiff an Anlegestelle";
    container.append(title);

    const addLine = text => {
      if (!text) return;
      const line = document.createElement("div");
      line.textContent = text;
      container.append(line);
    };

    addLine(formatDateTime(record?.captured_at));
    addLine(
      record?.berth?.short_name || record?.berth?.name
        ? `Anlegestelle: ${record.berth.short_name || record.berth.name}`
        : ""
    );
    addLine(
      normalizeAlongsidePosition(record?.alongside_position)
        ? `Liegeposition: ${alongsidePositionLabel(record.alongside_position)}`
        : "Liegeposition: unbekannt"
    );
    addLine(
      record?.submission_id
        ? `Sichtung: ${record.submission_id}`
        : ""
    );
    addLine(
      record?.direction === "upstream"
        ? "Ausrichtung: flussaufwärts"
        : record?.direction === "downstream"
          ? "Ausrichtung: flussabwärts"
          : ""
    );

    const note = document.createElement("div");
    note.className = "vessel-berth-position-note";
    note.textContent = options.spiderfied
      ? "Aufgefächerte Darstellung; die reale gespeicherte Position bleibt die Anlegestelle."
      : "Marker = aus der Liegekante flussseitig abgeleitet; noch kein gemessenes Schiff-GPS.";
    container.append(note);

    if (record?.vessel_id) {
      const link = document.createElement("a");
      link.href =
        `vessel.html?id=${encodeURIComponent(record.vessel_id)}`;
      link.textContent = "Schiff öffnen";
      link.className = "map-popup-link";
      container.append(link);
    }

    return container;
  }

  function vesselBerthHoverContent(record) {
    const container = document.createElement("div");
    container.className = "vessel-berth-hover-content";

    const title = document.createElement("strong");
    title.textContent = record?.vessel_name || record?.vessel_id || "Schiff";
    container.append(title);

    const compact = [
      formatDateTime(record?.captured_at),
      record?.berth?.short_name || record?.berth?.name || "",
      normalizeAlongsidePosition(record?.alongside_position)
        ? alongsidePositionLabel(record.alongside_position)
        : ""
    ].filter(Boolean).join(" · ");
    if (compact) {
      const line = document.createElement("div");
      line.textContent = compact;
      container.append(line);
    }

    return container;
  }

  function vesselBerthIcon(record = null) {
    const position = normalizeAlongsidePosition(record?.alongside_position);
    const badge = position
      ? `<span class="vessel-berth-position-badge">P${position}</span>`
      : "";

    return L.divIcon({
      className: "",
      html:
        '<div class="vessel-berth-marker" aria-hidden="true">' +
        '<svg viewBox="0 0 36 36" focusable="false" aria-hidden="true">' +
        '<path d="M8 17h20l-2 8c-3 2-5 3-8 3s-5-1-8-3l-2-8Z" />' +
        '<path d="M12 17V10h11v7M16 10V6h5v4" />' +
        '<path d="M5 29c3 2 6 2 9 0 3 2 6 2 9 0 3 2 6 2 9 0" />' +
        '</svg>' + badge + '</div>',
      iconSize: [38, 38],
      iconAnchor: [19, 19]
    });
  }

  function createVesselBerthMarker(map, record, berth, options = {}) {
    const berthCoords = validCoordinates(
      berth?.latitude,
      berth?.longitude
    );
    if (!berthCoords) return null;

    const displayCoords = options.displayCoordinates
      ? validCoordinates(
          options.displayCoordinates.latitude,
          options.displayCoordinates.longitude
        )
      : berthCoords;

    if (!displayCoords) return null;

    const marker = L.marker(
      [displayCoords.latitude, displayCoords.longitude],
      {
        icon: vesselBerthIcon(record),
        zIndexOffset: options.zIndexOffset ?? 450
      }
    );

    const mergedRecord = {
      ...record,
      berth: {
        ...(record?.berth || {}),
        ...(berth || {})
      }
    };

    if (typeof options.onSelect === "function") {
      marker.on("click", event => {
        marker.closeTooltip();
        options.onSelect({ marker, record: mergedRecord, berth, event });
      });
    } else {
      marker.bindPopup(
        vesselBerthPopup(
          mergedRecord,
          { spiderfied: options.spiderfied === true }
        )
      );
    }
    marker.bindTooltip(vesselBerthHoverContent(mergedRecord), {
      permanent: false,
      sticky: true,
      direction: "top",
      opacity: 0.97,
      className: "vessel-berth-hover-tooltip"
    });

    if (options.addToMap !== false) {
      marker.addTo(map);
    }

    return marker;
  }


  function vesselBerthGroupPopup(records, berth) {
    const container = document.createElement("div");
    container.className = "vessel-berth-group-popup";

    const title = document.createElement("strong");
    const berthName =
      berth?.short_name ||
      berth?.public_name ||
      berth?.name ||
      "Anlegestelle";
    title.textContent = berthName;
    container.append(title);

    const normalized = (Array.isArray(records) ? records : [])
      .slice()
      .sort((left, right) =>
        String(right?.captured_at || "")
          .localeCompare(String(left?.captured_at || ""))
      );

    const uniqueVessels = new Set(
      normalized
        .map(record => String(
          record?.vessel_id || record?.vessel_name || ""
        ).trim())
        .filter(Boolean)
    ).size;

    const summary = document.createElement("div");
    summary.className = "vessel-berth-group-summary";
    summary.textContent =
      `${normalized.length} Anlege-Sichtungen · ${uniqueVessels} ` +
      `${uniqueVessels === 1 ? "Schiff" : "Schiffe"}`;
    container.append(summary);

    const list = document.createElement("div");
    list.className = "vessel-berth-history-list";

    normalized.forEach(record => {
      const item = document.createElement("div");
      item.className = "vessel-berth-history-item";

      const heading = document.createElement("div");
      heading.className = "vessel-berth-history-title";
      heading.textContent =
        record?.vessel_name ||
        record?.vessel_id ||
        "Schiff";
      item.append(heading);

      const date = document.createElement("div");
      date.textContent = formatDateTime(record?.captured_at);
      item.append(date);

      const position = normalizeAlongsidePosition(record?.alongside_position);
      if (position) {
        const positionLine = document.createElement("div");
        positionLine.textContent = alongsidePositionLabel(position);
        item.append(positionLine);
      }

      if (record?.submission_id) {
        const sighting = document.createElement("div");
        sighting.textContent = `Sichtung: ${record.submission_id}`;
        item.append(sighting);
      }

      if (record?.vessel_id) {
        const link = document.createElement("a");
        link.href =
          `vessel.html?id=${encodeURIComponent(record.vessel_id)}`;
        link.textContent = "Schiff öffnen";
        link.className = "map-popup-link";
        item.append(link);
      }

      list.append(item);
    });

    container.append(list);

    const note = document.createElement("div");
    note.className = "vessel-berth-position-note";
    note.textContent =
      "Marker = aus der Liegekante flussseitig abgeleitet; noch kein gemessenes Schiff-GPS.";
    container.append(note);

    return container;
  }

  function vesselBerthGroupIcon(count, alongsidePosition = null) {
    const safeCount = Math.max(2, Number(count) || 2);
    const position = normalizeAlongsidePosition(alongsidePosition);
    const positionBadge = position
      ? `<span class="vessel-berth-position-badge">P${position}</span>`
      : "";
    return L.divIcon({
      className: "",
      html:
        '<div class="vessel-berth-marker vessel-berth-group-marker" aria-hidden="true">' +
        '<svg viewBox="0 0 36 36" focusable="false" aria-hidden="true">' +
        '<path d="M8 17h20l-2 8c-3 2-5 3-8 3s-5-1-8-3l-2-8Z" />' +
        '<path d="M12 17V10h11v7M16 10V6h5v4" />' +
        '<path d="M5 29c3 2 6 2 9 0 3 2 6 2 9 0 3 2 6 2 9 0" />' +
        '</svg>' +
        `<span class="vessel-berth-group-count">${safeCount}</span>` +
        positionBadge +
        '</div>',
      iconSize: [42, 42],
      iconAnchor: [21, 21]
    });
  }

  function createVesselBerthGroupMarker(
    map,
    records,
    berth,
    options = {}
  ) {
    const berthCoords = validCoordinates(
      berth?.latitude,
      berth?.longitude
    );
    if (!berthCoords) return null;

    const displayCoords = options.displayCoordinates
      ? validCoordinates(
          options.displayCoordinates.latitude,
          options.displayCoordinates.longitude
        )
      : berthCoords;
    if (!displayCoords) return null;

    const normalized = Array.isArray(records)
      ? records.filter(Boolean)
      : [];
    if (normalized.length < 2) return null;

    const marker = L.marker(
      [displayCoords.latitude, displayCoords.longitude],
      {
        icon: vesselBerthGroupIcon(
          normalized.length,
          normalized[0]?.alongside_position
        ),
        zIndexOffset: 470
      }
    );

    const berthName =
      berth?.short_name ||
      berth?.public_name ||
      berth?.name ||
      "Anlegestelle";

    marker.bindTooltip(
      `${berthName}<br>${normalized.length} Anlege-Sichtungen` +
      (normalizeAlongsidePosition(normalized[0]?.alongside_position)
        ? `<br>${alongsidePositionLabel(normalized[0].alongside_position)}`
        : "") +
      (options.spiderfy ? "<br>Klick: auffächern" : ""),
      {
        permanent: false,
        sticky: true,
        direction: "top",
        opacity: 0.97,
        className: "vessel-berth-hover-tooltip"
      }
    );

    if (options.spiderfy) {
      let spiderLayer = null;

      const fireSpiderChange = expanded => {
        map.fire("danube:vessel-spiderfy-change", {
          expanded,
          marker,
          berth_id: String(
            berth?.berth_id ||
            normalized[0]?.berth_id ||
            ""
          ).trim(),
          positions:
            expanded &&
            map._danubeVesselSpiderfy?.marker === marker
              ? map._danubeVesselSpiderfy.positions
              : null
        });
      };

      const collapse = () => {
        if (spiderLayer && map.hasLayer(spiderLayer)) {
          map.removeLayer(spiderLayer);
        }
        spiderLayer = null;

        const wasCurrent =
          map._danubeVesselSpiderfy?.marker === marker;

        if (wasCurrent) {
          map._danubeVesselSpiderfy = null;
          fireSpiderChange(false);
        }

      };

      const expand = () => {
        if (
          map._danubeVesselSpiderfy?.collapse &&
          map._danubeVesselSpiderfy.marker !== marker
        ) {
          map._danubeVesselSpiderfy.collapse();
        }

        spiderLayer = L.layerGroup();

        const center = L.latLng(
          displayCoords.latitude,
          displayCoords.longitude
        );
        const centerPoint = map.latLngToLayerPoint(center);
        const count = normalized.length;
        const positions = new Map();

        const ringCapacity = 10;
        normalized.forEach((record, index) => {
          const ring = Math.floor(index / ringCapacity);
          const ringStart = ring * ringCapacity;
          const ringCount = Math.min(
            ringCapacity,
            count - ringStart
          );
          const ringIndex = index - ringStart;
          const radius = 52 + ring * 34;
          const angle =
            (-Math.PI / 2) +
            (2 * Math.PI * ringIndex / ringCount);

          const point = L.point(
            centerPoint.x + Math.cos(angle) * radius,
            centerPoint.y + Math.sin(angle) * radius
          );
          const latLng = map.layerPointToLatLng(point);

          const displayCoordinates = {
            latitude: latLng.lat,
            longitude: latLng.lng
          };

          const submissionId = String(
            record?.submission_id || ""
          ).trim();
          if (submissionId) {
            positions.set(
              submissionId,
              displayCoordinates
            );
          }

          const leg = L.polyline(
            [center, latLng],
            {
              color: "#64748b",
              weight: 1.2,
              opacity: 0.72,
              dashArray: "2 4",
              interactive: false
            }
          );
          leg.addTo(spiderLayer);

          const itemMarker = createVesselBerthMarker(
            map,
            record,
            berth,
            {
              addToMap: false,
              displayCoordinates,
              spiderfied: true,
              zIndexOffset: 520 + index,
              onSelect: options.onSelect
            }
          );

          if (itemMarker) {
            itemMarker.addTo(spiderLayer);
          }
        });

        spiderLayer.addTo(map);
        map._danubeVesselSpiderfy = {
          marker,
          collapse,
          positions
        };
        fireSpiderChange(true);
      };

      const toggleSpiderfy = event => {
        if (event?.originalEvent) {
          L.DomEvent.stopPropagation(event.originalEvent);
        }

        if (spiderLayer) {
          collapse();
        } else {
          expand();
        }
      };

      const handleZoomStart = () => {
        collapse();
      };

      marker.on("click", toggleSpiderfy);
      marker.on("remove", () => {
        collapse();
        map.off("zoomstart", handleZoomStart);
      });
      map.on("zoomstart", handleZoomStart);
    } else {
      marker.bindPopup(
        vesselBerthGroupPopup(normalized, berth),
        { maxWidth: 390 }
      );
    }

    if (options.addToMap !== false) {
      marker.addTo(map);
    }

    return marker;
  }

  function createPhotoVesselConnection(
    map,
    photoCoordinates,
    berthCoordinates,
    options = {}
  ) {
    const photo = validCoordinates(
      photoCoordinates?.latitude,
      photoCoordinates?.longitude
    );
    const berth = validCoordinates(
      berthCoordinates?.latitude,
      berthCoordinates?.longitude
    );

    if (!photo || !berth) return null;

    const line = L.polyline(
      [
        [photo.latitude, photo.longitude],
        [berth.latitude, berth.longitude]
      ],
      {
        color: options.color || "#0f4c81",
        weight: options.weight ?? 2,
        opacity: options.opacity ?? 0.8,
        dashArray: options.dashArray || "7 7",
        interactive: true
      }
    );

    line.bindTooltip(
      options.tooltip ||
        "Foto-Aufnahmeort → erfasste Anlegestelle",
      { direction: "center", sticky: true }
    );

    if (options.addToMap !== false) {
      line.addTo(map);
    }

    return line;
  }

  window.DanubeLocationMap = Object.freeze({
    AREA_COLORS,
    parseCoordinate,
    validCoordinates,
    formatDateTime,
    formatDate,
    localDateKey,
    loadAreas,
    loadLocationIndex,
    loadPhotoLocations,
    loadBerths,
    loadBerthGeometries,
    indexBerthGeometries,
    berthAnchorCoordinates,
    normalizeAlongsidePosition,
    alongsidePositionLabel,
    vesselDisplayDistanceMeters,
    berthRiverwardDisplayCoordinates,
    berthMooringAxis,
    vesselBerthFootprintCoordinates,
    createVesselBerthFootprint,
    createMap,
    matchingAreas,
    areaName,
    addAreaLayers,
    addBerthLayers,
    createPhotoMarker,
    photoMarkerKey,
    createPhotoGroupMarker,
    photoHasSightingRelation,
    createVesselBerthMarker,
    createVesselBerthGroupMarker,
    createPhotoVesselConnection
  });
})();
