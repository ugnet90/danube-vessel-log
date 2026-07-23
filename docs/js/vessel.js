// Danube Vessel Log
// File: docs/js/vessel.js
// Version: 0.10.7
// Updated: 2026-07-23

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

  const apiKey = byId("apiKey");
  const editButton = byId("editButton");
  const reloadButton = byId("reloadButton");
  const pageStatus = byId("pageStatus");
  const content = byId("vesselContent");

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
  
  let currentVessel = null;
  let currentPayload = null;
  let editModeActive = false;
  let sourceFormActive = false;
  let editingSourceId = "";
  let referenceReady = false;
  let editNameSearchToken = 0;
  let editNameSearchTimer = null;

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
      "klassifizierte Felder werden aus dem Kandidatenkatalog übernommen."
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
            actionLabel: "Fehlende Felder übernehmen",
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

    currentPayload = payload;
    currentVessel = vessel;
    
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
  
  reloadButton.addEventListener(
    "click",
    load
  );
  
  apiKey.addEventListener("change", () => {
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
});
