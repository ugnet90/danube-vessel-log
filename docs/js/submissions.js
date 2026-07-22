"use strict";

document.addEventListener("DOMContentLoaded", () => {
  const byId = id => document.getElementById(id);

  const workerUrlInput = byId("workerUrl");
  const apiKeyInput = byId("apiKey");
  const reloadButton = byId("reloadButton");
  const statusFilter = byId("statusFilter");
  const listStatus = byId("listStatus");
  const submissionList = byId("submissionList");
  const emptyState = byId("emptyState");
  const detailContent = byId("detailContent");
  const detailTitle = byId("detailTitle");
  const detailMeta = byId("detailMeta");
  const workflowBadge = byId("workflowBadge");
  const submissionPhoto = byId("submissionPhoto");
  const photoControls = byId("photoControls");
  const photoCounter = byId("photoCounter");
  const previousPhotoButton = byId("previousPhotoButton");
  const nextPhotoButton = byId("nextPhotoButton");
  const noPhotoMessage = byId("noPhotoMessage");
  const capturedAt = byId("capturedAt");
  const locationText = byId("locationText");
  const movementText = byId("movementText");
  const directionText = byId("directionText");
  const enteredName = byId("enteredName");
  const autoMatchStatus = byId("autoMatchStatus");
  const autoVesselId = byId("autoVesselId");
  const matchedBy = byId("matchedBy");
  const candidateIds = byId("candidateIds");

  const vesselStatus = byId("vesselStatus");
  const vesselEnvironmentBadge = byId("vesselEnvironmentBadge");
  const vesselCandidatePanel = byId("vesselCandidatePanel");
  const vesselCandidates = byId("vesselCandidates");
  const vesselError = byId("vesselError");
  const vesselContent = byId("vesselContent");
  const vesselName = byId("vesselName");
  const vesselId = byId("vesselId");
  const vesselJsonPath = byId("vesselJsonPath");
  const vesselFormerNames = byId("vesselFormerNames");
  const vesselMmsi = byId("vesselMmsi");
  const vesselImo = byId("vesselImo");
  const vesselEni = byId("vesselEni");
  const vesselCallSign = byId("vesselCallSign");
  const vesselShipType = byId("vesselShipType");
  const vesselShipSubtype = byId("vesselShipSubtype");
  const vesselFlag = byId("vesselFlag");
  const vesselStatusValue = byId("vesselStatusValue");
  const vesselYearBuilt = byId("vesselYearBuilt");
  const vesselShipyard = byId("vesselShipyard");
  const vesselLength = byId("vesselLength");
  const vesselWidth = byId("vesselWidth");
  const vesselDraft = byId("vesselDraft");
  const vesselPassengers = byId("vesselPassengers");
  const vesselOperator = byId("vesselOperator");
  const vesselOwner = byId("vesselOwner");
  const vesselManager = byId("vesselManager");
  const vesselCruiseBrand = byId("vesselCruiseBrand");
  const vesselHomePort = byId("vesselHomePort");
  const vesselEnrichmentStatus = byId("vesselEnrichmentStatus");
  const vesselEnrichmentDate = byId("vesselEnrichmentDate");
  const vesselSourceCount = byId("vesselSourceCount");
  const vesselUpdatedAt = byId("vesselUpdatedAt");

  const reviewSection = byId("reviewSection");
  const confirmButton = byId("confirmButton");
  const correctButton = byId("correctButton");
  const rejectButton = byId("rejectButton");
  const correctionPanel = byId("correctionPanel");
  const correctedVesselId = byId("correctedVesselId");
  const previewCorrectionButton = byId("previewCorrectionButton");
  const saveCorrectionButton = byId("saveCorrectionButton");
  const reviewNotes = byId("reviewNotes");
  const reviewResult = byId("reviewResult");

  const vesselIdPattern = /^VES-\d{6}$/;

  let submissions = [];
  let selectedSubmission = null;
  let selectedPhotoIndex = 0;
  let selectedVesselId = "";
  let reviewCandidateVesselId = "";
  let vesselLoadToken = 0;
  let reviewBusy = false;

  const vesselCache = new Map();

  const movementLabels = {
    moving: "fahrend",
    moored: "angelegt",
    unknown: "unbekannt"
  };

  const directionLabels = {
    upstream: "stromaufwärts",
    downstream: "stromabwärts",
    unknown: "unbekannt"
  };

  const matchLabels = {
    matched: "eindeutiger Treffer",
    ambiguous: "mehrdeutig",
    unmatched: "kein Treffer"
  };

  const workflowLabels = {
    new: "offen",
    reviewed: "bearbeitet",
    rejected: "abgelehnt"
  };

  const decisionLabels = {
    confirmed: "bestätigt",
    corrected: "korrigiert",
    rejected: "abgelehnt"
  };

  const vesselStatusLabels = {
    active: "aktiv",
    inactive: "inaktiv",
    scrapped: "verschrottet",
    unknown: "unbekannt"
  };

  const enrichmentStatusLabels = {
    pending: "ausstehend",
    running: "läuft",
    completed: "abgeschlossen",
    failed: "Fehler",
    unknown: "unbekannt"
  };

  function getWorkflowStatus(submission) {
    return (
      submission?.workflow?.status ??
      submission?.workflow_status ??
      "new"
    );
  }

  function getAutomaticMatch(submission) {
    return (
      submission?.workflow?.auto?.vessel_match ??
      submission?.automatic_match ??
      {}
    );
  }

  function getReview(submission) {
    return (
      submission?.workflow?.review ??
      submission?.review ??
      {}
    );
  }

  function normalizeWorkerUrl(value) {
    return String(value ?? "")
      .trim()
      .replace(/\/+$/, "");
  }

  function formatDateTime(value) {
    if (!value) {
      return "—";
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return String(value);
    }

    return new Intl.DateTimeFormat("de-AT", {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(date);
  }

  function formatNumber(value, suffix = "") {
    if (
      value === null ||
      value === undefined ||
      value === ""
    ) {
      return "—";
    }

    const number = Number(value);

    if (!Number.isFinite(number)) {
      return String(value);
    }

    const formatted = new Intl.NumberFormat("de-AT", {
      maximumFractionDigits: 2
    }).format(number);

    return suffix ? `${formatted} ${suffix}` : formatted;
  }

  function formatValue(value) {
    if (
      value === null ||
      value === undefined ||
      String(value).trim() === ""
    ) {
      return "—";
    }

    return String(value);
  }

  function formatList(value) {
    if (!Array.isArray(value) || value.length === 0) {
      return "—";
    }

    const values = value
      .map(item => String(item ?? "").trim())
      .filter(Boolean);

    return values.length > 0
      ? values.join(", ")
      : "—";
  }

  function formatPhotoCount(count) {
    const normalizedCount =
      Number.isInteger(count)
        ? count
        : Number(count) || 0;

    return normalizedCount === 1
      ? "1 Foto"
      : `${normalizedCount} Fotos`;
  }

  function formatSourceCount(sources) {
    const count = Array.isArray(sources)
      ? sources.length
      : 0;

    return count === 1
      ? "1 Quelle"
      : `${count} Quellen`;
  }

  function setListStatus(text) {
    listStatus.textContent = text;
  }

  function showReviewResult(type, text) {
    reviewResult.className =
      `review-result ${type}`;

    reviewResult.textContent = text;
  }

  function clearReviewResult() {
    reviewResult.className =
      "review-result hidden";

    reviewResult.textContent = "";
  }

  function getPhotos(submission) {
    if (Array.isArray(submission?.photos)) {
      return submission.photos.filter(photo =>
        photo &&
        typeof photo.url === "string" &&
        photo.url.trim() !== ""
      );
    }

    if (submission?.photo_url) {
      return [
        {
          url: submission.photo_url,
          path: submission.photo_path ?? "",
          sequence: 1
        }
      ];
    }

    return [];
  }

  function getAssignedVesselId(submission) {
    const review = getReview(submission);

    if (
      review.reviewed === true &&
      vesselIdPattern.test(review.vessel_id ?? "")
    ) {
      return review.vessel_id;
    }

    const automaticMatch =
      getAutomaticMatch(submission);

    if (
      automaticMatch.status === "matched" &&
      vesselIdPattern.test(
        automaticMatch.vessel_id ?? ""
      )
    ) {
      return automaticMatch.vessel_id;
    }

    return "";
  }

  function getCandidateVesselIds(submission) {
    const automaticMatch =
      getAutomaticMatch(submission);

    if (!Array.isArray(automaticMatch.candidate_ids)) {
      return [];
    }

    return [
      ...new Set(
        automaticMatch.candidate_ids
          .map(value => String(value ?? "").trim())
          .filter(value => vesselIdPattern.test(value))
      )
    ];
  }

  function renderPhoto() {
    if (!selectedSubmission) {
      return;
    }

    const photos = getPhotos(selectedSubmission);

    if (photos.length === 0) {
      submissionPhoto.removeAttribute("src");
      submissionPhoto.alt = "";
      submissionPhoto.classList.add("hidden");
      photoControls.classList.add("hidden");
      noPhotoMessage.classList.remove("hidden");
      return;
    }

    selectedPhotoIndex = Math.min(
      Math.max(selectedPhotoIndex, 0),
      photos.length - 1
    );

    const photo = photos[selectedPhotoIndex];

    submissionPhoto.src = photo.url;
    submissionPhoto.alt =
      `Foto ${selectedPhotoIndex + 1} der Sichtung ` +
      selectedSubmission.submission_id;

    submissionPhoto.classList.remove("hidden");
    noPhotoMessage.classList.add("hidden");

    photoCounter.textContent =
      `${selectedPhotoIndex + 1} / ${photos.length}`;

    previousPhotoButton.disabled =
      selectedPhotoIndex === 0;

    nextPhotoButton.disabled =
      selectedPhotoIndex === photos.length - 1;

    photoControls.classList.toggle(
      "hidden",
      photos.length <= 1
    );
  }

  function renderList() {
    submissionList.replaceChildren();

    if (submissions.length === 0) {
      const message = document.createElement("div");
      message.className = "list-status";
      message.textContent =
        "Keine Sichtungen für diesen Filter gefunden.";
      submissionList.append(message);
      return;
    }

    for (const submission of submissions) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "submission-list-item";

      if (
        selectedSubmission?.submission_id ===
        submission.submission_id
      ) {
        button.classList.add("active");
      }

      const automaticMatch =
        getAutomaticMatch(submission);

      const title = document.createElement("span");
      title.className = "submission-list-title";
      title.textContent =
        submission.vessel_name_entered ||
        automaticMatch.vessel_id ||
        "Unbekanntes Schiff";

      const meta = document.createElement("span");
      meta.className = "submission-list-meta";
      meta.textContent =
        `${formatDateTime(submission.captured_at)} · ` +
        `${submission.location?.name || "unbekannter Ort"}`;

      const status = document.createElement("span");
      status.className = "submission-list-status";

      const matchStatus =
        automaticMatch.status ?? "unmatched";

      const workflowStatus =
        getWorkflowStatus(submission);

      const workflowText =
        workflowLabels[workflowStatus] ?? workflowStatus;

      const matchText =
        matchLabels[matchStatus] ?? matchStatus;

      const photoCount =
        Number.isInteger(submission.photo_count)
          ? submission.photo_count
          : getPhotos(submission).length;

      status.textContent =
        `${workflowText} · ${matchText} · ` +
        formatPhotoCount(photoCount);

      button.append(title, meta, status);

      button.addEventListener("click", () => {
        selectSubmission(submission.submission_id);
      });

      submissionList.append(button);
    }
  }

  function resetVesselPanel() {
    vesselLoadToken += 1;
    selectedVesselId = "";
    reviewCandidateVesselId = "";
    vesselStatus.textContent = "";
    vesselEnvironmentBadge.className =
      "environment-badge hidden";
    vesselEnvironmentBadge.textContent = "";
    vesselCandidatePanel.classList.add("hidden");
    vesselCandidates.replaceChildren();
    vesselError.classList.add("hidden");
    vesselError.textContent = "";
    vesselContent.classList.add("hidden");
  }

  function updateCandidateSelection() {
    for (const button of vesselCandidates.querySelectorAll("button")) {
      button.classList.toggle(
        "active",
        button.dataset.vesselId === reviewCandidateVesselId
      );
    }
  }

  function renderCandidateButtons(vesselIds) {
    vesselCandidates.replaceChildren();

    if (vesselIds.length === 0) {
      vesselCandidatePanel.classList.add("hidden");
      return;
    }

    for (const candidateId of vesselIds) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "candidate-button";
      button.dataset.vesselId = candidateId;
      button.textContent = candidateId;

      button.addEventListener("click", () => {
        reviewCandidateVesselId = candidateId;
        correctedVesselId.value = candidateId;

        /*
         * Die Kandidatenauswahl ist der normale Weg bei einem
         * mehrdeutigen Treffer. Das manuelle Korrekturfeld bleibt
         * dafür geschlossen.
         */
        correctionPanel.classList.add("hidden");
        clearReviewResult();
        updateCandidateSelection();
        loadVessel(candidateId);
        updateReviewButtons();
      });

      vesselCandidates.append(button);
    }

    vesselCandidatePanel.classList.remove("hidden");
    updateCandidateSelection();
  }

  function renderVesselRecord(responseData) {
    const vessel = responseData?.vessel ?? {};
    const index = responseData?.index ?? {};
    const identity = vessel.identity ?? {};
    const classification = vessel.classification ?? {};
    const technical = vessel.technical ?? {};
    const operations = vessel.operations ?? {};
    const enrichment = vessel.enrichment ?? {};
    const audit = vessel.audit ?? {};

    vesselName.textContent = formatValue(identity.name);
    vesselId.textContent = formatValue(vessel.vessel_id);
    vesselJsonPath.textContent =
      formatValue(responseData?.path ?? index.json_path);

    vesselFormerNames.textContent =
      formatList(identity.former_names);
    vesselMmsi.textContent = formatValue(identity.mmsi);
    vesselImo.textContent = formatValue(identity.imo);
    vesselEni.textContent = formatValue(identity.eni);
    vesselCallSign.textContent =
      formatValue(identity.call_sign);

    vesselShipType.textContent =
      formatValue(classification.ship_type);
    vesselShipSubtype.textContent =
      formatValue(classification.ship_subtype);
    vesselFlag.textContent =
      formatValue(classification.flag);
    vesselStatusValue.textContent =
      vesselStatusLabels[classification.status] ??
      formatValue(classification.status);

    vesselYearBuilt.textContent =
      formatNumber(technical.year_built);
    vesselShipyard.textContent =
      formatValue(technical.shipyard);
    vesselLength.textContent =
      formatNumber(technical.length_m, "m");
    vesselWidth.textContent =
      formatNumber(technical.width_m, "m");
    vesselDraft.textContent =
      formatNumber(technical.draft_m, "m");
    vesselPassengers.textContent =
      formatNumber(technical.passengers);

    vesselOperator.textContent =
      formatValue(operations.operator);
    vesselOwner.textContent =
      formatValue(operations.owner);
    vesselManager.textContent =
      formatValue(operations.manager);
    vesselCruiseBrand.textContent =
      formatValue(operations.cruise_brand);
    vesselHomePort.textContent =
      formatValue(operations.home_port);

    vesselEnrichmentStatus.textContent =
      enrichmentStatusLabels[enrichment.status] ??
      formatValue(enrichment.status);
    vesselEnrichmentDate.textContent =
      formatDateTime(enrichment.last_run_at);
    vesselSourceCount.textContent =
      formatSourceCount(vessel.sources);
    vesselUpdatedAt.textContent =
      formatDateTime(
        audit.updated_at || index.updated_at
      );

    const environment =
      typeof audit.environment === "string"
        ? audit.environment.trim().toLowerCase()
        : "";

    if (environment) {
      vesselEnvironmentBadge.textContent =
        environment === "test"
          ? "TEST"
          : environment.toUpperCase();

      vesselEnvironmentBadge.className =
        "environment-badge " +
        (
          environment === "test"
            ? "environment-test"
            : "environment-production"
        );
    } else {
      vesselEnvironmentBadge.className =
        "environment-badge hidden";
      vesselEnvironmentBadge.textContent = "";
    }

    const automaticMatch =
      getAutomaticMatch(selectedSubmission);

    vesselStatus.textContent =
      automaticMatch.status === "ambiguous" &&
      reviewCandidateVesselId === vessel.vessel_id
        ? `${vessel.vessel_id} ist ausgewählt. ` +
          `Mit „Auswahl bestätigen“ wird die Zuordnung gespeichert.`
        : "Kanonischer Stammdatensatz geladen.";
    vesselError.classList.add("hidden");
    vesselContent.classList.remove("hidden");
    updateCandidateSelection();
  }

  function showVesselError(error) {
    vesselStatus.textContent =
      selectedVesselId
        ? `Stammdatensatz ${selectedVesselId} konnte nicht geladen werden.`
        : "Stammdatensatz konnte nicht geladen werden.";

    vesselError.textContent =
      error instanceof Error
        ? error.message
        : String(error);

    vesselError.classList.remove("hidden");
    vesselContent.classList.add("hidden");
    vesselEnvironmentBadge.className =
      "environment-badge hidden";
  }

  async function loadVessel(requestedVesselId) {
    const normalizedVesselId =
      String(requestedVesselId ?? "").trim();

    if (!vesselIdPattern.test(normalizedVesselId)) {
      showVesselError(
        new Error(
          "Bitte eine gültige Vessel-ID im Format VES-000000 eingeben."
        )
      );
      return;
    }

    const workerUrl =
      normalizeWorkerUrl(workerUrlInput.value);

    if (!workerUrl) {
      showVesselError(
        new Error("Bitte zuerst die Worker-URL eingeben.")
      );
      return;
    }

    const token = ++vesselLoadToken;
    selectedVesselId = normalizedVesselId;
    updateCandidateSelection();

    vesselStatus.textContent =
      `${normalizedVesselId} wird geladen …`;
    vesselError.classList.add("hidden");
    vesselContent.classList.add("hidden");
    vesselEnvironmentBadge.className =
      "environment-badge hidden";

    try {
      let responseData =
        vesselCache.get(normalizedVesselId);

      if (!responseData) {
        const response =
          await window.VesselApi.getVessel({
            workerUrl,
            apiKey: apiKeyInput.value,
            vesselId: normalizedVesselId
          });

        responseData = response.data;
        vesselCache.set(
          normalizedVesselId,
          responseData
        );
      }

      if (token !== vesselLoadToken) {
        return;
      }

      renderVesselRecord(responseData);
    } catch (error) {
      if (token !== vesselLoadToken) {
        return;
      }

      showVesselError(error);
    }
  }

  function renderVesselContext(submission) {
    resetVesselPanel();

    const workflowStatus =
      getWorkflowStatus(submission);
    const assignedVesselId =
      getAssignedVesselId(submission);
    const candidates =
      getCandidateVesselIds(submission);

    renderCandidateButtons(candidates);

    if (assignedVesselId) {
      loadVessel(assignedVesselId);
      return;
    }

    if (candidates.length > 0) {
      vesselStatus.textContent =
        "Mehrdeutiger Treffer. Wähle einen Kandidaten zur Prüfung aus.";
      loadVessel(candidates[0]);
      return;
    }

    if (workflowStatus === "rejected") {
      vesselStatus.textContent =
        "Die Sichtung wurde abgelehnt; es ist kein Schiff verknüpft.";
      return;
    }

    vesselStatus.textContent =
      "Der Sichtung ist noch kein Schiff zugeordnet.";
  }

  function updateReviewButtons() {
    const automaticMatch =
      getAutomaticMatch(selectedSubmission);

    const hasAutomaticMatch =
      automaticMatch.status === "matched" &&
      vesselIdPattern.test(
        automaticMatch.vessel_id ?? ""
      );

    const candidateIds =
      selectedSubmission
        ? getCandidateVesselIds(selectedSubmission)
        : [];

    const hasSelectedCandidate =
      automaticMatch.status === "ambiguous" &&
      candidateIds.includes(reviewCandidateVesselId);

    confirmButton.disabled =
      reviewBusy ||
      (!hasAutomaticMatch && !hasSelectedCandidate);

    if (hasAutomaticMatch) {
      confirmButton.textContent =
        "Zuordnung bestätigen";
    } else if (hasSelectedCandidate) {
      confirmButton.textContent =
        "Auswahl bestätigen";
    } else if (automaticMatch.status === "ambiguous") {
      confirmButton.textContent =
        "Kandidaten auswählen";
    } else {
      confirmButton.textContent =
        "Zuordnung bestätigen";
    }

    if (hasAutomaticMatch || hasSelectedCandidate) {
      correctButton.textContent =
        "Anderes Schiff zuordnen";
    } else {
      correctButton.textContent =
        "Vessel-ID manuell zuordnen";
    }
    
    correctButton.disabled = reviewBusy;
    rejectButton.disabled = reviewBusy;
    previewCorrectionButton.disabled = reviewBusy;
    saveCorrectionButton.disabled = reviewBusy;
  }

  function renderDetail() {
    if (!selectedSubmission) {
      emptyState.classList.remove("hidden");
      detailContent.classList.add("hidden");
      resetVesselPanel();
      return;
    }

    emptyState.classList.add("hidden");
    detailContent.classList.remove("hidden");

    const submission = selectedSubmission;
    const workflowStatus =
      getWorkflowStatus(submission);
    const automaticMatch =
      getAutomaticMatch(submission);
    const review = getReview(submission);

    detailTitle.textContent =
      submission.submission_id;
    detailMeta.textContent =
      formatDateTime(submission.captured_at);

    workflowBadge.textContent =
      workflowLabels[workflowStatus] ?? workflowStatus;
    workflowBadge.className =
      `status-badge status-${workflowStatus}`;

    capturedAt.textContent =
      formatDateTime(submission.captured_at);

    const locationParts = [
      submission.location?.name,
      submission.location?.municipality,
      submission.location?.country
    ].filter(Boolean);

    locationText.textContent =
      locationParts.length > 0
        ? locationParts.join(", ")
        : "—";

    movementText.textContent =
      movementLabels[submission.movement] ??
      submission.movement ??
      "—";

    directionText.textContent =
      directionLabels[submission.direction] ??
      submission.direction ??
      "—";

    enteredName.textContent =
      submission.vessel_name_entered || "—";

    if (review.reviewed === true) {
      autoMatchStatus.textContent =
        decisionLabels[review.decision] ??
        review.decision ??
        "bearbeitet";
      autoVesselId.textContent =
        review.vessel_id || "—";
      matchedBy.textContent =
        review.decision === "confirmed"
          ? "manuell bestätigt"
          : review.decision === "corrected"
            ? "manuell korrigiert"
            : "—";
      candidateIds.textContent = "—";
    } else {
      autoMatchStatus.textContent =
        matchLabels[automaticMatch.status] ??
        automaticMatch.status ??
        "—";
      autoVesselId.textContent =
        automaticMatch.vessel_id || "—";
      matchedBy.textContent =
        automaticMatch.matched_by || "—";
      candidateIds.textContent =
        getCandidateVesselIds(submission).length > 0
          ? getCandidateVesselIds(submission).join(", ")
          : "—";
    }

    reviewNotes.value = review.notes ?? "";
    correctedVesselId.value =
      review.decision === "corrected"
        ? review.vessel_id ?? ""
        : "";

    correctionPanel.classList.add("hidden");
    clearReviewResult();

    reviewSection.classList.toggle(
      "hidden",
      workflowStatus !== "new"
    );

    selectedPhotoIndex = 0;
    renderPhoto();
    renderList();
    updateReviewButtons();
    renderVesselContext(submission);
  }

  function selectSubmission(submissionId) {
    selectedSubmission =
      submissions.find(
        submission =>
          submission.submission_id === submissionId
      ) ?? null;

    renderDetail();
  }

  async function loadSubmissions({
    preserveSelection = true
  } = {}) {
    const workerUrl =
      normalizeWorkerUrl(workerUrlInput.value);

    if (!workerUrl) {
      setListStatus(
        "Bitte zuerst die Worker-URL eingeben."
      );
      return;
    }

    const previousId =
      preserveSelection
        ? selectedSubmission?.submission_id ?? ""
        : "";

    reloadButton.disabled = true;
    setListStatus("Sichtungen werden geladen …");

    try {
      const response =
        await window.VesselApi.request({
          workerUrl,
          path:
            `/review-submissions?status=` +
            `${encodeURIComponent(statusFilter.value)}` +
            `&limit=100`,
          apiKey: apiKeyInput.value
        });

      submissions =
        Array.isArray(response.data?.submissions)
          ? response.data.submissions
          : [];

      setListStatus(
        `${submissions.length} Sichtung` +
        `${submissions.length === 1 ? "" : "en"}` +
        ` geladen.`
      );

      selectedSubmission =
        submissions.find(
          submission =>
            submission.submission_id === previousId
        ) ??
        submissions[0] ??
        null;

      renderList();
      renderDetail();
    } catch (error) {
      submissions = [];
      selectedSubmission = null;
      renderList();
      renderDetail();
      setListStatus(
        error instanceof Error
          ? error.message
          : String(error)
      );
    } finally {
      reloadButton.disabled = false;
    }
  }

  async function submitReview({
    decision,
    vesselId: reviewedVesselId = ""
  }) {
    if (!selectedSubmission) {
      return;
    }

    clearReviewResult();
    reviewBusy = true;
    updateReviewButtons();

    try {
      await window.VesselApi.reviewSubmission({
        workerUrl: workerUrlInput.value,
        apiKey: apiKeyInput.value,
        submissionId:
          selectedSubmission.submission_id,
        decision,
        vesselId: reviewedVesselId,
        notes: reviewNotes.value.trim()
      });

      showReviewResult(
        "success",
        "Die Entscheidung wurde gespeichert."
      );

      vesselCache.clear();

      await loadSubmissions({
        preserveSelection: false
      });
    } catch (error) {
      showReviewResult(
        "error",
        error instanceof Error
          ? error.message
          : String(error)
      );
    } finally {
      reviewBusy = false;
      updateReviewButtons();
    }
  }

  reloadButton.addEventListener("click", () => {
    vesselCache.clear();
    loadSubmissions();
  });

  statusFilter.addEventListener("change", () => {
    loadSubmissions({
      preserveSelection: false
    });
  });

  previousPhotoButton.addEventListener("click", () => {
    selectedPhotoIndex -= 1;
    renderPhoto();
  });

  nextPhotoButton.addEventListener("click", () => {
    selectedPhotoIndex += 1;
    renderPhoto();
  });

  confirmButton.addEventListener("click", () => {
    const automaticMatch =
      getAutomaticMatch(selectedSubmission);

    if (
      automaticMatch.status === "matched" &&
      vesselIdPattern.test(
        automaticMatch.vessel_id ?? ""
      )
    ) {
      submitReview({
        decision: "confirmed"
      });
      return;
    }

    const candidateIds =
      selectedSubmission
        ? getCandidateVesselIds(selectedSubmission)
        : [];

    if (
      automaticMatch.status === "ambiguous" &&
      candidateIds.includes(reviewCandidateVesselId)
    ) {
      submitReview({
        decision: "corrected",
        vesselId: reviewCandidateVesselId
      });
      return;
    }

    showReviewResult(
      "error",
      "Bitte zuerst eines der möglichen Schiffe auswählen."
    );
  });

  correctButton.addEventListener("click", () => {
    correctionPanel.classList.remove("hidden");

    if (
      !correctedVesselId.value.trim() &&
      reviewCandidateVesselId
    ) {
      correctedVesselId.value =
        reviewCandidateVesselId;
    }

    requestAnimationFrame(() => {
      correctionPanel.scrollIntoView({
        behavior: "smooth",
        block: "nearest"
      });
      correctedVesselId.focus();
      correctedVesselId.select();
    });
  });

  previewCorrectionButton.addEventListener("click", () => {
    const correctedId =
      correctedVesselId.value.trim();

    if (!vesselIdPattern.test(correctedId)) {
      showReviewResult(
        "error",
        "Bitte eine gültige Vessel-ID im Format VES-000001 eingeben."
      );
      return;
    }

    clearReviewResult();
    loadVessel(correctedId);
  });

  saveCorrectionButton.addEventListener("click", () => {
    const correctedId =
      correctedVesselId.value.trim();

    if (!vesselIdPattern.test(correctedId)) {
      showReviewResult(
        "error",
        "Bitte eine gültige Vessel-ID im Format VES-000001 eingeben."
      );
      return;
    }

    submitReview({
      decision: "corrected",
      vesselId: correctedId
    });
  });

  correctedVesselId.addEventListener("keydown", event => {
    if (event.key !== "Enter") {
      return;
    }

    event.preventDefault();
    previewCorrectionButton.click();
  });

  rejectButton.addEventListener("click", () => {
    const confirmed = window.confirm(
      "Diese Sichtung wirklich ablehnen?"
    );

    if (!confirmed) {
      return;
    }

    submitReview({
      decision: "rejected"
    });
  });
});
