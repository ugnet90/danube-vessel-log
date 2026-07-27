/* Danube Vessel Log · vessel_enrichment.js · Version 0.13.1 */
"use strict";

document.addEventListener("DOMContentLoaded", () => {
  const byId = id => document.getElementById(id);
  const reloadButton = byId("reloadButton");
  const resetButton = byId("resetButton");
  const closeDetailButton = byId("closeDetailButton");
  const searchInput = byId("searchInput");
  const environmentFilter = byId("environmentFilter");
  const statusFilter = byId("statusFilter");
  const fieldFilter = byId("fieldFilter");
  const reportRows = byId("reportRows");
  const emptyState = byId("emptyState");
  const detailCard = byId("detailCard");
  const candidateTabs = byId("candidateTabs");
  const candidateInfo = byId("candidateInfo");
  const suggestionList = byId("suggestionList");
  const openVesselButton = byId("openVesselButton");
  const openWikidataButton = byId("openWikidataButton");

  let report = null;
  let selectedVessel = null;
  let selectedCandidateIndex = 0;

  const statusLabels = {
    candidate: "Kandidat mit Vorschlägen",
    matched_no_new_data: "Treffer ohne neue Daten",
    low_confidence: "Unsicherer Treffer",
    no_match: "Kein Treffer",
    lookup_error: "Abruffehler",
    not_needed: "Vollständig",
    offline: "Nur Fehlstellenreport",
    pending: "Noch nicht geprüft"
  };

  const confidenceLabels = {
    very_high: "sehr hoch",
    high: "hoch",
    medium: "mittel",
    low: "niedrig"
  };

  function setStatus(message, error = false) {
    const target = byId("pageStatus");
    target.textContent = message;
    target.classList.toggle("error", error);
  }

  function formatDateTime(value) {
    if (!value) return "–";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat("de-AT", {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(date);
  }

  function escapeText(value) {
    return String(value ?? "");
  }

  function bestCandidate(vessel) {
    return Array.isArray(vessel?.lookup?.candidates)
      ? vessel.lookup.candidates[0] ?? null
      : null;
  }

  function suggestionsCount(vessel) {
    return Array.isArray(bestCandidate(vessel)?.suggestions)
      ? bestCandidate(vessel).suggestions.length
      : 0;
  }

  function populateFieldFilter() {
    const labels = report?.field_labels ?? {};
    const options = Object.entries(labels).sort((a, b) => a[1].localeCompare(b[1], "de"));
    fieldFilter.replaceChildren(new Option("Alle Felder", "all"));
    for (const [path, label] of options) {
      fieldFilter.append(new Option(label, path));
    }
  }

  function renderSummary() {
    const summary = report?.summary ?? {};
    byId("totalCount").textContent = summary.vessels_total ?? 0;
    byId("incompleteCount").textContent = summary.vessels_incomplete ?? 0;
    byId("candidateCount").textContent = summary.candidate_matches ?? 0;
    byId("suggestionCount").textContent = summary.suggestions_total ?? 0;
    byId("noMatchCount").textContent = summary.no_match ?? 0;
    byId("errorCount").textContent = summary.lookup_errors ?? 0;
    byId("summaryGrid").classList.remove("hidden");
    byId("controlsCard").classList.remove("hidden");
    byId("reportCard").classList.remove("hidden");
    byId("reportMeta").classList.remove("hidden");
    const metaParts = [
      `Erstellt: ${formatDateTime(report?.generated_at)}`,
      `Quelle: ${report?.provider?.label ?? "–"}`,
      `Lizenz: ${report?.provider?.license ?? "–"}`,
      `Modus: ${report?.mode === "offline" ? "nur Fehlstellen" : "Wikidata-Abfrage"}`
    ];
    const warnings = Array.isArray(report?.warnings) ? report.warnings : [];
    if (warnings.length) metaParts.push(`Hinweis: ${warnings.join(" ")}`);
    byId("reportMeta").textContent = metaParts.join(" · ");
  }

  function filteredVessels() {
    const query = searchInput.value.trim().toLocaleLowerCase("de");
    const environment = environmentFilter.value;
    const status = statusFilter.value;
    const field = fieldFilter.value;
    const vessels = Array.isArray(report?.vessels) ? report.vessels : [];

    return vessels.filter(vessel => {
      if (environment !== "all" && vessel.environment !== environment) return false;
      const missing = Array.isArray(vessel.missing_fields) ? vessel.missing_fields : [];
      if (status === "complete" && vessel.missing_count !== 0) return false;
      if (status !== "all" && status !== "complete" && vessel.lookup?.status !== status) return false;
      if (status === "all" && vessel.missing_count === 0) return false;
      if (field !== "all" && !missing.some(item => item.field === field)) return false;
      if (query) {
        const haystack = `${vessel.vessel_id} ${vessel.name}`.toLocaleLowerCase("de");
        if (!haystack.includes(query)) return false;
      }
      return true;
    });
  }

  function createChip(label) {
    const chip = document.createElement("span");
    chip.className = "field-chip";
    chip.textContent = label;
    return chip;
  }

  function renderRows() {
    const vessels = filteredVessels();
    reportRows.replaceChildren();
    byId("resultCount").textContent = `${vessels.length} Schiff${vessels.length === 1 ? "" : "e"}`;
    emptyState.classList.toggle("hidden", vessels.length > 0);
    byId("tableWrapper").classList.toggle("hidden", vessels.length === 0);

    for (const vessel of vessels) {
      const row = document.createElement("tr");
      const idCell = document.createElement("td");
      const idLink = document.createElement("a");
      idLink.href = `vessel.html?id=${encodeURIComponent(vessel.vessel_id)}`;
      idLink.textContent = vessel.vessel_id;
      idCell.append(idLink);

      const nameCell = document.createElement("td");
      nameCell.textContent = vessel.name || "–";

      const missingCell = document.createElement("td");
      const chips = document.createElement("div");
      chips.className = "field-chips";
      const missingFields = Array.isArray(vessel.missing_fields) ? vessel.missing_fields : [];
      for (const item of missingFields.slice(0, 6)) chips.append(createChip(item.label));
      if (missingFields.length > 6) chips.append(createChip(`+${missingFields.length - 6}`));
      if (missingFields.length === 0) chips.append(createChip("vollständig"));
      missingCell.append(chips);

      const lookupCell = document.createElement("td");
      const statusBadge = document.createElement("span");
      statusBadge.className = `status-badge ${vessel.lookup?.status ?? ""}`;
      statusBadge.textContent = statusLabels[vessel.lookup?.status] ?? vessel.lookup?.status ?? "–";
      lookupCell.append(statusBadge);
      const candidate = bestCandidate(vessel);
      if (candidate) {
        const line = document.createElement("div");
        line.textContent = `${candidate.label} · ${Math.round(candidate.score * 100)} %`;
        line.style.marginTop = "5px";
        lookupCell.append(line);
      }

      const suggestionCell = document.createElement("td");
      suggestionCell.textContent = suggestionsCount(vessel);

      const actionCell = document.createElement("td");
      const button = document.createElement("button");
      button.type = "button";
      button.className = "secondary-button";
      button.textContent = "Details";
      button.disabled = !candidate && vessel.lookup?.status !== "lookup_error";
      button.addEventListener("click", () => showDetails(vessel));
      actionCell.append(button);

      row.append(idCell, nameCell, missingCell, lookupCell, suggestionCell, actionCell);
      reportRows.append(row);
    }
  }

  function renderCandidate() {
    candidateTabs.replaceChildren();
    suggestionList.replaceChildren();
    candidateInfo.replaceChildren();
    openWikidataButton.classList.add("hidden");

    const candidates = Array.isArray(selectedVessel?.lookup?.candidates)
      ? selectedVessel.lookup.candidates
      : [];

    if (!candidates.length) {
      const message = document.createElement("p");
      message.textContent = selectedVessel?.lookup?.error || "Für dieses Schiff liegt kein Wikidata-Kandidat vor.";
      candidateInfo.append(message);
      return;
    }

    candidates.forEach((candidate, index) => {
      const tab = document.createElement("button");
      tab.type = "button";
      tab.className = `candidate-tab${index === selectedCandidateIndex ? " active" : ""}`;
      tab.textContent = `${index + 1}. ${candidate.label} (${Math.round(candidate.score * 100)} %)`;
      tab.addEventListener("click", () => {
        selectedCandidateIndex = index;
        renderCandidate();
      });
      candidateTabs.append(tab);
    });

    const candidate = candidates[selectedCandidateIndex] ?? candidates[0];
    const heading = document.createElement("h3");
    heading.textContent = `${candidate.label} · ${candidate.qid}`;
    const description = document.createElement("p");
    description.textContent = candidate.description || "Keine Beschreibung vorhanden.";
    const confidence = document.createElement("p");
    confidence.innerHTML = "";
    const badge = document.createElement("span");
    badge.className = `confidence-badge ${candidate.confidence}`;
    badge.textContent = `Trefferqualität: ${confidenceLabels[candidate.confidence] ?? candidate.confidence}`;
    confidence.append(badge);
    const match = document.createElement("p");
    match.textContent = `Erkannt über: ${(candidate.matched_by ?? []).join(", ") || "Namenssuche"}`;
    candidateInfo.append(heading, description, confidence, match);

    const suggestions = Array.isArray(candidate.suggestions) ? candidate.suggestions : [];
    if (!suggestions.length) {
      const message = document.createElement("div");
      message.className = "empty-state";
      message.textContent = "Der Kandidat enthält für die derzeit fehlenden Felder keine neuen übernehmbaren Werte.";
      suggestionList.append(message);
    } else {
      for (const suggestion of suggestions) {
        const row = document.createElement("div");
        row.className = "suggestion-row";

        const label = document.createElement("strong");
        label.className = "suggestion-label";
        label.textContent = suggestion.field_label;

        const value = document.createElement("strong");
        value.textContent = escapeText(suggestion.display_value ?? suggestion.value);

        const source = document.createElement("div");
        source.className = "suggestion-source";
        const propertyLink = document.createElement("a");
        propertyLink.href = suggestion.property_url;
        propertyLink.target = "_blank";
        propertyLink.rel = "noopener noreferrer";
        propertyLink.textContent = `${suggestion.property} · ${suggestion.property_label}`;
        source.append("Wikidata-Eigenschaft: ", propertyLink);

        row.append(label, value, source);
        suggestionList.append(row);
      }
    }

    openWikidataButton.href = candidate.url;
    openWikidataButton.classList.remove("hidden");
  }

  function showDetails(vessel) {
    selectedVessel = vessel;
    selectedCandidateIndex = 0;
    byId("detailTitle").textContent = `${vessel.vessel_id} · ${vessel.name}`;
    byId("detailSubtitle").textContent = `${vessel.missing_count} fehlende Felder · ${statusLabels[vessel.lookup?.status] ?? vessel.lookup?.status}`;
    openVesselButton.href = `vessel.html?id=${encodeURIComponent(vessel.vessel_id)}`;
    renderCandidate();
    detailCard.classList.remove("hidden");
    detailCard.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function loadReport() {
    reloadButton.disabled = true;
    setStatus("Anreicherungsreport wird geladen …");
    detailCard.classList.add("hidden");
    try {
      const response = await fetch(`data/vessel_enrichment.json?ts=${Date.now()}`, { cache: "no-store" });
      if (!response.ok) throw new Error(`Report konnte nicht geladen werden (HTTP ${response.status}).`);
      const payload = await response.json();
      if (!payload || !Array.isArray(payload.vessels)) throw new Error("Der Report hat nicht das erwartete Format.");
      report = payload;
      populateFieldFilter();
      renderSummary();
      renderRows();
      if (payload.status === "not_built" || !payload.generated_at) {
        setStatus("Noch kein Anreicherungsreport vorhanden. Starte in GitHub Actions den Workflow „Build vessel enrichment“.", true);
      } else {
        setStatus(`Report vom ${formatDateTime(payload.generated_at)} geladen.`);
      }
    } catch (error) {
      report = null;
      setStatus(error instanceof Error ? error.message : String(error), true);
    } finally {
      reloadButton.disabled = false;
    }
  }

  reloadButton.addEventListener("click", loadReport);
  resetButton.addEventListener("click", () => {
    searchInput.value = "";
    environmentFilter.value = "production";
    statusFilter.value = "all";
    fieldFilter.value = "all";
    renderRows();
  });
  closeDetailButton.addEventListener("click", () => detailCard.classList.add("hidden"));
  for (const control of [searchInput, environmentFilter, statusFilter, fieldFilter]) {
    control.addEventListener(control === searchInput ? "input" : "change", renderRows);
  }

  loadReport();
});
