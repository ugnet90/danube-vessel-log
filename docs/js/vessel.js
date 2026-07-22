// Danube Vessel Log
// File: docs/js/vessel.js
// Version: 0.9.1
// Updated: 2026-07-22

"use strict";

document.addEventListener("DOMContentLoaded", () => {
  const byId = id => document.getElementById(id);

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

  const apiKey = byId("apiKey");
  const editButton = byId("editButton");
  const reloadButton = byId("reloadButton");
  const pageStatus = byId("pageStatus");
  const content = byId("vesselContent");
  
  const editCard = byId("vesselEditCard");
  const editForm = byId("vesselEditForm");
  const saveEditButton = byId("saveEditButton");
  const cancelEditButton = byId("cancelEditButton");
  
  let currentVessel = null;
  let editModeActive = false;

  const changeFieldLabels = Object.freeze({
    "identity.name": "Name",
    "identity.former_names": "Frühere Namen",
    "identity.mmsi": "MMSI",
    "identity.imo": "IMO",
    "identity.eni": "ENI",
    "identity.call_sign": "Rufzeichen",
  
    "classification.ship_type": "Schiffstyp",
    "classification.ship_subtype": "Untertyp",
    "classification.status": "Status",
    "classification.flag": "Flagge",
  
    "technical.year_built": "Baujahr",
    "technical.shipyard": "Werft",
    "technical.length_m": "Länge",
    "technical.width_m": "Breite",
    "technical.draft_m": "Tiefgang",
    "technical.passengers": "Passagiere",
  
    "operations.operator": "Betreiber",
    "operations.owner": "Eigentümer",
    "operations.manager": "Manager",
    "operations.cruise_brand": "Marke",
    "operations.home_port": "Heimathafen",
  
    "notes": "Notizen"
  });  

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

    return [
      location.name,
      location.municipality,
      location.country
    ]
      .filter(Boolean)
      .join(", ") || "–";
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

  function changeFieldLabel(fieldPath) {
    return (
      changeFieldLabels[fieldPath] ||
      fieldPath ||
      "Unbekanntes Feld"
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
      return valueToFormat.length
        ? valueToFormat.join(", ")
        : "leer";
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
  
  function populateEditForm(vessel) {
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
      identity.eni
    );
  
    setInputValue(
      "editCallSign",
      identity.call_sign
    );
  
    setInputValue(
      "editShipType",
      classification.ship_type
    );
  
    setInputValue(
      "editShipSubtype",
      classification.ship_subtype
    );
  
    setInputValue(
      "editFlag",
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
  
    editCard.classList.toggle(
      "hidden",
      !editModeActive
    );
  
    editButton.textContent =
      editModeActive
        ? "Bearbeitung geöffnet"
        : "Bearbeiten";
  
    editButton.disabled =
      editModeActive ||
      !currentVessel;
  
    reloadButton.disabled =
      editModeActive;
  
    if (editModeActive) {
      editCard.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
  
      byId("editName").focus();
    }
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
        byId("editEni")
          .value
          .trim(),
  
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

  function renderPrimaryPhoto(primaryPhoto) {
    const image = byId("primaryPhoto");

    const placeholder =
      byId("primaryPhotoPlaceholder");

    const caption =
      byId("primaryPhotoCaption");

    const photoUrl = safeUrl(
      primaryPhoto?.url ?? ""
    );

    if (!photoUrl) {
      image.classList.add("hidden");
      image.removeAttribute("src");
      image.alt = "";

      placeholder.classList.remove("hidden");
      caption.textContent = "";

      return;
    }

    image.src = photoUrl;

    image.alt =
      `Foto von ${byId("vesselName").textContent}`;

    image.classList.remove("hidden");
    placeholder.classList.add("hidden");

    caption.textContent = [
      primaryPhoto.submission_id,
      formatDate(primaryPhoto.captured_at)
    ]
      .filter(Boolean)
      .join(" · ");
  }

  function renderSources(sources) {
    const sourceList =
      byId("sourceList");

    const sourceEmpty =
      byId("sourceEmpty");

    const normalizedSources =
      Array.isArray(sources)
        ? sources
        : [];

    sourceList.replaceChildren();

    set(
      "sourceCountBadge",
      String(normalizedSources.length)
    );

    if (normalizedSources.length === 0) {
      sourceList.classList.add("hidden");
      sourceEmpty.classList.remove("hidden");
      return;
    }

    for (const source of normalizedSources) {
      const item =
        document.createElement("article");

      item.className = "source-item";

      const name =
        source?.name ||
        source?.provider ||
        source?.title ||
        "Quelle";

      const title = createTextElement(
        "h3",
        "source-title",
        name
      );

      item.append(title);

      const metadata = [
        source?.retrieved_at
          ? `abgerufen ${formatDate(
              source.retrieved_at
            )}`
          : "",

        source?.verified_at
          ? `geprüft ${formatDate(
              source.verified_at
            )}`
          : ""
      ]
        .filter(Boolean)
        .join(" · ");

      if (metadata) {
        item.append(
          createTextElement(
            "p",
            "source-meta",
            metadata
          )
        );
      }

      const url = safeUrl(
        source?.url ??
        source?.source_url ??
        ""
      );

      if (url) {
        const link =
          document.createElement("a");

        link.className = "source-link";
        link.href = url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = "Quelle öffnen";

        item.append(link);
      }

      sourceList.append(item);
    }

    sourceEmpty.classList.add("hidden");
    sourceList.classList.remove("hidden");
  }

  function renderSightings(
    sightings,
    sightingsMeta,
    primaryPhoto
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
      );

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
        ? formatDate(latest.captured_at)
        : "–"
    );

    set(
      "summaryLastLocation",
      latest
        ? locationLabel(latest.location)
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
            locationLabel(sighting.location)
          )
        );

        header.append(headingGroup);

        const photoCount =
          Number(sighting.photo_count || 0);

        header.append(
          createTextElement(
            "span",
            "sighting-photo-count",
            `${photoCount} Foto${
              photoCount === 1 ? "" : "s"
            }`
          )
        );

        item.append(header);

        const metadata = [
          movementLabel(sighting.movement),
          directionLabel(sighting.direction),
          sighting.submission_id
        ]
          .filter(Boolean)
          .join(" · ");

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

        const photos =
          Array.isArray(sighting.photos)
            ? sighting.photos
            : [];

        if (photos.length > 0) {
          const gallery =
            document.createElement("div");

          gallery.className =
            "sighting-gallery";

          for (const photo of photos) {
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
          
            const selectButton =
              document.createElement("button");
          
            selectButton.type = "button";
          
            selectButton.className =
              "primary-photo-button";
          
            const isPrimaryPhoto =
              Boolean(photo.photo_id) &&
              photo.photo_id === primaryPhotoId;
          
            if (isPrimaryPhoto) {
              photoCard.classList.add(
                "is-primary"
              );
          
              selectButton.textContent =
                "Hauptfoto";
          
              selectButton.disabled = true;
            } else {
              selectButton.textContent =
                "Als Hauptfoto";
          
              selectButton.disabled =
                !photo.photo_id;
          
              selectButton.addEventListener(
                "click",
                () => savePrimaryPhoto(
                  photo,
                  sighting,
                  selectButton
                )
              );
            }
          
            photoCard.append(
              link,
              selectButton
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
  
    currentVessel = vessel;
    editButton.disabled = false;

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
      value(classification.ship_type)
    );

    set(
      "shipSubtype",
      value(classification.ship_subtype)
    );

    set(
      "flag",
      value(classification.flag)
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

    renderPrimaryPhoto(
      payload.primary_photo
    );

    renderSources(sources);

    renderSightings(
      payload.sightings,
      payload.sightings_meta,
      payload.primary_photo
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

    reloadButton.disabled = true;
    editButton.disabled = true;
    
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
  
  reloadButton.addEventListener(
    "click",
    load
  );
  
  apiKey.addEventListener(
    "change",
    () => {
      if (!editModeActive) {
        load();
      }
    }
  );
  
  load();
});
