"use strict";

document.addEventListener("DOMContentLoaded", () => {
  const form =
    document.getElementById("reviewForm");

  const workerUrlInput =
    document.getElementById("workerUrl");

  const apiKeyInput =
    document.getElementById("apiKey");

  const submissionIdInput =
    document.getElementById("submissionId");

  const decisionSelect =
    document.getElementById("decision");

  const vesselField =
    document.getElementById("vesselField");

  const vesselIdInput =
    document.getElementById("vesselId");

  const notesInput =
    document.getElementById("notes");

  const submitButton =
    document.getElementById("submitButton");

  const result =
    document.getElementById("result");

  const resultTitle =
    document.getElementById("resultTitle");

  const resultText =
    document.getElementById("resultText");

  const responseJson =
    document.getElementById("responseJson");

  function updateDecisionFields() {
    const isCorrected =
      decisionSelect.value === "corrected";

    vesselField.classList.toggle(
      "hidden",
      !isCorrected
    );

    vesselIdInput.required = isCorrected;
    vesselIdInput.disabled = !isCorrected;

    if (!isCorrected) {
      vesselIdInput.value = "";
    }
  }

  function showResult({
    type,
    title,
    text,
    data
  }) {
    result.className = `result-box ${type}`;

    resultTitle.textContent = title;
    resultText.textContent = text;

    if (data === undefined) {
      responseJson.textContent = "";
      responseJson.classList.add("hidden");
      return;
    }

    responseJson.textContent =
      typeof data === "string"
        ? data
        : JSON.stringify(data, null, 2);

    responseJson.classList.remove("hidden");
  }

  function setSubmitting(isSubmitting) {
    submitButton.disabled = isSubmitting;

    submitButton.textContent =
      isSubmitting
        ? "Wird gesendet …"
        : "Review senden";
  }

  decisionSelect.addEventListener(
    "change",
    updateDecisionFields
  );

  form.addEventListener("submit", async event => {
    event.preventDefault();

    if (!form.reportValidity()) {
      return;
    }

    setSubmitting(true);

    showResult({
      type: "pending",
      title: "Request läuft",
      text: "Der Review wird an den Worker gesendet."
    });

    try {
      const response =
        await window.VesselApi.reviewSubmission({
          workerUrl: workerUrlInput.value,
          apiKey: apiKeyInput.value,
          submissionId:
            submissionIdInput.value.trim(),
          decision: decisionSelect.value,
          vesselId:
            vesselIdInput.value.trim(),
          notes:
            notesInput.value.trim()
        });

      showResult({
        type: "success",
        title: "Review erfolgreich gespeichert",
        text: `Der Worker antwortete mit HTTP ${response.status}.`,
        data: response.data
      });
    } catch (error) {
      const statusText =
        Number.isInteger(error.status)
          ? `HTTP ${error.status}`
          : "Verbindungsfehler";

      showResult({
        type: "error",
        title: statusText,
        text:
          error instanceof Error
            ? error.message
            : String(error),
        data:
          error.data !== undefined
            ? error.data
            : {
                mögliche_ursachen: [
                  "Die Worker-URL ist nicht korrekt.",
                  "Der Worker ist nicht erreichbar.",
                  "Der Browserzugriff wird durch CORS blockiert."
                ]
              }
      });
    } finally {
      setSubmitting(false);
    }
  });

  updateDecisionFields();
});