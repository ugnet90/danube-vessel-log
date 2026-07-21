"use strict";

document.addEventListener("DOMContentLoaded", () => {
  const workerUrlInput =
    document.getElementById("workerUrl");

  const apiKeyInput =
    document.getElementById("apiKey");

  const reloadButton =
    document.getElementById("reloadButton");

  const statusFilter =
    document.getElementById("statusFilter");

  const listStatus =
    document.getElementById("listStatus");

  const submissionList =
    document.getElementById("submissionList");

  const emptyState =
    document.getElementById("emptyState");

  const detailContent =
    document.getElementById("detailContent");

  const detailTitle =
    document.getElementById("detailTitle");

  const detailMeta =
    document.getElementById("detailMeta");

  const workflowBadge =
    document.getElementById("workflowBadge");

  const submissionPhoto =
    document.getElementById("submissionPhoto");

  const photoControls =
    document.getElementById("photoControls");

  const photoCounter =
    document.getElementById("photoCounter");

  const previousPhotoButton =
    document.getElementById("previousPhotoButton");

  const nextPhotoButton =
    document.getElementById("nextPhotoButton");

  const noPhotoMessage =
    document.getElementById("noPhotoMessage");

  const capturedAt =
    document.getElementById("capturedAt");

  const locationText =
    document.getElementById("locationText");

  const movementText =
    document.getElementById("movementText");

  const directionText =
    document.getElementById("directionText");

  const enteredName =
    document.getElementById("enteredName");

  const autoMatchStatus =
    document.getElementById("autoMatchStatus");

  const autoVesselId =
    document.getElementById("autoVesselId");

  const matchedBy =
    document.getElementById("matchedBy");

  const candidateIds =
    document.getElementById("candidateIds");

  const reviewSection =
    document.getElementById("reviewSection");

  const confirmButton =
    document.getElementById("confirmButton");

  const correctButton =
    document.getElementById("correctButton");

  const rejectButton =
    document.getElementById("rejectButton");

  const correctionPanel =
    document.getElementById("correctionPanel");

  const correctedVesselId =
    document.getElementById("correctedVesselId");

  const saveCorrectionButton =
    document.getElementById("saveCorrectionButton");

  const reviewNotes =
    document.getElementById("reviewNotes");

  const reviewResult =
    document.getElementById("reviewResult");

  let submissions = [];
  let selectedSubmission = null;
  let selectedPhotoIndex = 0;

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
      return value;
    }

    return new Intl.DateTimeFormat("de-AT", {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(date);
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

  function renderPhoto() {
    if (!selectedSubmission) {
      return;
    }

    const photos =
      getPhotos(selectedSubmission);

    if (photos.length === 0) {
      submissionPhoto.removeAttribute("src");
      submissionPhoto.alt = "";
      submissionPhoto.classList.add("hidden");

      photoControls.classList.add("hidden");
      noPhotoMessage.classList.remove("hidden");

      return;
    }

    selectedPhotoIndex =
      Math.min(
        Math.max(selectedPhotoIndex, 0),
        photos.length - 1
      );

    const photo =
      photos[selectedPhotoIndex];

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
      const message =
        document.createElement("div");

      message.className = "list-status";

      message.textContent =
        "Keine Sichtungen für diesen Filter gefunden.";

      submissionList.append(message);

      return;
    }

    for (const submission of submissions) {
      const button =
        document.createElement("button");

      button.type = "button";
      button.className = "submission-list-item";

      if (
        selectedSubmission?.submission_id ===
        submission.submission_id
      ) {
        button.classList.add("active");
      }

      const title =
        document.createElement("span");

      title.className =
        "submission-list-title";

      title.textContent =
        submission.vessel_name_entered ||
        submission.automatic_match?.vessel_id ||
        "Unbekanntes Schiff";

      const meta =
        document.createElement("span");

      meta.className =
        "submission-list-meta";

      meta.textContent =
        `${formatDateTime(submission.captured_at)} · ` +
        `${submission.location?.name || "unbekannter Ort"}`;

      const status =
        document.createElement("span");

      status.className =
        "submission-list-status";

      const matchStatus =
        submission.automatic_match?.status ??
        "unmatched";

      const workflowText =
        workflowLabels[
          submission.workflow_status
        ] ??
        submission.workflow_status;

      const matchText =
        matchLabels[matchStatus] ??
        matchStatus;

      const photoCount =
        Number.isInteger(submission.photo_count)
          ? submission.photo_count
          : getPhotos(submission).length;

      status.textContent =
        `${workflowText} · ` +
        `${matchText} · ` +
        formatPhotoCount(photoCount);

      button.append(
        title,
        meta,
        status
      );

      button.addEventListener("click", () => {
        selectSubmission(
          submission.submission_id
        );
      });

      submissionList.append(button);
    }
  }

  function renderDetail() {
    if (!selectedSubmission) {
      emptyState.classList.remove("hidden");
      detailContent.classList.add("hidden");

      return;
    }

    emptyState.classList.add("hidden");
    detailContent.classList.remove("hidden");

    const submission =
      selectedSubmission;

    const automaticMatch =
      submission.automatic_match ?? {};

    detailTitle.textContent =
      submission.submission_id;

    detailMeta.textContent =
      formatDateTime(submission.captured_at);

    workflowBadge.textContent =
      workflowLabels[
        submission.workflow_status
      ] ??
      submission.workflow_status;

    workflowBadge.className =
      `status-badge status-${submission.workflow_status}`;

    capturedAt.textContent =
      formatDateTime(
        submission.captured_at
      );

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
      submission.vessel_name_entered ||
      "—";

    autoMatchStatus.textContent =
      matchLabels[automaticMatch.status] ??
      automaticMatch.status ??
      "—";

    autoVesselId.textContent =
      automaticMatch.vessel_id ||
      "—";

    matchedBy.textContent =
      automaticMatch.matched_by ||
      "—";

    candidateIds.textContent =
      Array.isArray(
        automaticMatch.candidate_ids
      ) &&
      automaticMatch.candidate_ids.length > 0
        ? automaticMatch.candidate_ids.join(", ")
        : "—";

    reviewNotes.value =
      submission.review?.notes ?? "";

    correctedVesselId.value =
      submission.review?.decision === "corrected"
        ? submission.review?.vessel_id ?? ""
        : "";

    correctionPanel.classList.add("hidden");

    clearReviewResult();

    const isNew =
      submission.workflow_status === "new";

    reviewSection.classList.toggle(
      "hidden",
      !isNew
    );

    confirmButton.disabled =
      automaticMatch.status !== "matched" ||
      !automaticMatch.vessel_id;

    selectedPhotoIndex = 0;

    renderPhoto();
    renderList();
  }

  function selectSubmission(submissionId) {
    selectedSubmission =
      submissions.find(
        submission =>
          submission.submission_id ===
          submissionId
      ) ?? null;

    renderDetail();
  }

  async function loadSubmissions({
    preserveSelection = true
  } = {}) {
    const workerUrl =
      normalizeWorkerUrl(
        workerUrlInput.value
      );

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

    setListStatus(
      "Sichtungen werden geladen …"
    );

    try {
      const response =
        await window.VesselApi.request({
          workerUrl,
          path:
            `/review-submissions?status=` +
            `${encodeURIComponent(statusFilter.value)}` +
            `&limit=100`,
          apiKey:
            apiKeyInput.value
        });

      submissions =
        Array.isArray(
          response.data?.submissions
        )
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
            submission.submission_id ===
            previousId
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
    vesselId = ""
  }) {
    if (!selectedSubmission) {
      return;
    }

    clearReviewResult();

    confirmButton.disabled = true;
    correctButton.disabled = true;
    rejectButton.disabled = true;
    saveCorrectionButton.disabled = true;

    try {
      await window.VesselApi.reviewSubmission({
        workerUrl:
          workerUrlInput.value,

        apiKey:
          apiKeyInput.value,

        submissionId:
          selectedSubmission.submission_id,

        decision,

        vesselId,

        notes:
          reviewNotes.value.trim()
      });

      showReviewResult(
        "success",
        "Die Entscheidung wurde gespeichert."
      );

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
      confirmButton.disabled = false;
      correctButton.disabled = false;
      rejectButton.disabled = false;
      saveCorrectionButton.disabled = false;
    }
  }

  reloadButton.addEventListener(
    "click",
    () => {
      loadSubmissions();
    }
  );

  statusFilter.addEventListener(
    "change",
    () => {
      loadSubmissions({
        preserveSelection: false
      });
    }
  );

  previousPhotoButton.addEventListener(
    "click",
    () => {
      selectedPhotoIndex -= 1;
      renderPhoto();
    }
  );

  nextPhotoButton.addEventListener(
    "click",
    () => {
      selectedPhotoIndex += 1;
      renderPhoto();
    }
  );

  confirmButton.addEventListener(
    "click",
    () => {
      submitReview({
        decision: "confirmed"
      });
    }
  );

  correctButton.addEventListener(
    "click",
    () => {
      correctionPanel.classList.toggle(
        "hidden"
      );

      if (
        !correctionPanel.classList.contains(
          "hidden"
        )
      ) {
        correctedVesselId.focus();
      }
    }
  );

  saveCorrectionButton.addEventListener(
    "click",
    () => {
      const vesselId =
        correctedVesselId.value.trim();

      if (!/^VES-\d{6}$/.test(vesselId)) {
        showReviewResult(
          "error",
          "Bitte eine gültige Vessel-ID im Format VES-000001 eingeben."
        );

        return;
      }

      submitReview({
        decision: "corrected",
        vesselId
      });
    }
  );

  rejectButton.addEventListener(
    "click",
    () => {
      const confirmed =
        window.confirm(
          "Diese Sichtung wirklich ablehnen?"
        );

      if (!confirmed) {
        return;
      }

      submitReview({
        decision: "rejected"
      });
    }
  );
});
