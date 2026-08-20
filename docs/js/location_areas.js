/*
 * Danube Vessel Log
 * File: docs/js/location_areas.js
 * Version: 0.14.33
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

  if (!window.L) {
    status.textContent = "Die Kartenbibliothek Leaflet konnte nicht geladen werden.";
    status.classList.add("error");
    return;
  }

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

      if (allBounds.isValid()) {
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
