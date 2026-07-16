const API_VERSION = "2022-11-28";
const MAX_PHOTO_BYTES = 8 * 1024 * 1024; // 8 MB
const BRANCH = "main";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/") {
      return jsonResponse({
        ok: true,
        service: "danube-vessel-api",
        message: "Worker ist erreichbar."
      });
    }

    if (request.method === "POST" && url.pathname === "/submission") {
      return createJsonSubmission(request, env);
    }

    if (
      request.method === "POST" &&
      url.pathname === "/submission-photo"
    ) {
      return createPhotoSubmission(request, env);
    }

    return jsonResponse(
      {
        ok: false,
        error: "Endpunkt nicht gefunden."
      },
      404
    );
  }
};

/**
 * Bisheriger Endpunkt für reine JSON-Submissions.
 */
async function createJsonSubmission(request, env) {
  const authError = checkUploadKey(request, env);
  if (authError) return authError;

  let input;

  try {
    input = await request.json();
  } catch {
    return jsonResponse(
      {
        ok: false,
        error: "Der Anfrageinhalt ist kein gültiges JSON."
      },
      400
    );
  }

  const validationError = validateMetadata(input);
  if (validationError) {
    return jsonResponse({ ok: false, error: validationError }, 400);
  }

  const uploadedAt = new Date();
  const capturedAt = new Date(input.captured_at);
  const submissionId = createSubmissionId(uploadedAt);

  const submission = buildSubmission({
    submissionId,
    uploadedAt,
    capturedAt,
    input,
    photos: []
  });

  const path = createSubmissionPath(capturedAt, submissionId);

  const result = await createGitHubFile({
    env,
    path,
    content: JSON.stringify(submission, null, 2) + "\n",
    message: `Neue Schiffssichtung ${submissionId}`
  });

  if (!result.ok) {
    return githubErrorResponse(result);
  }

  return jsonResponse(
    {
      ok: true,
      message: "Submission wurde gespeichert.",
      submission_id: submissionId,
      path
    },
    201
  );
}

/**
 * Neuer Endpunkt:
 * ein JPEG plus Metadaten in einer multipart/form-data-Anfrage.
 */
async function createPhotoSubmission(request, env) {
  const authError = checkUploadKey(request, env);
  if (authError) return authError;

  const contentType = request.headers.get("Content-Type") ?? "";

  if (!contentType.toLowerCase().includes("multipart/form-data")) {
    return jsonResponse(
      {
        ok: false,
        error: "Content-Type muss multipart/form-data sein."
      },
      415
    );
  }

  let form;

  try {
    form = await request.formData();
  } catch {
    return jsonResponse(
      {
        ok: false,
        error: "Die Formulardaten konnten nicht gelesen werden."
      },
      400
    );
  }

  const metadataRaw = form.get("metadata");
  const photo = form.get("photo");

  if (typeof metadataRaw !== "string") {
    return jsonResponse(
      {
        ok: false,
        error: "Das Formularfeld metadata fehlt."
      },
      400
    );
  }

  if (!(photo instanceof File)) {
    return jsonResponse(
      {
        ok: false,
        error: "Das Formularfeld photo fehlt oder ist keine Datei."
      },
      400
    );
  }

  let input;

  try {
    input = JSON.parse(metadataRaw);
  } catch {
    return jsonResponse(
      {
        ok: false,
        error: "metadata enthält kein gültiges JSON."
      },
      400
    );
  }

  const validationError = validateMetadata(input);
  if (validationError) {
    return jsonResponse({ ok: false, error: validationError }, 400);
  }

  if (
    photo.type !== "image/jpeg" &&
    photo.type !== "image/jpg"
  ) {
    return jsonResponse(
      {
        ok: false,
        error: `Nur JPEG ist erlaubt; empfangen wurde ${photo.type || "unbekannt"}.`
      },
      415
    );
  }

  if (photo.size < 1) {
    return jsonResponse(
      {
        ok: false,
        error: "Die Bilddatei ist leer."
      },
      400
    );
  }

  if (photo.size > MAX_PHOTO_BYTES) {
    return jsonResponse(
      {
        ok: false,
        error: "Das Foto ist größer als 8 MB.",
        size_bytes: photo.size
      },
      413
    );
  }

  const uploadedAt = new Date();
  const capturedAt = new Date(input.captured_at);

  const submissionId = createSubmissionId(uploadedAt);
  const photoId = createPhotoId();

  const photoPath = `photos/${photoId}.jpg`;
  const submissionPath =
    createSubmissionPath(capturedAt, submissionId);

  const photoBytes = await photo.arrayBuffer();

  const photoRecord = {
    photo_id: photoId,
    path: photoPath,
    filename: `${photoId}.jpg`,
    original_filename:
      typeof input.original_filename === "string"
        ? input.original_filename
        : photo.name || "",
    mime_type: "image/jpeg",
    size_bytes: photoBytes.byteLength
  };

  const submission = buildSubmission({
    submissionId,
    uploadedAt,
    capturedAt,
    input,
    photos: [photoRecord]
  });

  const commitResult = await createAtomicGitHubCommit({
    env,
    message: `Neue Schiffssichtung ${submissionId}`,
    files: [
      {
        path: photoPath,
        content: arrayBufferToBase64(photoBytes),
        encoding: "base64"
      },
      {
        path: submissionPath,
        content: JSON.stringify(submission, null, 2) + "\n",
        encoding: "utf-8"
      }
    ]
  });

  if (!commitResult.ok) {
    return jsonResponse(
      {
        ok: false,
        error: "Foto und Submission konnten nicht gespeichert werden.",
        github_step: commitResult.step,
        github_status: commitResult.status,
        github_response: commitResult.body
      },
      502
    );
  }

  return jsonResponse(
    {
      ok: true,
      message: "Foto und Submission wurden gespeichert.",
      submission_id: submissionId,
      submission_path: submissionPath,
      photo_id: photoId,
      photo_path: photoPath,
      commit_sha: commitResult.commitSha
    },
    201
  );
}

function buildSubmission({
  submissionId,
  uploadedAt,
  capturedAt,
  input,
  photos
}) {
  return {
    schema_version: 1,
    submission_id: submissionId,
    uploaded_at: uploadedAt.toISOString(),
    captured_at: capturedAt.toISOString(),
    location_id: input.location_id,
    movement: input.movement ?? "unknown",
    direction: input.direction ?? "unknown",
    vessel_name_entered:
      typeof input.vessel_name_entered === "string"
        ? input.vessel_name_entered
        : "",
    notes:
      typeof input.notes === "string"
        ? input.notes
        : "",
    photos,
    workflow: {
      status: "new",
      vessel_id: "",
      review_notes: ""
    }
  };
}

function validateMetadata(input) {
  if (!input || typeof input !== "object") {
    return "Die Metadaten fehlen.";
  }

  if (
    typeof input.captured_at !== "string" ||
    Number.isNaN(Date.parse(input.captured_at))
  ) {
    return "captured_at fehlt oder ist ungültig.";
  }

  if (
    typeof input.location_id !== "string" ||
    !/^LOC-\d{3,}$/.test(input.location_id)
  ) {
    return "location_id fehlt oder ist ungültig.";
  }

  const allowedMovements = ["moving", "moored", "unknown"];
  const movement = input.movement ?? "unknown";

  if (!allowedMovements.includes(movement)) {
    return "movement ist ungültig.";
  }

  const allowedDirections = [
    "upstream",
    "downstream",
    "unknown"
  ];
  const direction = input.direction ?? "unknown";

  if (!allowedDirections.includes(direction)) {
    return "direction ist ungültig.";
  }

  if (
    input.notes !== undefined &&
    typeof input.notes !== "string"
  ) {
    return "notes muss Text sein.";
  }

  return null;
}

function checkUploadKey(request, env) {
  const suppliedKey = request.headers.get("X-Upload-Key");

  if (!suppliedKey || suppliedKey !== env.UPLOAD_KEY) {
    return jsonResponse(
      {
        ok: false,
        error: "Nicht autorisiert."
      },
      401
    );
  }

  return null;
}

function createSubmissionId(date) {
  const timestamp =
    date.getUTCFullYear().toString() +
    String(date.getUTCMonth() + 1).padStart(2, "0") +
    String(date.getUTCDate()).padStart(2, "0") +
    "-" +
    String(date.getUTCHours()).padStart(2, "0") +
    String(date.getUTCMinutes()).padStart(2, "0") +
    String(date.getUTCSeconds()).padStart(2, "0");

  const randomPart = crypto.randomUUID()
    .replaceAll("-", "")
    .slice(0, 6)
    .toUpperCase();

  return `SUB-${timestamp}-${randomPart}`;
}

function createPhotoId() {
  const randomPart = crypto.randomUUID()
    .replaceAll("-", "")
    .toUpperCase();

  return `PHOTO-${randomPart}`;
}

function createSubmissionPath(capturedAt, submissionId) {
  const year = String(capturedAt.getUTCFullYear());
  const month = String(
    capturedAt.getUTCMonth() + 1
  ).padStart(2, "0");

  return `inbox/submissions/${year}/${month}/${submissionId}.json`;
}

/**
 * Erzeugt mehrere Dateien atomar in einem Git-Commit.
 */
async function createAtomicGitHubCommit({
  env,
  message,
  files
}) {
  const baseUrl =
    `https://api.github.com/repos/` +
    `${env.GITHUB_OWNER}/${env.GITHUB_REPO}`;

  const headers = githubHeaders(env);

  // 1. Aktuellen Branch-Stand lesen
  const refResult = await githubRequest(
    `${baseUrl}/git/ref/heads/${BRANCH}`,
    { method: "GET", headers }
  );

  if (!refResult.ok) {
    return {
      ...refResult,
      step: "get_ref"
    };
  }

  const parentCommitSha = refResult.body.object?.sha;

  if (!parentCommitSha) {
    return {
      ok: false,
      step: "get_ref",
      status: 502,
      body: "GitHub lieferte keinen Commit-SHA."
    };
  }

  // 2. Basis-Tree des aktuellen Commits lesen
  const commitResult = await githubRequest(
    `${baseUrl}/git/commits/${parentCommitSha}`,
    { method: "GET", headers }
  );

  if (!commitResult.ok) {
    return {
      ...commitResult,
      step: "get_parent_commit"
    };
  }

  const baseTreeSha = commitResult.body.tree?.sha;

  if (!baseTreeSha) {
    return {
      ok: false,
      step: "get_parent_commit",
      status: 502,
      body: "GitHub lieferte keinen Tree-SHA."
    };
  }

  // 3. Für jede Datei einen Blob erzeugen
  const treeEntries = [];

  for (const file of files) {
    const blobResult = await githubRequest(
      `${baseUrl}/git/blobs`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          content: file.content,
          encoding: file.encoding
        })
      }
    );

    if (!blobResult.ok) {
      return {
        ...blobResult,
        step: `create_blob:${file.path}`
      };
    }

    treeEntries.push({
      path: file.path,
      mode: "100644",
      type: "blob",
      sha: blobResult.body.sha
    });
  }

  // 4. Neuen Tree erzeugen
  const treeResult = await githubRequest(
    `${baseUrl}/git/trees`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        base_tree: baseTreeSha,
        tree: treeEntries
      })
    }
  );

  if (!treeResult.ok) {
    return {
      ...treeResult,
      step: "create_tree"
    };
  }

  // 5. Commit erzeugen
  const newCommitResult = await githubRequest(
    `${baseUrl}/git/commits`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        message,
        tree: treeResult.body.sha,
        parents: [parentCommitSha]
      })
    }
  );

  if (!newCommitResult.ok) {
    return {
      ...newCommitResult,
      step: "create_commit"
    };
  }

  const newCommitSha = newCommitResult.body.sha;

  // 6. Branch auf den neuen Commit setzen
  const updateRefResult = await githubRequest(
    `${baseUrl}/git/refs/heads/${BRANCH}`,
    {
      method: "PATCH",
      headers,
      body: JSON.stringify({
        sha: newCommitSha,
        force: false
      })
    }
  );

  if (!updateRefResult.ok) {
    return {
      ...updateRefResult,
      step: "update_ref"
    };
  }

  return {
    ok: true,
    commitSha: newCommitSha
  };
}

async function createGitHubFile({
  env,
  path,
  content,
  message
}) {
  const url =
    `https://api.github.com/repos/` +
    `${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${path}`;

  return githubRequest(url, {
    method: "PUT",
    headers: githubHeaders(env),
    body: JSON.stringify({
      message,
      content: encodeBase64Utf8(content)
    })
  });
}

async function githubRequest(url, options) {
  const response = await fetch(url, options);

  let body;

  try {
    body = await response.json();
  } catch {
    body = await response.text();
  }

  return {
    ok: response.ok,
    status: response.status,
    body
  };
}

function githubHeaders(env) {
  return {
    Authorization: `Bearer ${env.GITHUB_TOKEN}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": API_VERSION,
    "User-Agent": "danube-vessel-api",
    "Content-Type": "application/json"
  };
}

function encodeBase64Utf8(value) {
  const bytes = new TextEncoder().encode(value);
  return arrayBufferToBase64(bytes.buffer);
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";

  const chunkSize = 0x8000;

  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(
      offset,
      Math.min(offset + chunkSize, bytes.length)
    );

    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

function githubErrorResponse(result) {
  return jsonResponse(
    {
      ok: false,
      error: "GitHub hat die Datei nicht gespeichert.",
      github_status: result.status,
      github_response: result.body
    },
    502
  );
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}
