/* Danube Vessel Log · vessel_enrichment.js · Version 0.13.2 */
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
  const candidateReviewPanel = byId("candidateReviewPanel");
  const candidateConfirmed = byId("candidateConfirmed");
  const candidateConfirmationText = byId("candidateConfirmationText");
  const selectAllButton = byId("selectAllButton");
  const clearSelectionButton = byId("clearSelectionButton");
  const suggestionList = byId("suggestionList");
  const applyStatus = byId("applyStatus");
  const applyButton = byId("applyButton");
  const rejectCandidateButton = byId("rejectCandidateButton");
  const openVesselButton = byId("openVesselButton");
  const openWikidataButton = byId("openWikidataButton");

  const workerUrl = String(window.VesselConfig?.workerUrl ?? "")
    .trim()
    .replace(/\/+$/, "");

  let report = null;
  let selectedVessel = null;
  let selectedCandidateIndex = 0;
  let requestRunning = false;

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

  const matchLabels = {
    manual_confirmation: "manuelle Bestätigung",
    name: "exakter Name",
    name_partial: "Teilübereinstimmung beim Namen",
    "identity.imo": "IMO",
    "identity.mmsi": "MMSI",
    "identity.eni": "ENI",
    identifier: "Kennung"
  };

  function setStatus(message, error = false) {
    const target = byId("pageStatus");
    target.textContent = message;
    target.classList.toggle("error", error);
  }

  function setApplyStatus(message, error = false, success = false) {
    applyStatus.textContent = message;
    applyStatus.classList.toggle("error", error);
    applyStatus.classList.toggle("success", success);
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

  function candidatesOf(vessel) {
    return Array.isArray(vessel?.lookup?.candidates)
      ? vessel.lookup.candidates
      : [];
  }

  function bestCandidate(vessel) {
    return candidatesOf(vessel)[0] ?? null;
  }

  function suggestionsCount(vessel) {
    return Array.isArray(bestCandidate(vessel)?.suggestions)
      ? bestCandidate(vessel).suggestions.length
      : 0;
  }

  function currentCandidate() {
    const candidates = candidatesOf(selectedVessel);
    return candidates[selectedCandidateIndex] ?? candidates[0] ?? null;
  }

  function populateFieldFilter() {
    const labels = report?.field_labels ?? {};
    const options = Object.entries(labels).sort((a, b) => a[1].localeCompare(b[1], "de"));
    fieldFilter.replaceChildren(new Option("Alle Felder", "all"));
    for (const [path, label] of options) fieldFilter.append(new Option(label, path));
  }

  function recalculateSummary() {
    const vessels = Array.isArray(report?.vessels) ? report.vessels : [];
    report.summary = {
      vessels_total: vessels.length,
      vessels_incomplete: vessels.filter(item => item.missing_count > 0).length,
      vessels_complete: vessels.filter(item => item.missing_count === 0).length,
      candidate_matches: vessels.filter(item => item.lookup?.status === "candidate").length,
      matched_no_new_data: vessels.filter(item => item.lookup?.status === "matched_no_new_data").length,
      low_confidence: vessels.filter(item => item.lookup?.status === "low_confidence").length,
      no_match: vessels.filter(item => item.lookup?.status === "no_match").length,
      lookup_errors: vessels.filter(item => item.lookup?.status === "lookup_error").length,
      suggestions_total: vessels.reduce((sum, vessel) => sum + suggestionsCount(vessel), 0)
    };
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
        line.textContent = `${candidate.label} · ${Math.round(candidate.score * 100)} %${candidate.manually_confirmed ? " · bestätigt" : ""}`;
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

  function selectedSuggestions() {
    const candidate = currentCandidate();
    if (!candidate) return [];
    const suggestions = Array.isArray(candidate.suggestions) ? candidate.suggestions : [];
    return [...suggestionList.querySelectorAll('input[type="checkbox"][data-suggestion-index]:checked')]
      .map(input => suggestions[Number(input.dataset.suggestionIndex)])
      .filter(Boolean);
  }

  function updateApplyButton() {
    const candidate = currentCandidate();
    const count = selectedSuggestions().length;
    applyButton.disabled = requestRunning || !candidate || !candidateConfirmed.checked || count === 0;
    applyButton.textContent = count > 0
      ? `${count} ausgewählte${count === 1 ? "n Wert" : " Werte"} übernehmen`
      : "Ausgewählte Werte übernehmen";
    rejectCandidateButton.disabled = requestRunning || !candidate;
    selectAllButton.disabled = requestRunning || !candidate || suggestionList.querySelectorAll('input[data-suggestion-index]').length === 0;
    clearSelectionButton.disabled = requestRunning || !candidate || count === 0;
  }

  function setRequestRunning(running) {
    requestRunning = Boolean(running);
    candidateConfirmed.disabled = requestRunning;
    closeDetailButton.disabled = requestRunning;
    updateApplyButton();
  }

  function renderCandidate() {
    candidateTabs.replaceChildren();
    suggestionList.replaceChildren();
    candidateInfo.replaceChildren();
    openWikidataButton.classList.add("hidden");
    candidateReviewPanel.classList.add("hidden");
    setApplyStatus("");

    const candidates = candidatesOf(selectedVessel);

    if (!candidates.length) {
      const message = document.createElement("p");
      message.textContent = selectedVessel?.lookup?.error || "Für dieses Schiff liegt kein Wikidata-Kandidat vor.";
      candidateInfo.append(message);
      applyButton.disabled = true;
      rejectCandidateButton.disabled = true;
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

    const candidate = currentCandidate();
    const heading = document.createElement("h3");
    heading.textContent = `${candidate.label} · ${candidate.qid}`;
    const description = document.createElement("p");
    description.textContent = candidate.description || "Keine Beschreibung vorhanden.";
    const confidence = document.createElement("p");
    const badge = document.createElement("span");
    badge.className = `confidence-badge ${candidate.confidence}`;
    badge.textContent = candidate.manually_confirmed
      ? "Kandidat bereits manuell bestätigt"
      : `Technische Trefferbewertung: ${confidenceLabels[candidate.confidence] ?? candidate.confidence}`;
    confidence.append(badge);
    const match = document.createElement("p");
    const matchMethods = (candidate.matched_by ?? []).map(value => matchLabels[value] ?? value);
    match.textContent = `Erkannt über: ${matchMethods.join(", ") || "Namenssuche"}`;
    candidateInfo.append(heading, description, confidence, match);

    const suggestions = Array.isArray(candidate.suggestions) ? candidate.suggestions : [];
    if (!suggestions.length) {
      const message = document.createElement("div");
      message.className = "empty-state";
      message.textContent = "Der Kandidat enthält für die derzeit fehlenden Felder keine neuen übernehmbaren Werte.";
      suggestionList.append(message);
    } else {
      suggestions.forEach((suggestion, index) => {
        const row = document.createElement("label");
        row.className = "suggestion-row selectable";

        const choice = document.createElement("div");
        choice.className = "suggestion-choice";
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.dataset.suggestionIndex = String(index);
        checkbox.disabled = suggestion.apply_supported === false;
        checkbox.addEventListener("change", updateApplyButton);
        const label = document.createElement("strong");
        label.className = "suggestion-label";
        label.textContent = suggestion.field_label;
        choice.append(checkbox, label);

        const value = document.createElement("strong");
        value.textContent = escapeText(suggestion.display_value ?? suggestion.value);

        const source = document.createElement("div");
        source.className = "suggestion-source";
        const propertyLink = document.createElement("a");
        propertyLink.href = suggestion.property_url;
        propertyLink.target = "_blank";
        propertyLink.rel = "noopener noreferrer";
        propertyLink.textContent = `${suggestion.property} · ${suggestion.property_label}`;
        propertyLink.addEventListener("click", event => event.stopPropagation());
        source.append("Wikidata-Eigenschaft: ", propertyLink);

        row.append(choice, value, source);
        suggestionList.append(row);
      });
    }

    candidateConfirmed.checked = candidate.manually_confirmed === true;
    candidateConfirmationText.textContent = candidate.manually_confirmed
      ? `${candidate.label} (${candidate.qid}) wurde bereits als passender Eintrag für ${selectedVessel.name} bestätigt.`
      : `Ich bestätige, dass ${candidate.label} (${candidate.qid}) tatsächlich ${selectedVessel.name} ist.`;
    candidateReviewPanel.classList.remove("hidden");
    openWikidataButton.href = candidate.url;
    openWikidataButton.classList.remove("hidden");
    updateApplyButton();
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

  function updateLocalAfterApply(candidate, appliedFields) {
    const applied = new Set(appliedFields);
    selectedVessel.missing_fields = (selectedVessel.missing_fields ?? []).filter(item => !applied.has(item.field));
    selectedVessel.missing_count = selectedVessel.missing_fields.length;
    candidate.suggestions = (candidate.suggestions ?? []).filter(item => !applied.has(item.field));
    candidate.manually_confirmed = true;
    candidate.score = 1;
    candidate.confidence = "very_high";
    candidate.matched_by = ["manual_confirmation"];
    selectedVessel.lookup.accepted_qid = candidate.qid;
    selectedVessel.lookup.rejected_qids = (selectedVessel.lookup.rejected_qids ?? []).filter(qid => qid !== candidate.qid);
    selectedVessel.lookup.status = selectedVessel.missing_count === 0
      ? "not_needed"
      : candidate.suggestions.length > 0
        ? "candidate"
        : "matched_no_new_data";
    recalculateSummary();
    renderSummary();
    renderRows();
    byId("detailSubtitle").textContent = `${selectedVessel.missing_count} fehlende Felder · ${statusLabels[selectedVessel.lookup.status]}`;
    renderCandidate();
  }

  function updateLocalAfterReject(candidate) {
    const candidates = candidatesOf(selectedVessel).filter(item => item.qid !== candidate.qid);
    selectedVessel.lookup.candidates = candidates;
    selectedVessel.lookup.rejected_qids = [...new Set([...(selectedVessel.lookup.rejected_qids ?? []), candidate.qid])];
    if (selectedVessel.lookup.accepted_qid === candidate.qid) selectedVessel.lookup.accepted_qid = "";
    selectedVessel.lookup.status = candidates.length
      ? (candidates[0].score >= 0.82 ? (candidates[0].suggestions?.length ? "candidate" : "matched_no_new_data") : "low_confidence")
      : "no_match";
    selectedCandidateIndex = 0;
    recalculateSummary();
    renderSummary();
    renderRows();
    byId("detailSubtitle").textContent = `${selectedVessel.missing_count} fehlende Felder · ${statusLabels[selectedVessel.lookup.status]}`;
    renderCandidate();
  }

  async function postReview(action, candidate, suggestions = []) {
    if (!workerUrl) throw new Error("Die Worker-URL fehlt in js/config.js.");
    if (!window.VesselApi?.request) throw new Error("js/api.js wurde nicht geladen.");
    return window.VesselApi.request({
      workerUrl,
      path: "/vessel-enrichment-review",
      method: "POST",
      body: {
        action,
        vessel_id: selectedVessel.vessel_id,
        candidate: {
          qid: candidate.qid,
          label: candidate.label,
          revision_id: candidate.revision_id ?? null
        },
        suggestions: suggestions.map(item => ({
          field: item.field,
          value: item.value,
          property: item.property
        })),
        report_generated_at: report?.generated_at ?? ""
      }
    });
  }

  async function applySelectedSuggestions() {
    const candidate = currentCandidate();
    const suggestions = selectedSuggestions();
    if (!candidate || !candidateConfirmed.checked || suggestions.length === 0) return;

    const confirmed = window.confirm(
      `${suggestions.length} ausgewählte${suggestions.length === 1 ? "n Wert" : " Werte"} aus ${candidate.label} (${candidate.qid}) ` +
      `in ${selectedVessel.vessel_id} übernehmen? Bereits befüllte Felder werden nicht überschrieben.`
    );
    if (!confirmed) return;

    setRequestRunning(true);
    setApplyStatus("Die ausgewählten Werte werden gespeichert …");

    try {
      const response = await postReview("apply", candidate, suggestions);
      const result = response.data ?? {};
      const appliedFields = Array.isArray(result.applied_fields) ? result.applied_fields : [];
      updateLocalAfterApply(candidate, appliedFields);
      setApplyStatus(
        `${result.message || "Die Werte wurden gespeichert."} Die Wikidata-Quelle wurde beim Schiff hinterlegt.`,
        false,
        true
      );
      setStatus("Die Schiffsdaten wurden geändert. Der Anreicherungsreport wird durch GitHub Actions neu erstellt.");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setApplyStatus(message, true);
      if (error?.status === 401) setStatus("Für Änderungen ist der Management-Schlüssel erforderlich.", true);
    } finally {
      setRequestRunning(false);
    }
  }

  async function rejectCurrentCandidate() {
    const candidate = currentCandidate();
    if (!candidate) return;

    const confirmed = window.confirm(
      `${candidate.label} (${candidate.qid}) für ${selectedVessel.name} dauerhaft als unpassend markieren? ` +
      "Der nächste Anreicherungsreport berücksichtigt diesen Kandidaten nicht mehr."
    );
    if (!confirmed) return;

    setRequestRunning(true);
    setApplyStatus("Der Kandidat wird als unpassend gespeichert …");

    try {
      const response = await postReview("reject", candidate);
      const result = response.data ?? {};
      updateLocalAfterReject(candidate);
      setApplyStatus(result.message || "Der Kandidat wurde als unpassend markiert.", false, true);
      setStatus("Die Kandidatenentscheidung wurde gespeichert. Der Anreicherungsreport wird durch GitHub Actions neu erstellt.");
    } catch (error) {
      setApplyStatus(error instanceof Error ? error.message : String(error), true);
    } finally {
      setRequestRunning(false);
    }
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
  candidateConfirmed.addEventListener("change", updateApplyButton);
  selectAllButton.addEventListener("click", () => {
    suggestionList.querySelectorAll('input[data-suggestion-index]:not(:disabled)').forEach(input => { input.checked = true; });
    updateApplyButton();
  });
  clearSelectionButton.addEventListener("click", () => {
    suggestionList.querySelectorAll('input[data-suggestion-index]').forEach(input => { input.checked = false; });
    updateApplyButton();
  });
  applyButton.addEventListener("click", applySelectedSuggestions);
  rejectCandidateButton.addEventListener("click", rejectCurrentCandidate);
  for (const control of [searchInput, environmentFilter, statusFilter, fieldFilter]) {
    control.addEventListener(control === searchInput ? "input" : "change", renderRows);
  }

  loadReport();
});
