// Danube Vessel Log
// File: docs/js/vessel.js
// Version: 0.14.51
// Updated: 2026-08-24

"use strict";

document.addEventListener("DOMContentLoaded", () => {
  const byId = id => document.getElementById(id);
  const reference = window.VesselReference;

  const workerUrl = String(
    window.VesselConfig?.workerUrl ?? ""
  )
    .trim()
    .replace(/\/+$/, "");

  const vesselId = new URLSearchParams(
    window.location.search
  )
    .get("id")
    ?.trim() || "";

  let photoMapModal = null;
  let photoMapCanvas = null;
  let photoMapInfo = null;
  let closePhotoMapButton = null;
  let mapDependenciesPromise = null;
  let photoMap = null;
  let photoMapAreaLayers = null;
  let photoMapBerthLayers = null;
  let photoMapMarkers = [];
  let photoMapVesselMarker = null;
  let photoMapConnectionLines = [];
  let photoMapBerths = [];
  let photoMapAreasPromise = null;
  let photoMapBerthsPromise = null;
  let photoMapBerthGeometriesPromise = null;
  let photoMapBerthGeometryIndex = new Map();

  const apiKey = byId("apiKey");

  const previousVesselButton =
    byId("previousVesselButton");

  const nextVesselButton =
    byId("nextVesselButton");

  const vesselPosition =
    byId("vesselPosition");

  const editButton = byId("editButton");
  const reloadButton = byId("reloadButton");
  const pageStatus = byId("pageStatus");
  const content = byId("vesselContent");

  const previousPhotoButton =
    byId("previousPhotoButton");

  const nextPhotoButton =
    byId("nextPhotoButton");

  const primaryPhotoPosition =
    byId("primaryPhotoPosition");

  const editCard = byId("vesselEditCard");
  const editForm = byId("vesselEditForm");
  const editName = byId("editName");
  const saveEditButton = byId("saveEditButton");
  const cancelEditButton = byId("cancelEditButton");
  const editNameMatchPanel = byId("editNameMatchPanel");
  const editNameMatchStatus = byId("editNameMatchStatus");
  const editNameMatchCount = byId("editNameMatchCount");
  const editExistingNameMatches = byId("editExistingNameMatches");
  const editCatalogNameMatches = byId("editCatalogNameMatches");

  const addSourceButton = byId("addSourceButton");
  const sourceForm = byId("sourceForm");
  const saveSourceButton = byId("saveSourceButton");
  const cancelSourceButton = byId("cancelSourceButton");

    const prepareDeleteButton =
    byId("prepareDeleteButton");

  const deleteVesselPanel =
    byId("deleteVesselPanel");

  const deletePreviewVessel =
    byId("deletePreviewVessel");

  const deletePreviewSubmissions =
    byId("deletePreviewSubmissions");

  const deletePreviewPhotos =
    byId("deletePreviewPhotos");

  const deletePreviewMissingPhotos =
    byId("deletePreviewMissingPhotos");

  const deleteConfirmationExpected =
    byId("deleteConfirmationExpected");

  const deleteConfirmationInput =
    byId("deleteConfirmationInput");

  const cancelDeleteButton =
    byId("cancelDeleteButton");

  const confirmDeleteButton =
    byId("confirmDeleteButton");

  const deleteVesselStatus =
    byId("deleteVesselStatus");
  
  let currentVessel = null;
  let currentPayload = null;
  let vesselNavigation = [];
  let photoViewerItems = [];
  let photoViewerIndex = -1;
  let editModeActive = false;
  let sourceFormActive = false;
  let editingSourceId = "";
  let referenceReady = false;
  let editNameSearchToken = 0;
  let editNameSearchTimer = null;
  let deletePanelActive = false;
  let deleteBusy = false;
  let deletePreview = null;
  
  function value(input, suffix = "") {
    return (
      input === null ||
      input === undefined ||
      input === ""
    )
      ? "–"
      : `${input}${suffix}`;
  }

  function formatDate(valueText) {
    if (!valueText) return "–";

    const date = new Date(valueText);

    return Number.isNaN(date.getTime())
      ? valueText
      : new Intl.DateTimeFormat("de-AT", {
          dateStyle: "medium"
        }).format(date);
  }

  function dateTime(valueText) {
    if (!valueText) return "–";

    const date = new Date(valueText);

    return Number.isNaN(date.getTime())
      ? valueText
      : new Intl.DateTimeFormat("de-AT", {
          dateStyle: "medium",
          timeStyle: "short"
        }).format(date);
  }

  function set(id, text) {
    byId(id).textContent = text;
  }

  function statusLabel(status) {
    return ({
      active: "Aktiv",
      inactive: "Inaktiv",
      scrapped: "Verschrottet",
      unknown: "Unbekannt"
    })[status] || value(status);
  }

  function movementLabel(movement) {
    return ({
      moving: "in Fahrt",
      moored: "angelegt",
      unknown: "Bewegung unbekannt"
    })[movement] || value(movement);
  }

  function directionLabel(direction) {
    return ({
      upstream: "flussaufwärts",
      downstream: "flussabwärts",
      unknown: "Richtung unbekannt"
    })[direction] || value(direction);
  }

  function locationLabel(location) {
    if (
      !location ||
      typeof location !== "object"
    ) {
      return "–";
    }

    const parts = [];

    const addUniquePart = candidate => {
      const valueText =
        String(candidate ?? "").trim();

      if (!valueText) return;

      const normalizedCandidate =
        valueText.toLocaleLowerCase("de");

      const existingSegments =
        parts
          .flatMap(part =>
            String(part)
              .split(",")
              .map(segment =>
                segment
                  .trim()
                  .toLocaleLowerCase("de")
              )
          );

      if (
        existingSegments.includes(
          normalizedCandidate
        )
      ) {
        return;
      }

      parts.push(valueText);
    };

    addUniquePart(location.name);
    addUniquePart(location.municipality);
    addUniquePart(location.country);

    return parts.join(", ") || "–";
  }

  function berthLabel(berth) {
    if (
      !berth ||
      typeof berth !== "object"
    ) {
      return "";
    }

    const status =
      String(berth.status ?? "").trim();

    if (status === "matched") {
      return (
        berth.short_name ||
        berth.name ||
        berth.id ||
        ""
      );
    }

    if (status === "unlisted") {
      return berth.name || "";
    }

    return "";
  }

  function sightingPlaceLabel(sighting) {
    const location =
      sightingDisplayLocationLabel(
        sighting
      );

    const berth =
      berthLabel(
        sighting?.berth
      );

    if (location === "–") {
      return berth || "–";
    }

    return berth
      ? `${location} · ${berth}`
      : location;
  }

  function photoSpecificLocationLabels(sighting) {
    const labels = [];
    const normalized = new Set();

    for (
      const photo
      of Array.isArray(sighting?.photos)
        ? sighting.photos
        : []
    ) {
      if (
        Number(photo?.metadata_version ?? 0) < 1 ||
        !photo?.location
      ) {
        continue;
      }

      const label =
        locationLabel(photo.location);

      if (!label || label === "–") {
        continue;
      }

      const key =
        label.toLocaleLowerCase("de");

      if (normalized.has(key)) {
        continue;
      }

      normalized.add(key);
      labels.push(label);
    }

    return labels;
  }

  function sightingDisplayLocationLabel(sighting) {
    const photoLocations =
      photoSpecificLocationLabels(sighting);

    if (photoLocations.length === 1) {
      return photoLocations[0];
    }

    if (photoLocations.length > 1) {
      return (
        "Mehrere Aufnahmeorte: " +
        photoLocations.join(" · ")
      );
    }

    return locationLabel(
      sighting?.location
    );
  }

  function sightingHeaderLabel(sighting) {
    const location =
      sightingDisplayLocationLabel(
        sighting
      );

    return [
      location === "–" ? "" : location,
      String(
        sighting?.submission_id ?? ""
      ).trim()
    ]
      .filter(Boolean)
      .join(" · ") || "–";
  }

  function sightingPhotoMetadataLabel(
    photo,
    sighting
  ) {
    if (
      Number(photo?.metadata_version ?? 0) < 1
    ) {
      return "";
    }

    const captured =
      dateTime(
        photo?.captured_at ||
        sighting?.captured_at ||
        ""
      );

    const locationText =
      locationLabel(photo?.location);

    const locationDisplay =
      locationText === "–"
        ? "Aufnahmeort unbekannt"
        : locationText;

    return [
      captured,
      locationDisplay
    ]
      .filter(valueText =>
        valueText && valueText !== "–"
      )
      .join(" · ");
  }

  function sightingMetadataLabel(sighting) {
    return [
      movementLabel(sighting?.movement),
      directionLabel(sighting?.direction),
      berthLabel(sighting?.berth)
    ]
      .filter(Boolean)
      .join(" · ");
  }

  function directPhotoMetadataLabel(photo) {
    const captured =
      dateTime(
        photo?.captured_at ||
        photo?.added_at ||
        ""
      );

    const locationText =
      locationLabel(photo?.location);

    const locationDisplay =
      locationText === "–"
        ? "Aufnahmeort unbekannt"
        : locationText;

    return [
      captured,
      locationDisplay
    ]
      .filter(valueText =>
        valueText && valueText !== "–"
      )
      .join(" · ");
  }

  function directPhotoRelation(photo) {
    const type =
      String(photo?.relation?.type || "").trim() === "sighting"
        ? "sighting"
        : "vessel";
    const submissionId =
      type === "sighting"
        ? String(photo?.relation?.submission_id || "").trim()
        : "";

    return {
      type: submissionId ? "sighting" : "vessel",
      submission_id: submissionId
    };
  }

  function linkedDirectPhotosForSighting(
    sighting,
    directPhotos = currentPayload?.direct_photos
  ) {
    const submissionId = String(
      sighting?.submission_id || ""
    ).trim();
    if (!submissionId) return [];

    return (Array.isArray(directPhotos) ? directPhotos : [])
      .filter(photo => {
        const relation = directPhotoRelation(photo);
        return (
          relation.type === "sighting" &&
          relation.submission_id === submissionId
        );
      });
  }

  function relatedSightingForDirectPhoto(
    photo,
    sightings = currentPayload?.sightings
  ) {
    const relation = directPhotoRelation(photo);
    if (relation.type !== "sighting") return null;

    return (Array.isArray(sightings) ? sightings : [])
      .find(sighting =>
        String(sighting?.submission_id || "").trim() ===
          relation.submission_id
      ) || null;
  }

  function sightingChoiceLabel(sighting) {
    return [
      dateTime(sighting?.captured_at),
      sightingPlaceLabel(sighting),
      String(sighting?.submission_id || "").trim()
    ].filter(Boolean).join(" · ");
  }

  async function saveDirectPhotoRelation(
    photo,
    select,
    button
  ) {
    const photoId = String(photo?.photo_id || "").trim();
    if (!photoId) return;

    const submissionId = String(select.value || "").trim();
    const relationType = submissionId ? "sighting" : "vessel";
    const originalText = button.textContent;

    button.disabled = true;
    select.disabled = true;
    button.textContent = "Speichert …";
    pageStatus.className = "page-status";
    pageStatus.textContent = "Foto-Zuordnung wird gespeichert …";

    try {
      const response =
        await window.VesselApi.updateVesselPhotoRelation({
          workerUrl,
          apiKey: apiKey.value,
          vesselId,
          photoId,
          relationType,
          submissionId
        });

      await load();
      pageStatus.className = "page-status success";

      const mapIndexUpdated =
        response?.data?.map_index_updated === true;

      pageStatus.textContent = submissionId
        ? (
          mapIndexUpdated
            ? "Das Zusatzfoto wurde der Sichtung zugeordnet; die Gesamtkarte ist ebenfalls aktualisiert."
            : "Das Zusatzfoto wurde der Sichtung zugeordnet. Für die Gesamtkarte bitte einmal den Rebuild ausführen."
        )
        : (
          mapIndexUpdated
            ? "Der Sichtungsbezug wurde entfernt; die Gesamtkarte ist ebenfalls aktualisiert."
            : "Der Sichtungsbezug wurde entfernt. Für die Gesamtkarte bitte einmal den Rebuild ausführen."
        );
    } catch (error) {
      pageStatus.className = "page-status error";
      pageStatus.textContent =
        error instanceof Error ? error.message : String(error);
      button.disabled = false;
      select.disabled = false;
      button.textContent = originalText;
    }
  }

  function createDirectPhotoRelationControl(
    photo,
    sightings
  ) {
    const details = document.createElement("details");
    details.className = "photo-relation-control";

    const summary = document.createElement("summary");
    summary.textContent = "Zuordnung ändern";
    details.append(summary);

    const fields = document.createElement("div");
    fields.className = "photo-relation-fields";

    const label = document.createElement("label");
    const title = document.createElement("span");
    title.textContent = "Zuordnung";

    const select = document.createElement("select");
    select.setAttribute(
      "aria-label",
      "Zusatzfoto einer Sichtung zuordnen"
    );

    const vesselOnly = document.createElement("option");
    vesselOnly.value = "";
    vesselOnly.textContent = "Nur zum Schiff";
    select.append(vesselOnly);

    (Array.isArray(sightings) ? sightings : [])
      .forEach(sighting => {
        const submissionId = String(
          sighting?.submission_id || ""
        ).trim();
        if (!submissionId) return;
        const option = document.createElement("option");
        option.value = submissionId;
        option.textContent = sightingChoiceLabel(sighting);
        select.append(option);
      });

    const relation = directPhotoRelation(photo);
    select.value = relation.type === "sighting"
      ? relation.submission_id
      : "";

    const saveButton = document.createElement("button");
    saveButton.type = "button";
    saveButton.className = "secondary-button photo-relation-save";
    saveButton.textContent = "Speichern";
    saveButton.disabled = !photo?.photo_id;
    saveButton.addEventListener("click", () =>
      saveDirectPhotoRelation(photo, select, saveButton)
    );

    label.append(title, select);
    fields.append(label, saveButton);
    details.append(fields);
    return details;
  }

  function loadScriptOnce(src, test) {
    if (test()) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const existing = [...document.scripts].find(script => script.src === new URL(src, document.baseURI).href);
      if (existing) {
        existing.addEventListener("load", resolve, { once: true });
        existing.addEventListener("error", () => reject(new Error(`${src} konnte nicht geladen werden.`)), { once: true });
        return;
      }
      const script = document.createElement("script");
      script.src = src;
      script.addEventListener("load", resolve, { once: true });
      script.addEventListener("error", () => reject(new Error(`${src} konnte nicht geladen werden.`)), { once: true });
      document.head.append(script);
    });
  }

  async function ensureMapDependencies() {
    if (!mapDependenciesPromise) {
      mapDependenciesPromise = (async () => {
        if (!document.querySelector('link[data-danube-leaflet]')) {
          const link = document.createElement("link");
          link.rel = "stylesheet";
          link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
          link.dataset.danubeLeaflet = "true";
          document.head.append(link);
        }
        await loadScriptOnce(
          "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js",
          () => Boolean(window.L)
        );
        await loadScriptOnce(
          "js/location_map.js",
          () => Boolean(window.DanubeLocationMap)
        );
      })();
    }
    return mapDependenciesPromise;
  }

  function ensurePhotoMapUi() {
    if (photoMapModal) return;

    photoMapModal = document.createElement("div");
    photoMapModal.id = "photoMapModal";
    photoMapModal.className = "photo-map-modal hidden";
    photoMapModal.setAttribute("role", "dialog");
    photoMapModal.setAttribute("aria-modal", "true");
    photoMapModal.setAttribute("aria-labelledby", "photoMapTitle");
    photoMapModal.innerHTML = `
      <div class="photo-map-dialog">
        <header class="photo-map-header">
          <div>
            <h2 id="photoMapTitle">Aufnahmeort</h2>
            <p id="photoMapInfo"></p>
          </div>
          <button id="closePhotoMapButton" class="secondary-button photo-map-close" type="button" aria-label="Karte schließen">×</button>
        </header>
        <div id="photoMapCanvas" class="photo-map-canvas"></div>
      </div>`;
    document.body.append(photoMapModal);

    photoMapCanvas = byId("photoMapCanvas");
    photoMapInfo = byId("photoMapInfo");
    closePhotoMapButton = byId("closePhotoMapButton");

    closePhotoMapButton.addEventListener("click", closePhotoMapModal);
    photoMapModal.addEventListener("click", event => {
      if (event.target === photoMapModal) closePhotoMapModal();
    });
  }

  async function ensurePhotoMap() {
    ensurePhotoMapUi();
    await ensureMapDependencies();
    const maps = window.DanubeLocationMap;
    if (!maps || !window.L) {
      throw new Error("Die Kartenbibliothek konnte nicht geladen werden.");
    }

    if (!photoMap) {
      photoMap = maps.createMap(photoMapCanvas, { zoom: 17 });
    }

    if (!photoMapAreasPromise) {
      photoMapAreasPromise = maps.loadAreas();
    }

    const areas = await photoMapAreasPromise;

    if (!photoMapAreaLayers) {
      photoMapAreaLayers = maps.addAreaLayers(photoMap, areas, {
        addToMap: true,
        fillOpacity: 0.22,
        weight: 4
      });
    }

    if (!photoMapBerthsPromise && workerUrl) {
      photoMapBerthsPromise = maps.loadBerths(workerUrl, "LOC-001")
        .catch(() => []);
    }
    if (!photoMapBerthGeometriesPromise) {
      photoMapBerthGeometriesPromise = maps.loadBerthGeometries()
        .catch(() => []);
    }

    if (photoMapBerthsPromise) {
      photoMapBerths = await photoMapBerthsPromise;
    }
    const berthGeometryFeatures =
      await photoMapBerthGeometriesPromise;
    photoMapBerthGeometryIndex =
      maps.indexBerthGeometries(berthGeometryFeatures);

    if (!photoMapBerthLayers && photoMapBerths.length) {
      photoMapBerthLayers = maps.addBerthLayers(
        photoMap,
        photoMapBerths,
        {
          addToMap: true,
          geometryIndex: photoMapBerthGeometryIndex
        }
      );
    }

    return {
      maps,
      areas,
      berths: photoMapBerths,
      berthGeometryIndex: photoMapBerthGeometryIndex
    };
  }

  async function openPhotoMapModal(
    photo,
    fallbackCapturedAt = "",
    sighting = null
  ) {
    ensurePhotoMapUi();
    photoMapModal.classList.remove("hidden");
    document.body.classList.add("photo-map-open");

    try {
      const context = await ensurePhotoMap();
      const selectedCoords = context.maps.validCoordinates(
        photo?.photo_lat,
        photo?.photo_lon
      );
      if (!selectedCoords) {
        closePhotoMapModal();
        return;
      }

      photoMap.invalidateSize();

      for (const marker of photoMapMarkers) {
        if (marker && photoMap.hasLayer(marker)) {
          photoMap.removeLayer(marker);
        }
      }
      for (const line of photoMapConnectionLines) {
        if (line && photoMap.hasLayer(line)) {
          photoMap.removeLayer(line);
        }
      }
      if (
        photoMapVesselMarker &&
        photoMap.hasLayer(photoMapVesselMarker)
      ) {
        photoMap.removeLayer(photoMapVesselMarker);
      }

      photoMapMarkers = [];
      photoMapConnectionLines = [];
      photoMapVesselMarker = null;

      const capturedAt = String(
        photo?.captured_at || fallbackCapturedAt || ""
      ).trim();
      const selectedMatches = context.maps.matchingAreas(
        context.areas,
        selectedCoords.latitude,
        selectedCoords.longitude
      );
      const inferred = selectedMatches[0]
        ? context.maps.areaName(selectedMatches[0])
        : "Kein Polygon-Treffer";
      const stored = locationLabel(photo?.location);
      const vesselName =
        currentVessel?.identity?.name ||
        currentVessel?.name ||
        vesselId;

      const infoParts = [
        vesselName ? `Schiff: ${vesselName}` : "",
        context.maps.formatDateTime(capturedAt),
        `GPS: ${selectedCoords.latitude.toFixed(7)} / ${selectedCoords.longitude.toFixed(7)}`,
        stored && stored !== "–" ? `gespeichert: ${stored}` : "",
        `Polygon: ${inferred}`
      ];

      const photoKey = item =>
        String(item?.photo_id || "").trim() ||
        String(item?.path || "").trim() ||
        [
          item?.photo_lat,
          item?.photo_lon,
          item?.captured_at
        ].join("|");

      const selectedKey = photoKey(photo);
      const contextPhotos = sighting
        ? [
            ...(Array.isArray(sighting?.photos)
              ? sighting.photos
              : []),
            ...linkedDirectPhotosForSighting(sighting)
          ]
        : [photo];

      if (!contextPhotos.some(item => photoKey(item) === selectedKey)) {
        contextPhotos.push(photo);
      }

      const uniquePhotos = [];
      const seenPhotoKeys = new Set();
      for (const item of contextPhotos) {
        const key = photoKey(item);
        if (!key || seenPhotoKeys.has(key)) continue;
        seenPhotoKeys.add(key);
        uniquePhotos.push(item);
      }

      const bounds = L.latLngBounds();
      let selectedMarker = null;
      let validPhotoCount = 0;

      for (const mapPhoto of uniquePhotos) {
        const coords = context.maps.validCoordinates(
          mapPhoto?.photo_lat,
          mapPhoto?.photo_lon
        );
        if (!coords) continue;

        validPhotoCount += 1;
        bounds.extend([coords.latitude, coords.longitude]);

        const isSelected = photoKey(mapPhoto) === selectedKey;
        const mapCapturedAt = String(
          mapPhoto?.captured_at ||
          sighting?.captured_at ||
          fallbackCapturedAt ||
          ""
        ).trim();
        const matches = context.maps.matchingAreas(
          context.areas,
          coords.latitude,
          coords.longitude
        );
        const photoInferred = matches[0]
          ? context.maps.areaName(matches[0])
          : "Kein Polygon-Treffer";
        const photoStored = locationLabel(mapPhoto?.location);
        const relation = directPhotoRelation(mapPhoto);
        const isDirect =
          String(mapPhoto?.source || "").includes("direct") ||
          relation.type === "sighting";

        const marker = context.maps.createPhotoMarker(
          photoMap,
          {
            ...mapPhoto,
            source_type: isDirect ? "direct" : "sighting",
            captured_at: mapCapturedAt,
            vessel_id: vesselId,
            vessel_name: vesselName,
            submission_id:
              sighting?.submission_id ||
              relation.submission_id ||
              mapPhoto?.submission_id ||
              "",
            location: {
              ...(mapPhoto?.location || {}),
              name:
                photoStored && photoStored !== "–"
                  ? photoStored
                  : photoInferred
            }
          },
          isSelected
            ? {
                color: "#991b1b",
                fillColor: "#ffffff",
                radius: 9,
                weight: 4
              }
            : {
                radius: 7,
                weight: 2
              }
        );

        if (marker) {
          photoMapMarkers.push(marker);
          if (isSelected) selectedMarker = marker;
        }
      }

      let berthCoordinates = null;
      const berthId = String(sighting?.berth?.id || "").trim();

      if (
        String(sighting?.movement || "") === "moored" &&
        berthId
      ) {
        const berth = (context.berths || []).find(
          item => String(item?.berth_id || "").trim() === berthId
        );

        berthCoordinates = context.maps.berthAnchorCoordinates(
          context.berthGeometryIndex,
          berth
        ) || context.maps.validCoordinates(
          berth?.latitude,
          berth?.longitude
        );

        if (berth && berthCoordinates) {
          const vesselDisplayCoordinates =
            context.maps.berthRiverwardDisplayCoordinates(
              photoMap,
              berth,
              context.berthGeometryIndex,
              { distanceMeters: 10 }
            ) || berthCoordinates;

          bounds.extend([
            berthCoordinates.latitude,
            berthCoordinates.longitude
          ]);
          bounds.extend([
            vesselDisplayCoordinates.latitude,
            vesselDisplayCoordinates.longitude
          ]);

          photoMapVesselMarker =
            context.maps.createVesselBerthMarker(
              photoMap,
              {
                vessel_id: vesselId,
                vessel_name: vesselName,
                captured_at:
                  sighting?.captured_at || capturedAt,
                submission_id:
                  sighting?.submission_id || "",
                direction: sighting?.direction || "",
                berth: sighting?.berth || {}
              },
              berth,
              {
                displayCoordinates: vesselDisplayCoordinates
              }
            );

          for (const mapPhoto of uniquePhotos) {
            const coords = context.maps.validCoordinates(
              mapPhoto?.photo_lat,
              mapPhoto?.photo_lon
            );
            if (!coords) continue;

            const line =
              context.maps.createPhotoVesselConnection(
                photoMap,
                coords,
                vesselDisplayCoordinates,
                {
                  tooltip:
                    `${vesselName}: Foto-Aufnahmeort → ` +
                    `${berth?.short_name || berth?.public_name || berthId}`
                }
              );

            if (line) {
              photoMapConnectionLines.push(line);
            }
          }

          const berthName =
            berth?.short_name ||
            berth?.public_name ||
            sighting?.berth?.short_name ||
            sighting?.berth?.name ||
            berthId;

          infoParts.push(
            `Sichtung: ${sighting?.submission_id || "–"}`,
            `${validPhotoCount} Aufnahmeort${validPhotoCount === 1 ? "" : "e"}`,
            `Schiffmarker: ${berthName} (aus Liegekante abgeleitet)`
          );
        }
      }

      photoMapInfo.textContent =
        infoParts.filter(Boolean).join(" · ");

      if (bounds.isValid()) {
        if (bounds.getNorthEast().equals(bounds.getSouthWest())) {
          photoMap.setView(
            [selectedCoords.latitude, selectedCoords.longitude],
            18
          );
        } else {
          photoMap.fitBounds(bounds.pad(0.25), { maxZoom: 18 });
        }
      }

      selectedMarker?.openPopup();
    } catch (error) {
      photoMapInfo.textContent =
        error instanceof Error ? error.message : String(error);
    }
  }

  function closePhotoMapModal() {
    if (!photoMapModal) return;
    photoMapModal.classList.add("hidden");
    document.body.classList.remove("photo-map-open");
  }

  function createPhotoMapLink(
    photo,
    fallbackCapturedAt = "",
    sighting = null
  ) {
    const latitude = Number(String(photo?.photo_lat ?? "").replace(",", "."));
    const longitude = Number(String(photo?.photo_lon ?? "").replace(",", "."));
    if (
      !Number.isFinite(latitude) || !Number.isFinite(longitude) ||
      latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180 ||
      (latitude === 0 && longitude === 0)
    ) return null;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "photo-map-link";
    button.textContent = "Auf Karte";
    button.title = "Aufnahmeort mit Standortpolygonen anzeigen";
    button.addEventListener("click", () => {
      openPhotoMapModal(
        photo,
        fallbackCapturedAt,
        sighting
      );
    });
    return button;
  }

  function safeUrl(valueText) {
    try {
      const url = new URL(valueText);

      return ["http:", "https:"].includes(
        url.protocol
      )
        ? url.href
        : "";
    } catch {
      return "";
    }
  }

  function createTextElement(
    tagName,
    className,
    text
  ) {
    const element =
      document.createElement(tagName);

    element.className = className;
    element.textContent = text;

    return element;
  }

  function replaceSelectOptions(
    select,
    options,
    selectedValue
  ) {
    select.replaceChildren();
  
    for (
      const optionData
      of options
    ) {
      const option =
        document.createElement("option");
  
      option.value =
        optionData.value;
  
      option.textContent =
        optionData.label;
  
      select.append(option);
    }
  
    select.value =
      selectedValue;
  
    if (
      select.value !==
      selectedValue
    ) {
      select.value =
        options[0]?.value ?? "";
    }
  }
  
  function populateShipTypeSelect(
    currentValue
  ) {
    const rawValue =
      String(currentValue ?? "")
        .trim();
  
    const canonicalValue =
      reference.canonicalShipType(
        rawValue
      );
  
    const options =
      reference
        .getShipTypes()
        .map(type => ({
          value: type.code,
          label: type.label
        }));
  
    let selectedValue =
      canonicalValue ||
      rawValue ||
      "UNKNOWN";
  
    if (
      rawValue &&
      !canonicalValue
    ) {
      options.push({
        value: rawValue,
        label:
          `Bisheriger Wert: ${rawValue}`
      });
    }
  
    replaceSelectOptions(
      byId("editShipType"),
      options,
      selectedValue
    );
  }
  
  function populateShipSubtypeSelect(
    typeValue,
    currentValue
  ) {
    const rawValue =
      String(currentValue ?? "")
        .trim();
  
    const canonicalType =
      reference.canonicalShipType(
        typeValue
      ) ||
      String(typeValue ?? "").trim();
  
    const canonicalSubtype =
      reference.canonicalShipSubtype(
        canonicalType,
        rawValue
      );
  
    const options =
      reference
        .getShipSubtypes(
          canonicalType
        )
        .map(subtype => ({
          value: subtype.code,
          label: subtype.label
        }));
  
    let selectedValue =
      canonicalSubtype ||
      rawValue ||
      "UNKNOWN";
  
    if (
      rawValue &&
      !canonicalSubtype &&
      !options.some(
        option =>
          option.value === rawValue
      )
    ) {
      options.push({
        value: rawValue,
        label:
          `Bisheriger Wert: ${rawValue}`
      });
    }
  
    if (
      !options.some(
        option =>
          option.value ===
          selectedValue
      )
    ) {
      selectedValue =
        options[0]?.value ??
        "UNKNOWN";
    }
  
    replaceSelectOptions(
      byId("editShipSubtype"),
      options,
      selectedValue
    );
  }
  
  function populateFlagSelect(
    currentValue
  ) {
    const rawValue =
      String(currentValue ?? "")
        .trim()
        .toUpperCase();
  
    const options = [
      {
        value: "",
        label: "Nicht angegeben"
      },
  
      ...reference
        .getFlags()
        .map(flag => ({
          value: flag.code,
          label:
            reference.flagLabel(
              flag.code
            )
        }))
    ];
  
    if (
      rawValue &&
      !options.some(
        option =>
          option.value ===
          rawValue
      )
    ) {
      options.push({
        value: rawValue,
        label:
          `Bisheriger Wert: ` +
          `${reference.flagLabel(rawValue)}`
      });
    }
  
    replaceSelectOptions(
      byId("editFlag"),
      options,
      rawValue
    );
  }
  
  function populateSourceProviderSelect(
    currentValue = ""
  ) {
    const rawValue =
      String(currentValue ?? "")
        .trim();
  
    const canonicalValue =
      reference
        .canonicalSourceProvider(
          rawValue
        );
  
    const options = [
      {
        value: "",
        label: "Bitte wählen"
      },
  
      ...reference
        .getSourceProviders()
        .map(provider => ({
          value: provider.value,
          label: provider.label
        }))
    ];
  
    const selectedValue =
      canonicalValue ||
      rawValue;
  
    if (
      rawValue &&
      !canonicalValue
    ) {
      options.push({
        value: rawValue,
        label:
          `Bisheriger Wert: ${rawValue}`
      });
    }
  
    replaceSelectOptions(
      byId("sourceProvider"),
      options,
      selectedValue
    );
  }
  
  function renderSourceFieldChoices(
    selectedPaths = []
  ) {
    const container =
      byId("sourceFieldsUsed");
  
    const selected =
      new Set(
        Array.isArray(
          selectedPaths
        )
          ? selectedPaths
          : []
      );
  
    container.replaceChildren();
  
    for (
      const field
      of reference.getSourceFields()
    ) {
      const label =
        document.createElement("label");
  
      label.className =
        "source-field-choice";
  
      const checkbox =
        document.createElement("input");
  
      checkbox.type = "checkbox";
      checkbox.value = field.path;
  
      checkbox.checked =
        selected.has(
          field.path
        );
  
      const text =
        document.createElement("span");
  
      text.textContent =
        field.label;
  
      label.append(
        checkbox,
        text
      );
  
      container.append(label);
    }
  }
  
  function getSelectedSourceFields() {
    return [
      ...byId("sourceFieldsUsed")
        .querySelectorAll(
          'input[type="checkbox"]:checked'
        )
    ].map(
      checkbox =>
        checkbox.value
    );
  }  

  async function postManagementRequest(
    endpoint,
    payload
  ) {
    const headers = {
      "Content-Type": "application/json"
    };
  
    const suppliedApiKey =
      apiKey.value.trim();
  
    if (suppliedApiKey) {
      headers["X-API-Key"] =
        suppliedApiKey;
    }
  
    const response = await fetch(
      `${workerUrl}${endpoint}`,
      {
        method: "POST",
        headers,
        body: JSON.stringify(payload)
      }
    );
  
    let result = {};
  
    try {
      result = await response.json();
    } catch {
      result = {};
    }
  
    if (
      !response.ok ||
      result.ok !== true
    ) {
      throw new Error(
        result.error ||
        `Der Worker antwortete mit HTTP ${response.status}.`
      );
    }
  
    return result;
  }

  async function getManagementRequest(endpoint) {
    const headers = {};
    const suppliedApiKey = apiKey.value.trim();

    if (suppliedApiKey) {
      headers["X-API-Key"] = suppliedApiKey;
    }

    const response = await fetch(
      `${workerUrl}${endpoint}`,
      { headers }
    );

    let result = {};

    try {
      result = await response.json();
    } catch {
      result = {};
    }

    if (!response.ok || result.ok !== true) {
      throw new Error(
        result.error ||
        `Der Worker antwortete mit HTTP ${response.status}.`
      );
    }

    return result;
  }

  function updateVesselNavigation() {
    const currentIndex =
      vesselNavigation.findIndex(
        vessel =>
          vessel.vessel_id === vesselId
      );

    const previousVessel =
      currentIndex > 0
        ? vesselNavigation[
            currentIndex - 1
          ]
        : null;

    const nextVessel =
      currentIndex >= 0 &&
      currentIndex <
        vesselNavigation.length - 1
        ? vesselNavigation[
            currentIndex + 1
          ]
        : null;

    const navigationBlocked =
      editModeActive ||
      sourceFormActive ||
      deletePanelActive ||
      deleteBusy;

    prepareDeleteButton.disabled =
      navigationBlocked ||
      !currentVessel;

    previousVesselButton.disabled =
      navigationBlocked ||
      !previousVessel;

    nextVesselButton.disabled =
      navigationBlocked ||
      !nextVessel;

    previousVesselButton.dataset.vesselId =
      previousVessel?.vessel_id ?? "";

    nextVesselButton.dataset.vesselId =
      nextVessel?.vessel_id ?? "";

    const previousLabel = previousVessel
      ? `Vorheriges Schiff: ${
          previousVessel.name ||
          previousVessel.vessel_id
        }`
      : "Kein vorheriges Schiff";

    const nextLabel = nextVessel
      ? `Nächstes Schiff: ${
          nextVessel.name ||
          nextVessel.vessel_id
        }`
      : "Kein nächstes Schiff";

    previousVesselButton.title =
      previousLabel;

    previousVesselButton.setAttribute(
      "aria-label",
      previousLabel
    );

    nextVesselButton.title =
      nextLabel;

    nextVesselButton.setAttribute(
      "aria-label",
      nextLabel
    );

    vesselPosition.textContent =
      currentIndex >= 0
        ? `${currentIndex + 1} / ${
            vesselNavigation.length
          }`
        : "– / –";
  }

  async function loadVesselNavigation() {
    vesselNavigation = [];
    updateVesselNavigation();

    try {
      const result =
        await getManagementRequest(
          "/vessels"
        );

      vesselNavigation = (
        Array.isArray(result.vessels)
          ? result.vessels
          : []
      )
        .filter(vessel =>
          /^VES-\d{6}$/.test(
            String(
              vessel?.vessel_id ?? ""
            ).trim()
          )
        )
        .map(vessel => ({
          vessel_id:
            String(
              vessel.vessel_id
            ).trim(),

          name:
            String(
              vessel.name ?? ""
            ).trim()
        }))
        .sort(
          (left, right) =>
            left.vessel_id.localeCompare(
              right.vessel_id
            )
        );
    } catch (error) {
      vesselNavigation = [];

      console.warn(
        "Die Schiffsnavigation konnte " +
        "nicht geladen werden.",
        error
      );
    }

    updateVesselNavigation();
  }

  function openVessel(vesselIdToOpen) {
    const targetId =
      String(
        vesselIdToOpen ?? ""
      ).trim();

    if (
      editModeActive ||
      sourceFormActive ||
      deletePanelActive ||
      deleteBusy ||
      !/^VES-\d{6}$/.test(targetId)
    ) {
      return;
    }

    const targetUrl =
      new URL(window.location.href);

    targetUrl.searchParams.set(
      "id",
      targetId
    );

    window.location.assign(
      targetUrl.href
    );
  }  

  function updateDeleteConfirmation() {
    const expected =
      deletePreview?.confirmation_text ?? "";

    confirmDeleteButton.disabled =
      deleteBusy ||
      !expected ||
      deleteConfirmationInput
        .value
        .trim() !== expected;
  }

  function setDeleteBusy(busy) {
    deleteBusy = Boolean(busy);

    deleteConfirmationInput.disabled =
      deleteBusy;

    cancelDeleteButton.disabled =
      deleteBusy;

    confirmDeleteButton.textContent =
      deleteBusy
        ? "Schiff wird gelöscht …"
        : "Schiff endgültig löschen";

    editButton.disabled =
      deleteBusy ||
      deletePanelActive ||
      editModeActive ||
      !currentVessel;

    addSourceButton.disabled =
      deleteBusy ||
      deletePanelActive ||
      sourceFormActive ||
      !currentVessel ||
      !referenceReady;

    reloadButton.disabled =
      deleteBusy ||
      deletePanelActive ||
      editModeActive;

    updateVesselNavigation();
    updateDeleteConfirmation();
  }

  function closeDeletePanel() {
    if (deleteBusy) return;

    deletePanelActive = false;
    deletePreview = null;

    deleteConfirmationInput.value = "";
    deleteConfirmationInput.disabled = false;

    deleteVesselStatus.className =
      "delete-vessel-status";

    deleteVesselStatus.textContent = "";

    deleteVesselPanel.classList.add(
      "hidden"
    );

    editButton.disabled =
      editModeActive ||
      !currentVessel;

    addSourceButton.disabled =
      sourceFormActive ||
      !currentVessel ||
      !referenceReady;

    reloadButton.disabled =
      editModeActive;

    updateVesselNavigation();
    updateDeleteConfirmation();
  }

  async function loadDeletePreview() {
    if (
      !currentVessel ||
      editModeActive ||
      sourceFormActive ||
      deleteBusy
    ) {
      return;
    }

    deletePanelActive = true;
    deletePreview = null;

    deleteVesselPanel.classList.remove(
      "hidden"
    );

    deletePreviewVessel.textContent =
      `${vesselId} – ${
        currentVessel.identity?.name ||
        vesselId
      }`;

    deletePreviewSubmissions.textContent =
      "…";

    deletePreviewPhotos.textContent =
      "…";

    deletePreviewMissingPhotos.textContent =
      "…";

    deleteConfirmationExpected.textContent =
      `${vesselId} LÖSCHEN`;

    deleteConfirmationInput.value = "";

    deleteVesselStatus.className =
      "delete-vessel-status";

    deleteVesselStatus.textContent =
      "Löschumfang wird ermittelt …";

    editButton.disabled = true;
    addSourceButton.disabled = true;
    reloadButton.disabled = true;

    updateVesselNavigation();
    updateDeleteConfirmation();

    deleteVesselPanel.scrollIntoView({
      behavior: "smooth",
      block: "nearest"
    });

    try {
      const result =
        await getManagementRequest(
          "/vessel-delete-preview?" +
          "vessel_id=" +
          encodeURIComponent(vesselId)
        );

      deletePreview = result;

      deletePreviewVessel.textContent =
        `${result.vessel_id} – ${
          result.vessel_name ||
          result.vessel_id
        }`;

      deletePreviewSubmissions.textContent =
        String(
          result.submission_count ?? 0
        );

      deletePreviewPhotos.textContent =
        String(
          result.photo_count ?? 0
        );

      deletePreviewMissingPhotos.textContent =
        String(
          result.missing_photo_count ?? 0
        );

      deleteConfirmationExpected.textContent =
        result.confirmation_text;

      deleteVesselStatus.textContent =
        result.counters_will_be_created
          ? (
              "Die Löschvorschau ist bereit. " +
              "data/counters.json wird beim Löschen automatisch angelegt."
            )
          : "Die Löschvorschau ist bereit.";

      deleteConfirmationInput.focus();
    } catch (error) {
      deletePreview = null;

      deleteVesselStatus.className =
        "delete-vessel-status error";

      deleteVesselStatus.textContent =
        error instanceof Error
          ? error.message
          : String(error);
    }

    updateDeleteConfirmation();
  }

  async function deleteVesselCompletely() {
    const expected =
      deletePreview?.confirmation_text ?? "";

    if (
      !expected ||
      deleteConfirmationInput
        .value
        .trim() !== expected ||
      deleteBusy
    ) {
      updateDeleteConfirmation();
      return;
    }

    const finalConfirmation =
      window.confirm(
        `${vesselId} einschließlich aller zugeordneten ` +
        "Sichtungen und Fotos endgültig löschen?"
      );

    if (!finalConfirmation) return;

    setDeleteBusy(true);

    deleteVesselStatus.className =
      "delete-vessel-status";

    deleteVesselStatus.textContent =
      "Schiff, Sichtungen und Fotos werden atomar gelöscht …";

    let deletionSucceeded = false;

    try {
      const result =
        await postManagementRequest(
          "/vessel-delete",
          {
            vessel_id: vesselId,
            confirmation: expected
          }
        );

      deletionSucceeded = true;

      deleteVesselStatus.className =
        "delete-vessel-status success";

      deleteVesselStatus.textContent =
        `${result.message} ` +
        `${result.deleted_submission_count} Sichtung` +
        `${result.deleted_submission_count === 1 ? "" : "en"} und ` +
        `${result.deleted_photo_count} Foto` +
        `${result.deleted_photo_count === 1 ? "" : "s"} wurden entfernt.`;

      pageStatus.className =
        "page-status success";

      pageStatus.textContent =
        "Das Schiff wurde gelöscht. Die Schiffsliste wird geöffnet …";

      content.classList.add("hidden");

      window.setTimeout(
        () => {
          window.location.assign(
            "vessels.html"
          );
        },
        900
      );
    } catch (error) {
      deleteVesselStatus.className =
        "delete-vessel-status error";

      deleteVesselStatus.textContent =
        error instanceof Error
          ? error.message
          : String(error);
    } finally {
      if (!deletionSucceeded) {
        setDeleteBusy(false);
      }
    }
  }  

  function resetSourceForm() {
    editingSourceId = "";
  
    sourceForm.reset();
  
    byId("sourceFormTitle")
      .textContent =
        "Neue Quelle";
  
    saveSourceButton.textContent =
      "Quelle speichern";
  
    populateSourceProviderSelect("");
  
    byId("sourceTitle").value = "";
    byId("sourceUrl").value = "";
    byId("sourceNotes").value = "";
  
    byId("sourceVerified")
      .checked = false;
  
    renderSourceFieldChoices([]);
  }
  
  function populateSourceForm(
    source
  ) {
    editingSourceId =
      String(
        source?.source_id ?? ""
      ).trim();
  
    byId("sourceFormTitle")
      .textContent =
        "Quelle bearbeiten";
  
    saveSourceButton.textContent =
      "Änderungen speichern";
  
    populateSourceProviderSelect(
      source?.provider
    );
  
    byId("sourceTitle").value =
      source?.title ?? "";
  
    byId("sourceUrl").value =
      source?.url ??
      source?.source_url ??
      "";
  
    byId("sourceNotes").value =
      source?.notes ?? "";
  
    byId("sourceVerified")
      .checked =
        Boolean(
          source?.verified_at
        );
  
    renderSourceFieldChoices(
      source?.fields_used
    );
  }
  
  function setSourceFormMode(
    enabled,
    source = null
  ) {
    sourceFormActive =
      Boolean(enabled);

    updateVesselNavigation();
  
    sourceForm.classList.toggle(
      "hidden",
      !sourceFormActive
    );
  
    addSourceButton.disabled =
      sourceFormActive ||
      !currentVessel ||
      !referenceReady;
  
    if (!sourceFormActive) {
      resetSourceForm();
      return;
    }
  
    if (source) {
      populateSourceForm(
        source
      );
    } else {
      resetSourceForm();
    }
  
    sourceForm.scrollIntoView({
      behavior: "smooth",
      block: "nearest"
    });
  
    byId("sourceProvider")
      .focus();
  }
  
  async function saveSource() {
    if (
      !sourceForm.reportValidity()
    ) {
      return;
    }
  
    const sourceWasEdited =
      Boolean(editingSourceId);
  
    const originalButtonText =
      saveSourceButton.textContent;
  
    saveSourceButton.disabled = true;
    cancelSourceButton.disabled = true;
  
    saveSourceButton.textContent =
      "Wird gespeichert …";
  
    pageStatus.className =
      "page-status";
  
    pageStatus.textContent = "";
  
    try {
      const payload = {
        vessel_id: vesselId,
  
        provider:
          byId("sourceProvider")
            .value
            .trim(),
  
        title:
          byId("sourceTitle")
            .value
            .trim(),
  
        url:
          byId("sourceUrl")
            .value
            .trim(),
  
        notes:
          byId("sourceNotes")
            .value
            .trim(),
  
        verified:
          byId("sourceVerified")
            .checked,
  
        fields_used:
          getSelectedSourceFields()
      };
  
      if (editingSourceId) {
        payload.source_id =
          editingSourceId;
      }
  
      await postManagementRequest(
        sourceWasEdited
          ? "/vessel-source-update"
          : "/vessel-source-add",
        payload
      );
  
      setSourceFormMode(false);
  
      await load();
  
      pageStatus.className =
        "page-status success";
  
      pageStatus.textContent =
        sourceWasEdited
          ? "Die Quelle wurde aktualisiert."
          : "Die Quelle wurde gespeichert.";
    } catch (error) {
      pageStatus.className =
        "page-status error";
  
      pageStatus.textContent =
        error instanceof Error
          ? error.message
          : String(error);
    } finally {
      saveSourceButton.disabled = false;
      cancelSourceButton.disabled = false;
  
      saveSourceButton.textContent =
        sourceWasEdited
          ? "Änderungen speichern"
          : "Quelle speichern";
    }
  }
  
  async function removeSource(
    source,
    button
  ) {
    const sourceId =
      typeof source?.source_id === "string"
        ? source.source_id.trim()
        : "";
  
    if (!sourceId) {
      pageStatus.className =
        "page-status error";
  
      pageStatus.textContent =
        "Diese Quelle besitzt keine gültige Source-ID.";
  
      return;
    }
  
    const sourceName =
      source.title ||
      source.provider ||
      "Quelle";
  
    const confirmed = window.confirm(
      `Quelle „${sourceName}“ wirklich entfernen?`
    );
  
    if (!confirmed) {
      return;
    }
  
    const originalButtonText =
      button.textContent;
  
    button.disabled = true;
    button.textContent =
      "Wird entfernt …";
  
    pageStatus.className =
      "page-status";
  
    pageStatus.textContent = "";
  
    try {
      await postManagementRequest(
        "/vessel-source-remove",
        {
          vessel_id: vesselId,
          source_id: sourceId
        }
      );
  
      await load();
  
      pageStatus.className =
        "page-status success";
  
      pageStatus.textContent =
        "Die Quelle wurde entfernt.";
    } catch (error) {
      pageStatus.className =
        "page-status error";
  
      pageStatus.textContent =
        error instanceof Error
          ? error.message
          : String(error);
  
      button.disabled = false;
      button.textContent =
        originalButtonText;
    }
  }  

  function changeFieldLabel(fieldPath) {
    const sourceChangeLabels = {
      "sources.provider":
        "Quellenanbieter",
  
      "sources.title":
        "Quellentitel",
  
      "sources.url":
        "Quellen-URL",
  
      "sources.notes":
        "Quellennotiz",
  
      "sources.fields_used":
        "Übernommene Felder",
  
      "sources.verified":
        "Prüfstatus"
    };
  
    return (
      sourceChangeLabels[fieldPath] ||
      reference.sourceFieldLabel(
        fieldPath
      )
    );
  }
  
  function changeValueLabel(
    valueToFormat,
    fieldPath = ""
  ) {
    if (
      valueToFormat === null ||
      valueToFormat === undefined ||
      valueToFormat === ""
    ) {
      return "leer";
    }
  
    if (Array.isArray(valueToFormat)) {
      if (valueToFormat.length === 0) {
        return "leer";
      }
  
      if (
        fieldPath ===
        "sources.fields_used"
      ) {
        return valueToFormat
          .map(field =>
            reference.sourceFieldLabel(
              field
            )
          )
          .join(", ");
      }
  
      return valueToFormat.join(", ");
    }

    if (
      fieldPath ===
      "classification.flag"
    ) {
      return reference.flagLabel(
        valueToFormat
      );
    }    
  
    if (
      fieldPath ===
      "classification.status"
    ) {
      return statusLabel(valueToFormat);
    }
  
    if (typeof valueToFormat === "boolean") {
      return valueToFormat
        ? "Ja"
        : "Nein";
    }
  
    if (typeof valueToFormat === "object") {
      try {
        return JSON.stringify(
          valueToFormat
        );
      } catch {
        return String(valueToFormat);
      }
    }
  
    return String(valueToFormat);
  }
  
  function renderChangeHistory(
    historyEntries
  ) {
    const historyList =
      byId("changeHistoryList");
  
    const historyEmpty =
      byId("changeHistoryEmpty");
  
    const entries =
      Array.isArray(historyEntries)
        ? [...historyEntries]
        : [];
  
    entries.sort(
      (left, right) =>
        String(right?.changed_at ?? "")
          .localeCompare(
            String(left?.changed_at ?? "")
          )
    );
  
    historyList.replaceChildren();
  
    set(
      "changeHistoryCount",
      String(entries.length)
    );
  
    if (entries.length === 0) {
      historyList.classList.add(
        "hidden"
      );
  
      historyEmpty.classList.remove(
        "hidden"
      );
  
      return;
    }
  
    for (const entry of entries) {
      const item =
        document.createElement("article");
  
      item.className =
        "change-history-item";
  
      const header =
        document.createElement("div");
  
      header.className =
        "change-history-header";
  
      const headerMain =
        document.createElement("div");
  
      headerMain.append(
        createTextElement(
          "h3",
          "change-history-date",
          dateTime(entry?.changed_at)
        )
      );
  
      const changedBy =
        typeof entry?.changed_by ===
          "string"
          ? entry.changed_by
          : "";
  
      if (changedBy) {
        headerMain.append(
          createTextElement(
            "p",
            "change-history-user",
            changedBy === "web-ui"
              ? "Bearbeitung über Weboberfläche"
              : changedBy ===
                  "web-ui-primary-photo"
                ? "Hauptfoto geändert"
                : changedBy
          )
        );
      }
  
      header.append(headerMain);
  
      const detailedChanges =
        Array.isArray(entry?.changes)
          ? entry.changes
          : [];
  
      const legacyFields =
        Array.isArray(
          entry?.changed_fields
        )
          ? entry.changed_fields
          : [];
  
      const changeCount =
        detailedChanges.length ||
        legacyFields.length;
  
      header.append(
        createTextElement(
          "span",
          "change-history-count",
          `${changeCount} ${
            changeCount === 1
              ? "Änderung"
              : "Änderungen"
          }`
        )
      );
  
      item.append(header);
      
      const historySummary =
        typeof entry?.summary === "string"
          ? entry.summary.trim()
          : "";
      
      if (historySummary) {
        item.append(
          createTextElement(
            "p",
            "change-history-summary",
            historySummary
          )
        );
      }
      
      if (detailedChanges.length > 0) {
        const changesContainer =
          document.createElement("div");
  
        changesContainer.className =
          "change-details";
  
        for (
          const change
          of detailedChanges
        ) {
          const fieldPath =
            typeof change?.field ===
              "string"
              ? change.field
              : "";
  
          const row =
            document.createElement("div");
  
          row.className =
            "change-detail-row";
  
          row.append(
            createTextElement(
              "div",
              "change-detail-field",
              changeFieldLabel(fieldPath)
            )
          );
  
          const values =
            document.createElement("div");
  
          values.className =
            "change-detail-values";
  
          const previousValue =
            createTextElement(
              "span",
              "change-old-value",
              changeValueLabel(
                change?.old_value,
                fieldPath
              )
            );
  
          const arrow =
            createTextElement(
              "span",
              "change-arrow",
              "→"
            );
  
          const newValue =
            createTextElement(
              "span",
              "change-new-value",
              changeValueLabel(
                change?.new_value,
                fieldPath
              )
            );
  
          values.append(
            previousValue,
            arrow,
            newValue
          );
  
          row.append(values);
          changesContainer.append(row);
        }
  
        item.append(changesContainer);
      } else if (legacyFields.length > 0) {
        const fieldList =
          document.createElement("div");
  
        fieldList.className =
          "change-field-list";
  
        for (const fieldPath of legacyFields) {
          fieldList.append(
            createTextElement(
              "span",
              "change-field-badge",
              changeFieldLabel(fieldPath)
            )
          );
        }
  
        item.append(fieldList);
  
        item.append(
          createTextElement(
            "p",
            "change-legacy-note",
            "Für diesen älteren Eintrag wurden noch keine Vorher-/Nachher-Werte gespeichert."
          )
        );
      } else {
        item.append(
          createTextElement(
            "p",
            "change-legacy-note",
            "Für diesen Eintrag sind keine Felddetails vorhanden."
          )
        );
      }
  
      historyList.append(item);
    }
  
    historyEmpty.classList.add(
      "hidden"
    );
  
    historyList.classList.remove(
      "hidden"
    );
  }  

  function setInputValue(id, inputValue) {
    byId(id).value =
      inputValue === null ||
      inputValue === undefined
        ? ""
        : String(inputValue);
  }
  
  function optionalNumber(id) {
    const rawValue =
      byId(id).value.trim();
  
    if (rawValue === "") {
      return null;
    }
  
    const parsedValue = Number(
      rawValue.replace(",", ".")
    );
  
    return Number.isFinite(parsedValue)
      ? parsedValue
      : null;
  }
  
  function optionalInteger(id) {
    const parsedValue =
      optionalNumber(id);
  
    if (parsedValue === null) {
      return null;
    }
  
    return Number.isInteger(parsedValue)
      ? parsedValue
      : null;
  }
  
  function parseFormerNames(valueText) {
    return [
      ...new Set(
        String(valueText)
          .split(/\r?\n/)
          .map(name => name.trim())
          .filter(Boolean)
      )
    ];
  }
  
  function getLinkedCandidateIds() {
    const sources = Array.isArray(currentVessel?.sources)
      ? currentVessel.sources
      : [];

    const audit = currentVessel?.audit || {};
    const candidateIds = [
      audit.created_from_candidate_id,
      ...(Array.isArray(audit.linked_candidate_ids)
        ? audit.linked_candidate_ids
        : []),
      ...sources.map(source => source?.candidate_id)
    ];

    return new Set(
      candidateIds
        .map(candidateId => String(candidateId ?? "").trim())
        .filter(candidateId => /^CAN-[A-F0-9]{12}$/.test(candidateId))
    );
  }

  function candidateConfidenceLabel(scoreValue) {
    const score = Number(scoreValue) || 0;
    const percentage = Math.round(score * 100);

    if (score >= 0.98) {
      return `sehr hoch · ${percentage} %`;
    }

    if (score >= 0.92) {
      return `hoch · ${percentage} %`;
    }

    return `möglich · ${percentage} %`;
  }

  function createNameMatchMetaItem(labelText, valueText) {
    if (
      valueText === null ||
      valueText === undefined ||
      String(valueText).trim() === ""
    ) {
      return null;
    }

    const item = document.createElement("div");
    const label = document.createElement("span");
    const content = document.createElement("strong");

    label.textContent = `${labelText}:`;
    content.textContent = String(valueText);
    item.append(label, content);

    return item;
  }

  function createNameMatchCard({
    title,
    identifier,
    score,
    metadata,
    sourceUrl = "",
    actionLabel,
    onAction
  }) {
    const card = document.createElement("article");
    card.className = "edit-name-match-card";

    const header = document.createElement("div");
    header.className = "edit-name-match-card-header";

    const heading = document.createElement("div");
    const name = document.createElement("h5");
    const id = document.createElement("span");
    const confidence = document.createElement("span");

    name.textContent = title;
    id.className = "edit-name-match-id";
    id.textContent = identifier;
    confidence.className = "edit-name-match-confidence";
    confidence.textContent = candidateConfidenceLabel(score);

    heading.append(name, id);
    header.append(heading, confidence);
    card.append(header);

    const metadataContainer = document.createElement("div");
    metadataContainer.className = "edit-name-match-meta";

    for (const [label, metadataValue] of metadata) {
      const item = createNameMatchMetaItem(label, metadataValue);
      if (item) metadataContainer.append(item);
    }

    if (metadataContainer.childElementCount > 0) {
      card.append(metadataContainer);
    }

    const actions = document.createElement("div");
    actions.className = "edit-name-match-actions";

    const normalizedSourceUrl = safeUrl(sourceUrl);

    if (normalizedSourceUrl) {
      const sourceLink = document.createElement("a");
      sourceLink.className = "edit-name-match-source";
      sourceLink.href = normalizedSourceUrl;
      sourceLink.target = "_blank";
      sourceLink.rel = "noopener noreferrer";
      sourceLink.textContent = "Quelle öffnen";
      actions.append(sourceLink);
    }

    const actionButton = document.createElement("button");
    actionButton.type = "button";
    actionButton.className = "primary-button";
    actionButton.textContent = actionLabel;
    actionButton.addEventListener("click", () => onAction(actionButton));
    actions.append(actionButton);

    card.append(actions);
    return card;
  }

  function clearEditNameMatches() {
    editNameSearchToken += 1;

    if (editNameSearchTimer) {
      clearTimeout(editNameSearchTimer);
      editNameSearchTimer = null;
    }

    editExistingNameMatches.replaceChildren();
    editCatalogNameMatches.replaceChildren();
    editNameMatchStatus.textContent = "";
    editNameMatchCount.textContent = "0";
    editNameMatchPanel.classList.add("hidden");
  }

  async function linkVesselCandidate(candidate, button) {
    const candidateId = String(candidate?.candidate_id ?? "").trim();

    if (!/^CAN-[A-F0-9]{12}$/.test(candidateId)) {
      pageStatus.className = "page-status error";
      pageStatus.textContent = "Der Katalogtreffer besitzt keine gültige Kandidaten-ID.";
      return;
    }

    const confirmed = window.confirm(
      `Soll ${candidateId} – ${candidate.name} mit ${vesselId} verknüpft werden? ` +
      "Bereits befüllte Stammdaten bleiben unverändert. Leere oder noch nicht " +
      "klassifizierte Felder werden übernommen; eine nur anders formatierte " +
      "Namensschreibweise wird auf die Katalogschreibweise vereinheitlicht."
    );

    if (!confirmed) return;

    const originalButtonText = button.textContent;
    button.disabled = true;
    button.textContent = "Wird verknüpft …";
    pageStatus.className = "page-status";
    pageStatus.textContent = "";

    try {
      const result = await postManagementRequest(
        "/vessel-candidate-link",
        {
          vessel_id: vesselId,
          candidate_id: candidateId
        }
      );

      if (
        result.vessel &&
        typeof result.vessel === "object" &&
        currentPayload
      ) {
        render({
          ...currentPayload,
          vessel: result.vessel,
          path: result.path || currentPayload.path || ""
        });

        populateEditForm(currentVessel);
      } else {
        await load();
        populateEditForm(currentVessel);
      }

      scheduleEditNameSearch();

      pageStatus.className = "page-status success";
      pageStatus.textContent = result.message;
    } catch (error) {
      pageStatus.className = "page-status error";
      pageStatus.textContent = error instanceof Error
        ? error.message
        : String(error);

      button.disabled = false;
      button.textContent = originalButtonText;
    }
  }

  function renderEditNameMatches(result) {
    const linkedCandidateIds = getLinkedCandidateIds();
    const existingMatches = Array.isArray(result?.existing_vessels)
      ? result.existing_vessels
      : [];

    const allCatalogMatches = Array.isArray(result?.catalog_candidates)
      ? result.catalog_candidates
      : [];

    const catalogMatches = allCatalogMatches.filter(
      candidate => !linkedCandidateIds.has(candidate.candidate_id)
    );

    const linkedMatches = allCatalogMatches.filter(
      candidate => linkedCandidateIds.has(candidate.candidate_id)
    );

    editExistingNameMatches.replaceChildren();
    editCatalogNameMatches.replaceChildren();

    const matchCount =
      existingMatches.length + catalogMatches.length + linkedMatches.length;

    editNameMatchCount.textContent = String(matchCount);

    if (matchCount === 0) {
      editNameMatchPanel.classList.add("hidden");
      return;
    }

    editNameMatchStatus.textContent = linkedMatches.length > 0
      ? "Der passende Katalogeintrag ist bereits verknüpft. Fehlende " +
        "Stammdaten können daraus übernommen werden."
      : `${existingMatches.length} ähnliche vorhandene ` +
        `${existingMatches.length === 1 ? "Schiff" : "Schiffe"} und ` +
        `${catalogMatches.length} Katalogtreffer.`;

    if (existingMatches.length > 0) {
      const heading = document.createElement("div");
      heading.className = "edit-name-match-group-title";
      heading.textContent = "Bereits vorhandene Schiffe";
      editExistingNameMatches.append(heading);

      for (const match of existingMatches) {
        editExistingNameMatches.append(
          createNameMatchCard({
            title: match.name || match.vessel_id,
            identifier: match.vessel_id,
            score: match.score,
            metadata: [
              ["ENI", match.eni],
              ["IMO", match.imo],
              ["Betreiber", match.operator],
              [
                "Flagge",
                match.flag ? reference.flagLabel(match.flag) : ""
              ]
            ],
            actionLabel: "Schiff öffnen",
            onAction: () => {
              window.location.href =
                `vessel.html?id=${encodeURIComponent(match.vessel_id)}`;
            }
          })
        );
      }
    }

    if (linkedMatches.length > 0) {
      const heading = document.createElement("div");
      heading.className = "edit-name-match-group-title";
      heading.textContent = "Bereits verknüpfter Kandidat";
      editCatalogNameMatches.append(heading);

      for (const candidate of linkedMatches) {
        const dimensions = [
          candidate.length_m ? `${candidate.length_m} m` : "",
          candidate.width_m ? `${candidate.width_m} m` : ""
        ]
          .filter(Boolean)
          .join(" × ");

        editCatalogNameMatches.append(
          createNameMatchCard({
            title: candidate.name || candidate.candidate_id,
            identifier: candidate.candidate_id,
            score: candidate.score,
            metadata: [
              ["ENI", candidate.eni],
              ["IMO", candidate.imo],
              ["Baujahr", candidate.year_built],
              ["Maße", dimensions],
              ["Passagiere", candidate.passengers],
              ["Betreiber", candidate.operator],
              ["Heimathafen", candidate.home_port],
              [
                "Flagge",
                candidate.flag ? reference.flagLabel(candidate.flag) : ""
              ]
            ],
            sourceUrl: candidate.article_url,
            actionLabel: "Katalogdaten übernehmen",
            onAction: button => linkVesselCandidate(candidate, button)
          })
        );
      }
    }

    if (catalogMatches.length > 0) {
      const heading = document.createElement("div");
      heading.className = "edit-name-match-group-title";
      heading.textContent = "Kandidatenkatalog";
      editCatalogNameMatches.append(heading);

      for (const candidate of catalogMatches) {
        const dimensions = [
          candidate.length_m ? `${candidate.length_m} m` : "",
          candidate.width_m ? `${candidate.width_m} m` : ""
        ]
          .filter(Boolean)
          .join(" × ");

        editCatalogNameMatches.append(
          createNameMatchCard({
            title: candidate.name || candidate.candidate_id,
            identifier: candidate.candidate_id,
            score: candidate.score,
            metadata: [
              ["ENI", candidate.eni],
              ["IMO", candidate.imo],
              ["Baujahr", candidate.year_built],
              ["Maße", dimensions],
              ["Passagiere", candidate.passengers],
              ["Betreiber", candidate.operator],
              ["Heimathafen", candidate.home_port],
              [
                "Flagge",
                candidate.flag ? reference.flagLabel(candidate.flag) : ""
              ]
            ],
            sourceUrl: candidate.article_url,
            actionLabel: "Mit diesem Kandidaten verknüpfen",
            onAction: button => linkVesselCandidate(candidate, button)
          })
        );
      }
    }

    editNameMatchPanel.classList.remove("hidden");
  }

  async function requestEditNameMatches() {
    const name = editName.value.trim();

    if (!editModeActive || !workerUrl || name.length < 2) {
      clearEditNameMatches();
      return;
    }

    const token = ++editNameSearchToken;
    editNameMatchPanel.classList.remove("hidden");
    editNameMatchStatus.textContent =
      "Vorhandene Schiffe und Katalogeinträge werden gesucht …";
    editNameMatchCount.textContent = "…";
    editExistingNameMatches.replaceChildren();
    editCatalogNameMatches.replaceChildren();

    try {
      const endpoint =
        `/vessel-name-suggestions?name=${encodeURIComponent(name)}` +
        `&exclude_vessel_id=${encodeURIComponent(vesselId)}`;

      const result = await getManagementRequest(endpoint);
      if (token !== editNameSearchToken) return;

      renderEditNameMatches(result);
    } catch (error) {
      if (token !== editNameSearchToken) return;

      editNameMatchStatus.textContent = error instanceof Error
        ? error.message
        : String(error);
      editNameMatchCount.textContent = "!";
      editExistingNameMatches.replaceChildren();
      editCatalogNameMatches.replaceChildren();
      editNameMatchPanel.classList.remove("hidden");
    }
  }

  function scheduleEditNameSearch() {
    if (editNameSearchTimer) {
      clearTimeout(editNameSearchTimer);
    }

    editNameSearchTimer = setTimeout(() => {
      editNameSearchTimer = null;
      requestEditNameMatches();
    }, 400);
  }

  function populateEditForm(vessel) {
    clearEditNameMatches();

    const identity =
      vessel?.identity || {};
  
    const classification =
      vessel?.classification || {};
  
    const technical =
      vessel?.technical || {};
  
    const operations =
      vessel?.operations || {};
  
    setInputValue(
      "editVesselId",
      vesselId
    );
  
    setInputValue(
      "editName",
      identity.name
    );
  
    setInputValue(
      "editFormerNames",
      Array.isArray(identity.former_names)
        ? identity.former_names.join("\n")
        : ""
    );
  
    setInputValue(
      "editMmsi",
      identity.mmsi
    );
  
    setInputValue(
      "editImo",
      identity.imo
    );
  
    setInputValue(
      "editEni",
      reference.normalizeEni(
        identity.eni
      )
    );
  
    setInputValue(
      "editCallSign",
      identity.call_sign
    );
  
    populateShipTypeSelect(
      classification.ship_type
    );
    
    populateShipSubtypeSelect(
      byId("editShipType").value,
      classification.ship_subtype
    );
    
    populateFlagSelect(
      classification.flag
    );
  
    setInputValue(
      "editStatus",
      classification.status || "unknown"
    );
  
    setInputValue(
      "editYearBuilt",
      technical.year_built
    );
  
    setInputValue(
      "editShipyard",
      technical.shipyard
    );
  
    setInputValue(
      "editLengthM",
      technical.length_m
    );
  
    setInputValue(
      "editWidthM",
      technical.width_m
    );
  
    setInputValue(
      "editDraftM",
      technical.draft_m
    );
  
    setInputValue(
      "editPassengers",
      technical.passengers
    );
  
    setInputValue(
      "editOperator",
      operations.operator
    );
  
    setInputValue(
      "editOwner",
      operations.owner
    );
  
    setInputValue(
      "editManager",
      operations.manager
    );
  
    setInputValue(
      "editCruiseBrand",
      operations.cruise_brand
    );
  
    setInputValue(
      "editHomePort",
      operations.home_port
    );
  
    setInputValue(
      "editNotes",
      vessel?.notes
    );
  }
  
  function setEditMode(enabled) {
    editModeActive = Boolean(enabled);

    editCard.classList.toggle("hidden", !editModeActive);
    editButton.textContent = editModeActive
      ? "Bearbeitung geöffnet"
      : "Bearbeiten";
    editButton.disabled = editModeActive || !currentVessel;
    reloadButton.disabled = editModeActive;

    updateVesselNavigation();

    if (!editModeActive) {
      clearEditNameMatches();
      return;
    }

    editCard.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });

    editName.focus();
    scheduleEditNameSearch();
  }

  function buildVesselUpdatePayload() {
    return {
      vessel_id: vesselId,
  
      name:
        byId("editName")
          .value
          .trim(),
  
      former_names:
        parseFormerNames(
          byId("editFormerNames").value
        ),
  
      mmsi:
        byId("editMmsi")
          .value
          .trim(),
  
      imo:
        byId("editImo")
          .value
          .trim(),
  
      eni:
        reference.normalizeEni(
          byId("editEni").value
        ),
  
      call_sign:
        byId("editCallSign")
          .value
          .trim(),
  
      ship_type:
        byId("editShipType")
          .value
          .trim(),
  
      ship_subtype:
        byId("editShipSubtype")
          .value
          .trim(),
  
      flag:
        byId("editFlag")
          .value
          .trim()
          .toUpperCase(),
  
      status:
        byId("editStatus").value,
  
      year_built:
        optionalInteger(
          "editYearBuilt"
        ),
  
      shipyard:
        byId("editShipyard")
          .value
          .trim(),
  
      length_m:
        optionalNumber(
          "editLengthM"
        ),
  
      width_m:
        optionalNumber(
          "editWidthM"
        ),
  
      draft_m:
        optionalNumber(
          "editDraftM"
        ),
  
      passengers:
        optionalInteger(
          "editPassengers"
        ),
  
      operator:
        byId("editOperator")
          .value
          .trim(),
  
      owner:
        byId("editOwner")
          .value
          .trim(),
  
      manager:
        byId("editManager")
          .value
          .trim(),
  
      cruise_brand:
        byId("editCruiseBrand")
          .value
          .trim(),
  
      home_port:
        byId("editHomePort")
          .value
          .trim(),
  
      notes:
        byId("editNotes").value.trim()
    };
  }
  
  async function saveVesselUpdates() {
    if (!editForm.reportValidity()) {
      return;
    }
  
    const payload =
      buildVesselUpdatePayload();

    if (
      !reference.isValidEni(
        payload.eni
      )
    ) {
      pageStatus.className =
        "page-status error";
    
      pageStatus.textContent =
        "Die ENI muss aus genau acht Ziffern bestehen.";
    
      byId("editEni").focus();
      return;
    }
    
    if (!payload.name) {
      pageStatus.className =
        "page-status error";
  
      pageStatus.textContent =
        "Der Schiffsname ist erforderlich.";
  
      byId("editName").focus();
      return;
    }
  
    saveEditButton.disabled = true;
    cancelEditButton.disabled = true;
  
    const originalButtonText =
      saveEditButton.textContent;
  
    saveEditButton.textContent =
      "Wird gespeichert …";
  
    pageStatus.className =
      "page-status";
  
    pageStatus.textContent = "";
  
    try {
      const headers = {
        "Content-Type": "application/json"
      };
  
      const suppliedApiKey =
        apiKey.value.trim();
  
      if (suppliedApiKey) {
        headers["X-API-Key"] =
          suppliedApiKey;
      }
  
      const response = await fetch(
        `${workerUrl}/vessel-update`,
        {
          method: "POST",
          headers,
          body: JSON.stringify(payload)
        }
      );
  
      let result = {};
  
      try {
        result = await response.json();
      } catch {
        result = {};
      }
  
      if (
        !response.ok ||
        result.ok !== true
      ) {
        throw new Error(
          result.error ||
          `Der Worker antwortete mit HTTP ${response.status}.`
        );
      }
  
      setEditMode(false);
  
      await load();
  
      pageStatus.className =
        "page-status success";
  
      pageStatus.textContent =
        Array.isArray(result.changed_fields) &&
        result.changed_fields.length === 0
          ? "Es waren keine Änderungen zu speichern."
          : "Die Stammdaten wurden gespeichert.";
    } catch (error) {
      pageStatus.className =
        "page-status error";
  
      pageStatus.textContent =
        error instanceof Error
          ? error.message
          : String(error);
    } finally {
      saveEditButton.disabled = false;
      cancelEditButton.disabled = false;
  
      saveEditButton.textContent =
        originalButtonText;
    }
  }  

  async function savePrimaryPhoto(
    photo,
    sighting,
    button
  ) {
    const photoId =
      typeof photo?.photo_id === "string"
        ? photo.photo_id.trim()
        : "";
  
    if (!photoId) {
      pageStatus.className =
        "page-status error";
  
      pageStatus.textContent =
        "Dieses Foto besitzt keine gültige Photo-ID.";
  
      return;
    }
  
    const originalButtonText =
      button.textContent;
  
    button.disabled = true;
    button.textContent =
      "Wird gespeichert …";
  
    pageStatus.className =
      "page-status";
  
    pageStatus.textContent = "";
  
    try {
      const headers = {
        "Content-Type": "application/json"
      };
  
      const suppliedApiKey =
        apiKey.value.trim();
  
      if (suppliedApiKey) {
        headers["X-API-Key"] =
          suppliedApiKey;
      }
  
      const response = await fetch(
        `${workerUrl}/vessel-primary-photo`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            vessel_id: vesselId,
            photo_id: photoId
          })
        }
      );
  
      let result = {};
  
      try {
        result = await response.json();
      } catch {
        result = {};
      }
  
      if (
        !response.ok ||
        result.ok !== true
      ) {
        throw new Error(
          result.error ||
          `Der Worker antwortete mit HTTP ${response.status}.`
        );
      }
  
      await load();
  
      pageStatus.className =
        "page-status success";
  
      pageStatus.textContent =
        "Hauptfoto wurde geändert.";
    } catch (error) {
      pageStatus.className =
        "page-status error";
  
      pageStatus.textContent =
        error instanceof Error
          ? error.message
          : String(error);
  
      button.disabled = false;
  
      button.textContent =
        originalButtonText;
    }
  }  

  async function deletePhoto(
    photo,
    sighting,
    source,
    button
  ) {
    const photoId =
      typeof photo?.photo_id === "string"
        ? photo.photo_id.trim()
        : "";

    const photoPath =
      typeof photo?.path === "string"
        ? photo.path.trim()
        : "";

    if (!photoId && !photoPath) {
      pageStatus.className =
        "page-status error";
      pageStatus.textContent =
        "Dieses Foto besitzt weder eine Photo-ID noch einen gültigen Pfad.";
      return;
    }

    const isPrimaryPhoto =
      Boolean(photoId) &&
      photoId === String(
        currentPayload?.primary_photo?.photo_id ?? ""
      ).trim();

    const confirmationLines = [
      source === "sighting"
        ? "Dieses einzelne Foto endgültig löschen? Die Sichtung selbst bleibt erhalten."
        : "Dieses zusätzliche Schiffsfoto endgültig löschen?",
      isPrimaryPhoto
        ? "Das Foto ist derzeit das Hauptfoto. Nach dem Löschen wird automatisch ein anderes vorhandenes Foto gewählt."
        : ""
    ].filter(Boolean);

    if (!window.confirm(confirmationLines.join("\n\n"))) {
      return;
    }

    const originalButtonText = button.textContent;
    button.disabled = true;
    button.textContent = "Wird gelöscht …";

    pageStatus.className = "page-status";
    pageStatus.textContent = "Foto wird gelöscht …";

    try {
      const headers = {
        "Content-Type": "application/json"
      };

      const suppliedApiKey = apiKey.value.trim();
      if (suppliedApiKey) {
        headers["X-API-Key"] = suppliedApiKey;
      }

      const response = await fetch(
        `${workerUrl}/vessel-photo-delete`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            vessel_id: vesselId,
            source,
            submission_id:
              typeof sighting?.submission_id === "string"
                ? sighting.submission_id
                : "",
            submission_path:
              typeof sighting?.submission_path === "string"
                ? sighting.submission_path
                : "",
            photo_id: photoId,
            photo_path: photoPath
          })
        }
      );

      let result = {};

      try {
        result = await response.json();
      } catch {
        result = {};
      }

      if (!response.ok || result.ok !== true) {
        throw new Error(
          result.error ||
          `Der Worker antwortete mit HTTP ${response.status}.`
        );
      }

      await load();

      pageStatus.className =
        "page-status success";
      pageStatus.textContent =
        result.message || "Das Foto wurde gelöscht.";
    } catch (error) {
      pageStatus.className =
        "page-status error";
      pageStatus.textContent =
        error instanceof Error
          ? error.message
          : String(error);

      button.disabled = false;
      button.textContent = originalButtonText;
    }
  }

  function createPhotoActionButtons({
    photo,
    sighting,
    source,
    primaryPhotoId
  }) {
    const actions = document.createElement("div");
    actions.className = "photo-card-actions";

    const selectButton = document.createElement("button");
    selectButton.type = "button";
    selectButton.className = "primary-photo-button";

    const isPrimaryPhoto =
      Boolean(photo?.photo_id) &&
      photo.photo_id === primaryPhotoId;

    if (isPrimaryPhoto) {
      selectButton.textContent = "Hauptfoto";
      selectButton.disabled = true;
    } else {
      selectButton.textContent = "Als Hauptfoto";
      selectButton.disabled = !photo?.photo_id;
      selectButton.addEventListener(
        "click",
        () => savePrimaryPhoto(
          photo,
          sighting,
          selectButton
        )
      );
    }

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "photo-delete-button";
    deleteButton.textContent = "Foto löschen";
    deleteButton.disabled = !photo?.photo_id && !photo?.path;
    deleteButton.addEventListener(
      "click",
      () => deletePhoto(
        photo,
        sighting,
        source,
        deleteButton
      )
    );

    actions.append(
      selectButton,
      deleteButton
    );

    return actions;
  }

  function photoViewerKey(photo) {
    const photoId =
      typeof photo?.photo_id === "string"
        ? photo.photo_id.trim()
        : "";

    const path =
      typeof photo?.path === "string"
        ? photo.path.trim()
        : "";

    const url = safeUrl(photo?.url ?? "");

    return photoId || path || url;
  }

  function collectPhotoViewerItems({
    primaryPhoto,
    directPhotos,
    sightings
  }) {
    const items = [];
    const knownKeys = new Set();

    const addPhoto = (
      photo,
      context = {}
    ) => {
      const url = safeUrl(photo?.url ?? "");
      if (!url) return;

      const normalized = {
        ...photo,
        url,
        source:
          photo?.source ||
          context.source ||
          "",
        submission_id:
          photo?.submission_id ||
          context.submission_id ||
          "",
        captured_at:
          photo?.captured_at ||
          context.captured_at ||
          ""
      };

      const key = photoViewerKey(normalized);
      if (!key || knownKeys.has(key)) return;

      knownKeys.add(key);
      items.push(normalized);
    };

    addPhoto(primaryPhoto);

    for (const photo of (
      Array.isArray(directPhotos)
        ? directPhotos
        : []
    )) {
      addPhoto(photo, {
        source: "direct_vessel_upload"
      });
    }

    for (const sighting of (
      Array.isArray(sightings)
        ? sightings
        : []
    )) {
      for (const photo of (
        Array.isArray(sighting?.photos)
          ? sighting.photos
          : []
      )) {
        addPhoto(photo, {
          source: "sighting",
          submission_id:
            sighting?.submission_id || "",
          captured_at:
            sighting?.captured_at || ""
        });
      }
    }

    return items;
  }

  function renderPhotoViewerCurrent() {
    const image = byId("primaryPhoto");

    const placeholder =
      byId("primaryPhotoPlaceholder");

    const caption =
      byId("primaryPhotoCaption");

    const photoCount =
      photoViewerItems.length;

    if (
      photoCount === 0 ||
      photoViewerIndex < 0
    ) {
      image.classList.add("hidden");
      image.removeAttribute("src");
      image.alt = "";

      placeholder.classList.remove("hidden");
      caption.textContent = "";
      primaryPhotoPosition.textContent = "";

      previousPhotoButton.classList.add("hidden");
      nextPhotoButton.classList.add("hidden");
      previousPhotoButton.disabled = true;
      nextPhotoButton.disabled = true;

      return;
    }

    const currentPhoto =
      photoViewerItems[photoViewerIndex];

    image.src = currentPhoto.url;
    image.alt =
      currentPhoto.original_filename ||
      `Foto von ${byId("vesselName").textContent}`;

    image.classList.remove("hidden");
    placeholder.classList.add("hidden");

    const sourceLabel =
      currentPhoto.source ===
        "direct_vessel_upload"
        ? "Zusätzliches Schiffsfoto"
        : currentPhoto.submission_id ||
          "Sichtungsfoto";

    const currentPhotoDate =
      currentPhoto.source ===
        "direct_vessel_upload"
        ? dateTime(
            currentPhoto.captured_at ||
            currentPhoto.added_at ||
            ""
          )
        : formatDate(currentPhoto.captured_at);

    const currentPhotoLocation =
      currentPhoto.source ===
        "direct_vessel_upload"
        ? locationLabel(currentPhoto.location)
        : "–";

    caption.textContent = [
      sourceLabel,
      currentPhotoDate,
      currentPhotoLocation !== "–"
        ? currentPhotoLocation
        : ""
    ]
      .filter(valueText =>
        valueText && valueText !== "–"
      )
      .join(" · ");

    primaryPhotoPosition.textContent =
      `${photoViewerIndex + 1} / ${photoCount}`;

    const canNavigate = photoCount > 1;

    previousPhotoButton.classList.toggle(
      "hidden",
      !canNavigate
    );

    nextPhotoButton.classList.toggle(
      "hidden",
      !canNavigate
    );

    previousPhotoButton.disabled =
      !canNavigate;

    nextPhotoButton.disabled =
      !canNavigate;
  }

  function renderPrimaryPhotoViewer({
    primaryPhoto,
    directPhotos,
    sightings
  }) {
    photoViewerItems =
      collectPhotoViewerItems({
        primaryPhoto,
        directPhotos,
        sightings
      });

    const primaryKey =
      photoViewerKey(primaryPhoto);

    const primaryIndex =
      primaryKey
        ? photoViewerItems.findIndex(
            photo =>
              photoViewerKey(photo) ===
              primaryKey
          )
        : -1;

    photoViewerIndex =
      primaryIndex >= 0
        ? primaryIndex
        : photoViewerItems.length > 0
          ? 0
          : -1;

    renderPhotoViewerCurrent();
  }

  function showRelativePhoto(offset) {
    const photoCount =
      photoViewerItems.length;

    if (photoCount < 2) return;

    photoViewerIndex =
      (photoViewerIndex + offset + photoCount) %
      photoCount;

    renderPhotoViewerCurrent();
  }

  function renderSources(sources) {
    const sourceList =
      byId("sourceList");
  
    const sourceEmpty =
      byId("sourceEmpty");
  
    const normalizedSources =
      Array.isArray(sources)
        ? [...sources]
        : [];
  
    normalizedSources.sort(
      (left, right) =>
        String(
          right?.updated_at ||
          right?.added_at ||
          right?.retrieved_at ||
          ""
        ).localeCompare(
          String(
            left?.updated_at ||
            left?.added_at ||
            left?.retrieved_at ||
            ""
          )
        )
    );
  
    sourceList.replaceChildren();
  
    set(
      "sourceCountBadge",
      String(
        normalizedSources.length
      )
    );
  
    if (
      normalizedSources.length === 0
    ) {
      sourceList.classList.add(
        "hidden"
      );
  
      sourceEmpty.classList.remove(
        "hidden"
      );
  
      return;
    }
  
    for (
      const source
      of normalizedSources
    ) {
      const item =
        document.createElement(
          "article"
        );
  
      item.className =
        "source-item";
  
      const header =
        document.createElement("div");
  
      header.className =
        "source-item-header";
  
      const headerText =
        document.createElement("div");
  
      const providerLabel =
        reference.sourceProviderLabel(
          source?.provider
        );
  
      const title =
        source?.title ||
        providerLabel ||
        source?.name ||
        "Quelle";
  
      headerText.append(
        createTextElement(
          "h3",
          "source-title",
          title
        )
      );
  
      if (
        providerLabel &&
        providerLabel !== title
      ) {
        headerText.append(
          createTextElement(
            "p",
            "source-provider",
            providerLabel
          )
        );
      }
  
      header.append(
        headerText
      );
  
      const actions =
        document.createElement("div");
  
      actions.className =
        "source-item-actions";
  
      const editSourceButton =
        document.createElement(
          "button"
        );
  
      editSourceButton.type =
        "button";
  
      editSourceButton.className =
        "source-edit-button";
  
      editSourceButton.textContent =
        "Bearbeiten";
  
      editSourceButton.disabled =
        !source?.source_id;
  
      editSourceButton.addEventListener(
        "click",
        () => {
          setSourceFormMode(
            true,
            source
          );
        }
      );
  
      const removeButton =
        document.createElement(
          "button"
        );
  
      removeButton.type = "button";
  
      removeButton.className =
        "source-remove-button";
  
      removeButton.textContent =
        "Entfernen";
  
      removeButton.disabled =
        !source?.source_id;
  
      removeButton.addEventListener(
        "click",
        () => removeSource(
          source,
          removeButton
        )
      );
  
      actions.append(
        editSourceButton,
        removeButton
      );
  
      header.append(actions);
      item.append(header);
  
      const metadata = [
        source?.retrieved_at
          ? `erfasst ${formatDate(
              source.retrieved_at
            )}`
          : "",
  
        source?.verified_at
          ? `geprüft ${formatDate(
              source.verified_at
            )}`
          : "nicht geprüft"
      ]
        .filter(Boolean)
        .join(" · ");
  
      item.append(
        createTextElement(
          "p",
          "source-meta",
          metadata
        )
      );
  
      if (source?.notes) {
        item.append(
          createTextElement(
            "p",
            "source-notes",
            source.notes
          )
        );
      }
  
      const fieldsUsed =
        Array.isArray(
          source?.fields_used
        )
          ? source.fields_used
          : [];
  
      if (fieldsUsed.length > 0) {
        item.append(
          createTextElement(
            "p",
            "source-fields-label",
            fieldsUsed.length === 1
              ? "Übernommenes Feld"
              : "Übernommene Felder"
          )
        );
  
        const fieldList =
          document.createElement(
            "div"
          );
  
        fieldList.className =
          "source-used-fields";
  
        for (
          const fieldPath
          of fieldsUsed
        ) {
          fieldList.append(
            createTextElement(
              "span",
              "source-used-field",
              reference.sourceFieldLabel(
                fieldPath
              )
            )
          );
        }
  
        item.append(fieldList);
      }
  
      const url = safeUrl(
        source?.url ??
        source?.source_url ??
        ""
      );
  
      if (url) {
        const link =
          document.createElement("a");
  
        link.className =
          "source-link";
  
        link.href = url;
        link.target = "_blank";
  
        link.rel =
          "noopener noreferrer";
  
        link.textContent =
          "Quelle öffnen";
  
        item.append(link);
      }
  
      sourceList.append(item);
    }
  
    sourceEmpty.classList.add(
      "hidden"
    );
  
    sourceList.classList.remove(
      "hidden"
    );
  }

  function renderDirectPhotos(
    photos,
    primaryPhoto,
    sightings
  ) {
    const gallery =
      byId("directPhotosGallery");

    const empty =
      byId("directPhotosEmpty");

    const allDirectPhotos =
      Array.isArray(photos)
        ? photos
        : [];

    const validSightingIds = new Set(
      (Array.isArray(sightings) ? sightings : [])
        .map(sighting => String(
          sighting?.submission_id || ""
        ).trim())
        .filter(Boolean)
    );

    /*
     * Zusatzfotos mit gültigem Sichtungsbezug werden bei der
     * betreffenden Sichtung dargestellt. Nur ungebundene oder
     * verwaiste Zusatzfotos bleiben in diesem Abschnitt sichtbar.
     */
    const normalizedPhotos = allDirectPhotos.filter(photo => {
      const relation = directPhotoRelation(photo);
      return !(
        relation.type === "sighting" &&
        validSightingIds.has(relation.submission_id)
      );
    });

    const primaryPhotoId =
      typeof primaryPhoto?.photo_id ===
        "string"
        ? primaryPhoto.photo_id
        : "";

    gallery.replaceChildren();

    set(
      "directPhotosCount",
      String(normalizedPhotos.length)
    );

    for (const photo of normalizedPhotos) {
      const photoUrl = safeUrl(
        photo?.url ?? ""
      );

      if (!photoUrl) continue;

      const photoCard =
        document.createElement("div");

      photoCard.className =
        "sighting-photo-card";

      const link =
        document.createElement("a");

      link.href = photoUrl;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.className =
        "sighting-photo-link";
      link.title =
        photo.original_filename ||
        "Foto öffnen";

      const image =
        document.createElement("img");

      image.src = photoUrl;
      image.alt =
        photo.original_filename ||
        "Zusätzliches Schiffsfoto";
      image.loading = "lazy";

      link.append(image);

      const isPrimaryPhoto =
        Boolean(photo.photo_id) &&
        photo.photo_id === primaryPhotoId;

      if (isPrimaryPhoto) {
        photoCard.classList.add(
          "is-primary"
        );
      }

      const metadata =
        createTextElement(
          "p",
          "sighting-meta",
          directPhotoMetadataLabel(photo)
        );

      photoCard.append(
        link,
        metadata
      );

      const relation = directPhotoRelation(photo);
      if (
        relation.type === "sighting" &&
        !validSightingIds.has(relation.submission_id)
      ) {
        photoCard.append(
          createTextElement(
            "p",
            "photo-relation-warning",
            `Zugeordnete Sichtung ${relation.submission_id} wurde nicht gefunden.`
          )
        );
      }

      const mapLink =
        createPhotoMapLink(photo);

      if (mapLink) {
        photoCard.append(mapLink);
      }

      if (
        typeof photo?.notes === "string" &&
        photo.notes.trim()
      ) {
        photoCard.append(
          createTextElement(
            "p",
            "sighting-notes",
            photo.notes.trim()
          )
        );
      }

      photoCard.append(
        createDirectPhotoRelationControl(
          photo,
          sightings
        )
      );

      photoCard.append(
        createPhotoActionButtons({
          photo,
          sighting: null,
          source: "direct",
          primaryPhotoId
        })
      );

      gallery.append(photoCard);
    }

    const hasPhotos =
      gallery.childElementCount > 0;

    gallery.classList.toggle(
      "hidden",
      !hasPhotos
    );

    empty.textContent =
      allDirectPhotos.length > 0 && !hasPhotos
        ? "Alle Zusatzfotos sind konkreten Sichtungen zugeordnet."
        : "Keine zusätzlichen Schiffsfotos vorhanden.";

    empty.classList.toggle(
      "hidden",
      hasPhotos
    );
  }

  function renderSightings(
    sightings,
    sightingsMeta,
    primaryPhoto,
    directPhotos
  ) {
    const sightingsList =
      byId("sightingsList");

    const sightingsEmpty =
      byId("sightingsEmpty");

    const scanNote =
      byId("sightingsScanNote");

    const normalizedSightings =
      Array.isArray(sightings)
        ? sightings
        : [];

    const primaryPhotoId =
      typeof primaryPhoto?.photo_id ===
        "string"
        ? primaryPhoto.photo_id
        : "";    

    sightingsList.replaceChildren();

    set(
      "sightingsCount",
      String(normalizedSightings.length)
    );

    const sightingCount =
      normalizedSightings.length;
    
    set(
      "summarySightings",
      String(sightingCount)
    );
    
    set(
      "summarySightingsLabel",
      sightingCount === 1
        ? "Sichtung"
        : "Sichtungen"
    );

    const totalPhotos =
      normalizedSightings.reduce(
        (sum, sighting) =>
          sum +
          Number(sighting.photo_count || 0),
        0
      ) +
      (Array.isArray(directPhotos)
        ? directPhotos.length
        : 0);

    set(
      "summaryPhotos",
      String(totalPhotos)
    );
    
    set(
      "summaryPhotosLabel",
      totalPhotos === 1
        ? "Foto"
        : "Fotos"
    );

    const latest =
      normalizedSightings[0] ?? null;

    set(
      "summaryLastSeen",
      latest
        ? dateTime(latest.captured_at)
        : "–"
    );

    set(
      "summaryLastLocation",
      latest
        ? sightingPlaceLabel(latest)
        : "–"
    );

    if (normalizedSightings.length === 0) {
      sightingsList.classList.add("hidden");
      sightingsEmpty.classList.remove(
        "hidden"
      );
    } else {
      for (
        const sighting
        of normalizedSightings
      ) {
        const item =
          document.createElement("article");

        item.className = "sighting-item";

        const header =
          document.createElement("div");

        header.className = "sighting-header";

        const headingGroup =
          document.createElement("div");

        headingGroup.append(
          createTextElement(
            "h3",
            "sighting-date",
            dateTime(sighting.captured_at)
          ),

          createTextElement(
            "p",
            "sighting-location",
            sightingHeaderLabel(sighting)
          )
        );

        header.append(headingGroup);

        const originalPhotos =
          Array.isArray(sighting.photos)
            ? sighting.photos
            : [];

        const linkedDirectPhotos =
          linkedDirectPhotosForSighting(
            sighting,
            directPhotos
          );

        const photoCount =
          originalPhotos.length +
          linkedDirectPhotos.length;

        const photoCountText =
          `${photoCount} Foto${photoCount === 1 ? "" : "s"}` +
          (linkedDirectPhotos.length
            ? ` (${linkedDirectPhotos.length} nachträglich)`
            : "");

        header.append(
          createTextElement(
            "span",
            "sighting-photo-count",
            photoCountText
          )
        );

        item.append(header);

        const metadata =
          sightingMetadataLabel(
            sighting
          );

        item.append(
          createTextElement(
            "p",
            "sighting-meta",
            metadata
          )
        );

        if (sighting.notes) {
          item.append(
            createTextElement(
              "p",
              "sighting-notes",
              sighting.notes
            )
          );
        }

        const photos = [
          ...originalPhotos.map(photo => ({
            photo,
            source: "sighting",
            linked: false
          })),
          ...linkedDirectPhotos.map(photo => ({
            photo,
            source: "direct",
            linked: true
          }))
        ];

        if (photos.length > 0) {
          const gallery =
            document.createElement("div");

          gallery.className =
            "sighting-gallery";

          for (const photoEntry of photos) {
            const photo = photoEntry.photo;
            const photoUrl = safeUrl(
              photo?.url ?? ""
            );
          
            if (!photoUrl) continue;
          
            const photoCard =
              document.createElement("div");
          
            photoCard.className =
              "sighting-photo-card";
          
            const link =
              document.createElement("a");
          
            link.href = photoUrl;
            link.target = "_blank";
            link.rel = "noopener noreferrer";
          
            link.className =
              "sighting-photo-link";
          
            link.title =
              photo.original_filename ||
              "Foto öffnen";
          
            const image =
              document.createElement("img");
          
            image.src = photoUrl;
          
            image.alt =
              photo.original_filename ||
              `Foto aus ${sighting.submission_id}`;
          
            image.loading = "lazy";
          
            link.append(image);
          
            const isPrimaryPhoto =
              Boolean(photo.photo_id) &&
              photo.photo_id === primaryPhotoId;

            if (isPrimaryPhoto) {
              photoCard.classList.add(
                "is-primary"
              );
            }

            photoCard.append(link);

            if (photoEntry.linked) {
              photoCard.append(
                createTextElement(
                  "span",
                  "linked-sighting-photo-badge",
                  "Nachträglich ergänzt"
                )
              );
            }

            const photoMetadata =
              photoEntry.linked
                ? directPhotoMetadataLabel(photo)
                : sightingPhotoMetadataLabel(
                    photo,
                    sighting
                  );

            if (photoMetadata) {
              photoCard.append(
                createTextElement(
                  "p",
                  "sighting-meta",
                  photoMetadata
                )
              );
            }

            const mapLink =
              createPhotoMapLink(
                photo,
                sighting?.captured_at || "",
                sighting
              );

            if (mapLink) {
              photoCard.append(mapLink);
            }

            if (photoEntry.linked) {
              photoCard.append(
                createDirectPhotoRelationControl(
                  photo,
                  normalizedSightings
                )
              );
            }

            photoCard.append(
              createPhotoActionButtons({
                photo,
                sighting:
                  photoEntry.linked
                    ? null
                    : sighting,
                source: photoEntry.source,
                primaryPhotoId
              })
            );
          
            gallery.append(photoCard);
          }

          if (
            gallery.childElementCount > 0
          ) {
            item.append(gallery);
          }
        }

        sightingsList.append(item);
      }

      sightingsEmpty.classList.add("hidden");

      sightingsList.classList.remove(
        "hidden"
      );
    }

    if (sightingsMeta?.truncated) {
      scanNote.textContent =
        `Für diese Ansicht wurden die neuesten ` +
        `${sightingsMeta.scanned_count} von ` +
        `${sightingsMeta.total_submission_count} ` +
        `Submission-Dateien geprüft.`;

      scanNote.classList.remove("hidden");
    } else {
      scanNote.textContent = "";
      scanNote.classList.add("hidden");
    }
  }

  function render(payload) {
    const vessel =
      payload.vessel || {};

    currentPayload = payload;
    currentVessel = vessel;
    
    updateVesselNavigation();    
    
    editButton.disabled = false;
    
    addSourceButton.disabled =
      sourceFormActive ||
      !referenceReady;

    const identity =
      vessel.identity || {};

    const classification =
      vessel.classification || {};

    const technical =
      vessel.technical || {};

    const operations =
      vessel.operations || {};

    const enrichment =
      vessel.enrichment || {};

    const audit =
      vessel.audit || {};

    const sources =
      Array.isArray(vessel.sources)
        ? vessel.sources
        : [];

    document.title =
      `${identity.name || vesselId} – Schiff`;

    set("breadcrumbId", vesselId);

    set(
      "vesselName",
      identity.name || vesselId
    );

    set(
      "vesselSubtitle",
      [
        classification.ship_type,
        operations.operator
      ]
        .filter(Boolean)
        .join(" · ")
    );

    set("vesselId", vesselId);

    set(
      "identityName",
      value(identity.name)
    );

    set(
      "formerNames",
      Array.isArray(identity.former_names) &&
      identity.former_names.length
        ? identity.former_names.join(", ")
        : "–"
    );

    set("mmsi", value(identity.mmsi));
    set("imo", value(identity.imo));
    set("eni", value(identity.eni));

    set(
      "callSign",
      value(identity.call_sign)
    );

    set(
      "shipType",
      reference.shipTypeLabel(
        classification.ship_type
      )
    );
    
    set(
      "shipSubtype",
      reference.shipSubtypeLabel(
        classification.ship_subtype,
        classification.ship_type
      )
    );
    
    set(
      "flag",
      reference.flagLabel(
        classification.flag
      )
    );

    set(
      "status",
      statusLabel(classification.status)
    );

    set(
      "yearBuilt",
      value(technical.year_built)
    );

    set(
      "shipyard",
      value(technical.shipyard)
    );

    set(
      "lengthM",
      value(
        technical.length_m,
        technical.length_m === null ||
        technical.length_m === undefined ||
        technical.length_m === ""
          ? ""
          : " m"
      )
    );

    set(
      "widthM",
      value(
        technical.width_m,
        technical.width_m === null ||
        technical.width_m === undefined ||
        technical.width_m === ""
          ? ""
          : " m"
      )
    );

    set(
      "draftM",
      value(
        technical.draft_m,
        technical.draft_m === null ||
        technical.draft_m === undefined ||
        technical.draft_m === ""
          ? ""
          : " m"
      )
    );

    set(
      "passengers",
      value(technical.passengers)
    );

    set(
      "operator",
      value(operations.operator)
    );

    set(
      "owner",
      value(operations.owner)
    );

    set(
      "manager",
      value(operations.manager)
    );

    set(
      "cruiseBrand",
      value(operations.cruise_brand)
    );

    set(
      "homePort",
      value(operations.home_port)
    );

    set(
      "enrichmentStatus",
      value(enrichment.status)
    );

    set(
      "enrichmentDate",
      dateTime(enrichment.last_run_at)
    );

    set(
      "sourceCount",
      String(sources.length)
    );

    set(
      "createdAt",
      dateTime(audit.created_at)
    );

    set(
      "updatedAt",
      dateTime(audit.updated_at)
    );

    set(
      "jsonPath",
      value(payload.path)
    );

    set(
      "notes",
      value(vessel.notes)
    );

    const badge =
      byId("environmentBadge");

    const isTest =
      audit.environment === "test" ||
      Number(vesselId.slice(4)) < 100;

    badge.classList.toggle(
      "hidden",
      !isTest
    );

    badge.textContent = "Testdatensatz";

    renderPrimaryPhotoViewer({
      primaryPhoto:
        payload.primary_photo,
      directPhotos:
        payload.direct_photos,
      sightings:
        payload.sightings
    });

    renderSources(sources);

    renderDirectPhotos(
      payload.direct_photos,
      payload.primary_photo,
      payload.sightings
    );

    renderSightings(
      payload.sightings,
      payload.sightings_meta,
      payload.primary_photo,
      payload.direct_photos
    );
    
    renderChangeHistory(
      audit.change_history
    );
    
    content.classList.remove("hidden");
  }

  async function load() {
    if (!/^VES-\d{6}$/.test(vesselId)) {
      pageStatus.className =
        "page-status error";

      pageStatus.textContent =
        "Die URL enthält keine gültige Vessel-ID.";

      reloadButton.disabled = true;
      return;
    }

    closeDeletePanel();

    reloadButton.disabled = true;
    editButton.disabled = true;
    prepareDeleteButton.disabled = true;
    nextVesselButton.disabled = true;    
    
    pageStatus.className =
      "page-status";

    pageStatus.textContent =
      "Schiff wird geladen …";

    content.classList.add("hidden");

    try {
      const response =
        await window.VesselApi.getVessel({
          workerUrl,
          apiKey: apiKey.value,
          vesselId
        });

      render(response.data);

      await loadVesselNavigation();

      pageStatus.textContent = "";
    } catch (error) {
      pageStatus.className =
        "page-status error";

      pageStatus.textContent =
        error instanceof Error
          ? error.message
          : String(error);
    } finally {
      reloadButton.disabled =
        editModeActive;
    
      editButton.disabled =
        editModeActive ||
        !currentVessel;
    }
  }

  prepareDeleteButton.addEventListener(
    "click",
    loadDeletePreview
  );

  cancelDeleteButton.addEventListener(
    "click",
    closeDeletePanel
  );

  deleteConfirmationInput.addEventListener(
    "input",
    updateDeleteConfirmation
  );

  confirmDeleteButton.addEventListener(
    "click",
    deleteVesselCompletely
  );  

  addSourceButton.addEventListener(
    "click",
    () => {
      setSourceFormMode(
        true,
        null
      );
    }
  );
  
  cancelSourceButton.addEventListener(
    "click",
    () => {
      setSourceFormMode(false);
  
      pageStatus.className =
        "page-status";
  
      pageStatus.textContent = "";
    }
  );
  
  sourceForm.addEventListener(
    "submit",
    event => {
      event.preventDefault();
      saveSource();
    }
  );
  
  editButton.addEventListener(
    "click",
    () => {
      if (!currentVessel) return;
  
      populateEditForm(currentVessel);
      setEditMode(true);
    }
  );
  
  cancelEditButton.addEventListener(
    "click",
    () => {
      setEditMode(false);
  
      pageStatus.className =
        "page-status";
  
      pageStatus.textContent = "";
    }
  );
  
  editForm.addEventListener(
    "submit",
    event => {
      event.preventDefault();
      saveVesselUpdates();
    }
  );

  editName.addEventListener("input", scheduleEditNameSearch);

  editName.addEventListener("blur", () => {
    if (editNameSearchTimer) {
      clearTimeout(editNameSearchTimer);
      editNameSearchTimer = null;
    }

    requestEditNameMatches();
  });

  previousVesselButton.addEventListener(
    "click",
    () => {
      openVessel(
        previousVesselButton.dataset
          .vesselId
      );
    }
  );

  nextVesselButton.addEventListener(
    "click",
    () => {
      openVessel(
        nextVesselButton.dataset
          .vesselId
      );
    }
  );

  document.addEventListener(
    "keydown",
    event => {
      if (
        event.defaultPrevented ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        editModeActive ||
        sourceFormActive ||
        deletePanelActive ||
        deleteBusy
      ) {
        return;
      }

      const target = event.target;

      if (
        target instanceof Element &&
        target.closest(
          "input, textarea, select, " +
          "button, a, [contenteditable]"
        )
      ) {
        return;
      }

      if (
        event.key === "ArrowLeft" &&
        !previousVesselButton.disabled
      ) {
        event.preventDefault();

        openVessel(
          previousVesselButton.dataset
            .vesselId
        );
      }

      if (
        event.key === "ArrowRight" &&
        !nextVesselButton.disabled
      ) {
        event.preventDefault();

        openVessel(
          nextVesselButton.dataset
            .vesselId
        );
      }
    }
  );
  
  previousPhotoButton.addEventListener(
    "click",
    () => showRelativePhoto(-1)
  );

  nextPhotoButton.addEventListener(
    "click",
    () => showRelativePhoto(1)
  );

  reloadButton.addEventListener(
    "click",
    load
  );
  
  apiKey.addEventListener("change", () => {
    if (deletePanelActive) {
      closeDeletePanel();
    }

    if (editModeActive) {
      requestEditNameMatches();
    } else {
      load();
    }
  });

  byId("editShipType")
    .addEventListener(
      "change",
      () => {
        populateShipSubtypeSelect(
          byId("editShipType")
            .value,
          "UNKNOWN"
        );
      }
    );
  
  byId("editEni")
    .addEventListener(
      "blur",
      () => {
        byId("editEni").value =
          reference.normalizeEni(
            byId("editEni")
              .value
          );
      }
    );  
  
  async function initialize() {
    reloadButton.disabled = true;
    addSourceButton.disabled = true;
    previousVesselButton.disabled = true;
    nextVesselButton.disabled = true;
  
    pageStatus.className =
      "page-status";
  
    pageStatus.textContent =
      "Referenzdaten werden geladen …";
  
    try {
      await reference.load();
  
      referenceReady = true;
  
      populateSourceProviderSelect("");
      renderSourceFieldChoices([]);
  
      await load();
    } catch (error) {
      referenceReady = false;
  
      pageStatus.className =
        "page-status error";
  
      pageStatus.textContent =
        error instanceof Error
          ? (
              "Die Referenzdaten konnten nicht geladen werden: " +
              error.message
            )
          : (
              "Die Referenzdaten konnten nicht geladen werden."
            );
  
      reloadButton.disabled = false;
    }
  }
  
  initialize();
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && photoMapModal && !photoMapModal.classList.contains("hidden")) {
      closePhotoMapModal();
    }
  });

});
