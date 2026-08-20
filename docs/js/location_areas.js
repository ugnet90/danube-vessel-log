/*
 * Danube Vessel Log
 * File: docs/js/location_areas.js
 * Version: 0.14.34
 * Updated: 2026-08-20
 */

"use strict";

(function () {
  const DATA_URL = "data/location_areas.geojson";
  const AREA_COLORS = [
    "#d7191c",
    "#2c7bb6",
    "#fdae61",
    "#7b3294",
    "#1a9641"
  ];

  const status = document.getElementById("locationAreasStatus");
  const list = document.getElementById("locationAreasList");
  const toggleVerticesButton = document.getElementById("toggleVerticesButton");
  const selectedPhotoCard = document.getElementById("selectedPhotoCard");

  if (!window.L) {
    status.textContent = "Die Kartenbibliothek Leaflet konnte nicht geladen werden.";
    status.classList.add("error");
    return;
  }

  function coordinateFromQuery(
    valueText,
    minimum,
    maximum
  ) {
    const parsed = Number(
      String(valueText ?? "")
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

  function selectedPhotoFromQuery() {
    const params =
      new URLSearchParams(
        window.location.search
      );

    const latitude = coordinateFromQuery(
      params.get("lat"),
      -90,
      90
    );

    const longitude = coordinateFromQuery(
      params.get("lon"),
      -180,
      180
    );

    if (
      latitude === null ||
      longitude === null ||
      (latitude === 0 && longitude === 0)
    ) {
      return null;
    }

    return {
      latitude,
      longitude,
      capturedAt:
        params.get("captured_at") || "",
      currentLocation:
        params.get("location") || "",
      photoId:
        params.get("photo_id") || ""
    };
  }

  function formatDateTime(valueText) {
    if (!valueText) return "";

    const date = new Date(valueText);
    if (Number.isNaN(date.getTime())) {
      return valueText;
    }

    return new Intl.DateTimeFormat(
      "de-AT",
      {
        dateStyle: "medium",
        timeStyle: "short"
      }
    ).format(date);
  }

  function pointOnSegment(
    longitude,
    latitude,
    left,
    right
  ) {
    const x1 = Number(left?.[0]);
    const y1 = Number(left?.[1]);
    const x2 = Number(right?.[0]);
    const y2 = Number(right?.[1]);

    if (
      ![x1, y1, x2, y2].every(
        Number.isFinite
      )
    ) {
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

  function pointInRing(
    longitude,
    latitude,
    ring
  ) {
    if (!Array.isArray(ring) || ring.length < 3) {
      return false;
    }

    let inside = false;

    for (
      let index = 0,
        previous = ring.length - 1;
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

  function matchingAreas(
    features,
    selectedPhoto
  ) {
    return features
      .filter(feature => {
        const ring =
          feature?.geometry?.coordinates?.[0];

        return pointInRing(
          selectedPhoto.longitude,
          selectedPhoto.latitude,
          ring
        );
      })
      .sort((left, right) =>
        Number(
          right?.properties?.priority ?? 0
        ) -
        Number(
          left?.properties?.priority ?? 0
        )
      );
  }

  const selectedPhoto =
    selectedPhotoFromQuery();

  const map = L.map("locationAreasMap", {
    zoomControl: true,
    preferCanvas: false
  }).setView([48.3092, 14.2854], 16);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 20,
    attribution: "&copy; OpenStreetMap contributors"
  }).addTo(map);

  const polygonLayers = [];
  const vertexLayer = L.layerGroup();
  let verticesVisible = false;

  function popupContent(properties) {
    const name = properties?.public_name || properties?.name || "Standortbereich";
    const priority = properties?.priority ?? "–";
    const description = properties?.description || "";

    return (
      '<div class="location-area-popup">' +
        "<strong>" + name + "</strong>" +
        "Priorität: " + priority +
        (description ? "<br><br>" + description : "") +
      "</div>"
    );
  }

  function addVertexMarkers(feature, color) {
    const ring = feature?.geometry?.coordinates?.[0];
    if (!Array.isArray(ring)) return;

    const points = (
      ring.length > 1 &&
      ring[0][0] === ring[ring.length - 1][0] &&
      ring[0][1] === ring[ring.length - 1][1]
    ) ? ring.slice(0, -1) : ring;

    points.forEach((coordinate, index) => {
      const longitude = Number(coordinate?.[0]);
      const latitude = Number(coordinate?.[1]);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;

      const marker = L.marker([latitude, longitude], {
        icon: L.divIcon({
          className: "",
          html: '<div class="location-area-vertex-label" style="border-color:' + color + '">' + (index + 1) + "</div>",
          iconSize: [24, 24],
          iconAnchor: [12, 12]
        })
      });

      marker.bindPopup(
        "<strong>" + (feature.properties?.name || "Bereich") +
        " – Eckpunkt " + (index + 1) + "</strong><br>" +
        "Breitengrad: " + latitude.toFixed(7) + "<br>" +
        "Längengrad: " + longitude.toFixed(7)
      );

      marker.addTo(vertexLayer);
    });
  }

  function addListItem(feature, layer, color) {
    const properties = feature.properties || {};
    const button = document.createElement("button");
    button.type = "button";
    button.className = "location-area-item";
    button.style.setProperty("--area-color", color);

    const title = document.createElement("strong");
    title.textContent = properties.public_name || properties.name || "Standortbereich";

    const meta = document.createElement("span");
    meta.textContent = "Priorität " + (properties.priority ?? "–");

    button.append(title, meta);
    button.addEventListener("click", () => {
      map.fitBounds(layer.getBounds(), { padding: [30, 30], maxZoom: 19 });
      layer.openPopup();
    });
    list.append(button);
  }

  function renderSelectedPhoto(
    features
  ) {
    if (!selectedPhoto) return;

    const matches = matchingAreas(
      features,
      selectedPhoto
    );

    const bestMatch = matches[0] ?? null;
    const bestMatchName =
      bestMatch?.properties?.public_name ||
      bestMatch?.properties?.name ||
      "kein Polygon";

    const marker = L.circleMarker(
      [
        selectedPhoto.latitude,
        selectedPhoto.longitude
      ],
      {
        radius: 9,
        color: "#111827",
        weight: 3,
        fillColor: "#facc15",
        fillOpacity: 1
      }
    ).addTo(map);

    const popup =
      document.createElement("div");

    const title =
      document.createElement("strong");
    title.textContent = "Fotoaufnahme";
    popup.append(title);

    const captured = formatDateTime(
      selectedPhoto.capturedAt
    );

    if (captured) {
      popup.append(
        document.createElement("br"),
        document.createTextNode(captured)
      );
    }

    popup.append(
      document.createElement("br"),
      document.createTextNode(
        "GPS: " +
        selectedPhoto.latitude.toFixed(7) +
        " / " +
        selectedPhoto.longitude.toFixed(7)
      ),
      document.createElement("br"),
      document.createTextNode(
        "Polygon: " + bestMatchName
      )
    );

    marker.bindPopup(popup);

    if (selectedPhotoCard) {
      selectedPhotoCard.replaceChildren();

      const heading =
        document.createElement("strong");
      heading.textContent = "Ausgewähltes Foto";
      selectedPhotoCard.append(heading);

      if (captured) {
        const dateLine =
          document.createElement("span");
        dateLine.textContent = captured;
        selectedPhotoCard.append(dateLine);
      }

      const gpsLine =
        document.createElement("span");
      gpsLine.textContent =
        "GPS: " +
        selectedPhoto.latitude.toFixed(7) +
        " / " +
        selectedPhoto.longitude.toFixed(7);
      selectedPhotoCard.append(gpsLine);

      if (selectedPhoto.currentLocation) {
        const currentLine =
          document.createElement("span");
        currentLine.textContent =
          "Aktuell zugeordnet: " +
          selectedPhoto.currentLocation;
        selectedPhotoCard.append(currentLine);
      }

      const matchLine =
        document.createElement("span");
      matchLine.className =
        "selected-photo-match";
      matchLine.textContent =
        matches.length > 0
          ? "GPS-Punkt liegt in: " +
            matches
              .map(feature =>
                feature?.properties?.public_name ||
                feature?.properties?.name ||
                "Standortbereich"
              )
              .join(" · ")
          : "GPS-Punkt liegt in keinem Polygon.";

      selectedPhotoCard.append(matchLine);
      selectedPhotoCard.classList.remove(
        "hidden"
      );
    }

    map.setView(
      [
        selectedPhoto.latitude,
        selectedPhoto.longitude
      ],
      19
    );

    window.setTimeout(
      () => marker.openPopup(),
      0
    );
  }

  async function loadAreas() {
    try {
      const response = await fetch(DATA_URL, { cache: "no-store" });
      if (!response.ok) {
        throw new Error("HTTP " + response.status);
      }

      const data = await response.json();
      const features = Array.isArray(data?.features) ? data.features : [];
      if (features.length === 0) {
        throw new Error("Keine Polygonflächen vorhanden.");
      }

      const allBounds = L.latLngBounds();

      features.forEach((feature, index) => {
        const color = AREA_COLORS[index % AREA_COLORS.length];
        const layer = L.geoJSON(feature, {
          style: {
            color,
            weight: 4,
            opacity: 1,
            fillColor: color,
            fillOpacity: 0.30
          }
        }).addTo(map);

        layer.bindPopup(popupContent(feature.properties));
        layer.eachLayer(child => {
          if (typeof child.getBounds === "function") {
            allBounds.extend(child.getBounds());
          }
        });

        polygonLayers.push(layer);
        addVertexMarkers(feature, color);
        addListItem(feature, layer, color);
      });

      if (selectedPhoto) {
        renderSelectedPhoto(features);
      } else if (allBounds.isValid()) {
        map.fitBounds(allBounds, { padding: [20, 20] });
      }

      status.textContent = features.length + " Standortbereiche geladen.";
    } catch (error) {
      status.textContent = "Standortbereiche konnten nicht geladen werden: " + (error instanceof Error ? error.message : String(error));
      status.classList.add("error");
    }
  }

  toggleVerticesButton.addEventListener("click", () => {
    verticesVisible = !verticesVisible;

    if (verticesVisible) {
      vertexLayer.addTo(map);
      toggleVerticesButton.textContent = "Eckpunkte ausblenden";
    } else {
      map.removeLayer(vertexLayer);
      toggleVerticesButton.textContent = "Eckpunkte anzeigen";
    }
  });

  loadAreas();
})();
