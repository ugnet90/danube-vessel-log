"use strict";

(function () {
  function normalizeWorkerUrl(workerUrl) {
    if (typeof workerUrl !== "string") {
      return "";
    }

    return workerUrl.trim().replace(/\/+$/, "");
  }

  async function parseResponse(response) {
    const responseText = await response.text();

    if (!responseText) {
      return null;
    }

    try {
      return JSON.parse(responseText);
    } catch {
      return responseText;
    }
  }

  async function request({
    workerUrl,
    path,
    method = "GET",
    apiKey = "",
    body
  }) {
    const normalizedWorkerUrl =
      normalizeWorkerUrl(workerUrl);

    if (!normalizedWorkerUrl) {
      throw new Error("Die Worker-URL fehlt.");
    }

    const normalizedPath =
      path.startsWith("/")
        ? path
        : `/${path}`;

    const headers = {
      Accept: "application/json"
    };

    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
    }

    const normalizedApiKey =
      typeof apiKey === "string"
        ? apiKey.trim()
        : "";

    if (normalizedApiKey) {
      headers["X-API-Key"] = normalizedApiKey;
    }

    const response = await fetch(
      `${normalizedWorkerUrl}${normalizedPath}`,
      {
        method,
        headers,
        body:
          body === undefined
            ? undefined
            : JSON.stringify(body)
      }
    );

    const data = await parseResponse(response);

    if (!response.ok) {
      const message =
        data &&
        typeof data === "object" &&
        typeof data.error === "string"
          ? data.error
          : `HTTP-Fehler ${response.status}`;

      const error = new Error(message);

      error.status = response.status;
      error.data = data;

      throw error;
    }

    return {
      status: response.status,
      data
    };
  }

  async function getVessel({
    workerUrl,
    apiKey = "",
    vesselId
  }) {
    const normalizedVesselId =
      typeof vesselId === "string"
        ? vesselId.trim()
        : "";

    if (!/^VES-\d{6}$/.test(normalizedVesselId)) {
      throw new Error(
        "Die Vessel-ID muss dem Format VES-000000 entsprechen."
      );
    }

    return request({
      workerUrl,
      path:
        `/vessel?vessel_id=` +
        encodeURIComponent(normalizedVesselId),
      apiKey
    });
  }

  async function reviewSubmission({
    workerUrl,
    apiKey = "",
    submissionId,
    decision,
    vesselId = "",
    notes = ""
  }) {
    const payload = {
      submission_id: submissionId,
      decision,
      notes
    };

    if (decision === "corrected") {
      payload.vessel_id = vesselId;
    }

    return request({
      workerUrl,
      path: "/submission-review",
      method: "POST",
      apiKey,
      body: payload
    });
  }

  window.VesselApi = {
    request,
    getVessel,
    reviewSubmission
  };
})();
