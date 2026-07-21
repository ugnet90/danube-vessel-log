const API_VERSION = "2022-11-28";
const MAX_PHOTO_BYTES = 8 * 1024 * 1024; // 8 MB
const MAX_PHOTOS_PER_SUBMISSION = 10;
const BRANCH = "main";
const LOCATIONS_PATH = "data/locations.csv";
const VESSELS_PATH = "data/vessels.csv";

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders()
      });
    }
    
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

    if (
      request.method === "GET" &&
      url.pathname === "/review-submissions"
    ) {
      try {
        return await handleReviewSubmissionsList(request, env);
      } catch (error) {
        return jsonResponse({
          ok: false,
          error: "Unbehandelter Fehler beim Laden der Review-Liste.",
          exception:
            error instanceof Error
              ? error.message
              : String(error)
        }, 500);
      }
    }
    
    if (
      request.method === "POST" &&
      url.pathname === "/submission-review"
    ) {
      try {
        return await handleSubmissionReview(request, env);
      } catch (error) {
        return jsonResponse({
          ok: false,
          error: "Unbehandelter Fehler im Submission-Review.",
          exception:
            error instanceof Error
              ? error.message
              : String(error),
          stack:
            error instanceof Error
              ? error.stack
              : null
        }, 500);
      }
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
  
  const locationResult = await resolveLocation(input, env);
  
  if (!locationResult.ok) {
    return jsonResponse(
      {
        ok: false,
        error: locationResult.error
      },
      502
    );
  }
  
  input.location_id = locationResult.location?.location_id ?? "";

  input.location_name =
  locationResult.location?.public_name ??
  locationResult.location?.name ??
  "";
  
  input.location_municipality =
    locationResult.location?.municipality ?? "";
  
  input.location_country =
    locationResult.location?.country ?? "";

  input.location_status =
    locationResult.location ? "matched" : "unknown";
  
  input.location_matched_by =
    locationResult.matched_by ?? "";  

  const vesselMatchResult = await resolveVessel(input, env);
  
  if (!vesselMatchResult.ok) {
    return jsonResponse(
      {
        ok: false,
        error: vesselMatchResult.error
      },
      502
    );
  }
  
  input.vessel_match = vesselMatchResult.match;
  
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
/**
 * Speichert ein oder mehrere JPEG-Fotos zusammen mit den Metadaten
 * als eine gemeinsame Submission.
 *
 * Im Multipart-Formular können mehrere Felder mit dem Namen
 * "photo" enthalten sein.
 */
async function createPhotoSubmission(request, env) {
  const authError = checkUploadKey(request, env);
  if (authError) return authError;

  const contentType =
    request.headers.get("Content-Type") ?? "";

  if (
    !contentType
      .toLowerCase()
      .includes("multipart/form-data")
  ) {
    return jsonResponse(
      {
        ok: false,
        error:
          "Content-Type muss multipart/form-data sein."
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
        error:
          "Die Formulardaten konnten nicht gelesen werden."
      },
      400
    );
  }

  const metadataRaw = form.get("metadata");

  const photoEntries = [
    ...form.getAll("photo"),
    ...form.getAll("photos")
  ];
  
  const photos = photoEntries.filter(
    value => value instanceof File
  );
  
  return jsonResponse(
    {
      ok: true,
  
      metadata_type: typeof metadataRaw,
      metadata_value: metadataRaw,
  
      photo_entries: photoEntries.length,
      photo_files: photos.length,
  
      form_keys: [...form.keys()]
    },
    200
  );

  if (typeof metadataRaw !== "string") {
    return jsonResponse(
      {
        ok: false,
        error: "Das Formularfeld metadata fehlt."
      },
      400
    );
  }

  if (photos.length === 0) {
    return jsonResponse(
      {
        ok: false,
        error:
          "Es wurde keine gültige Bilddatei in den Formularfeldern photo oder photos übermittelt."
      },
      400
    );
  }
  
  if (photos.length > MAX_PHOTOS_PER_SUBMISSION) {
    return jsonResponse(
      {
        ok: false,
        error:
          `Pro Submission sind höchstens ` +
          `${MAX_PHOTOS_PER_SUBMISSION} Fotos erlaubt.`,
        photo_count: photos.length
      },
      413
    );
  }

  let input;

  try {
    input = JSON.parse(metadataRaw);
  } catch {
    return jsonResponse(
      {
        ok: false,
        error:
          "metadata enthält kein gültiges JSON."
      },
      400
    );
  }

  const validationError = validateMetadata(input);

  if (validationError) {
    return jsonResponse(
      {
        ok: false,
        error: validationError
      },
      400
    );
  }

  /*
   * Alle Fotos prüfen, bevor GitHub-Dateien erzeugt werden.
   */
  for (let index = 0; index < photos.length; index += 1) {
    const photo = photos[index];
    const photoNumber = index + 1;

    if (
      photo.type !== "image/jpeg" &&
      photo.type !== "image/jpg"
    ) {
      return jsonResponse(
        {
          ok: false,
          error:
            `Foto ${photoNumber}: Nur JPEG ist erlaubt; ` +
            `empfangen wurde ${photo.type || "unbekannt"}.`
        },
        415
      );
    }

    if (photo.size < 1) {
      return jsonResponse(
        {
          ok: false,
          error:
            `Foto ${photoNumber}: Die Bilddatei ist leer.`
        },
        400
      );
    }

    if (photo.size > MAX_PHOTO_BYTES) {
      return jsonResponse(
        {
          ok: false,
          error:
            `Foto ${photoNumber} ist größer als 8 MB.`,
          photo_number: photoNumber,
          size_bytes: photo.size
        },
        413
      );
    }
  }

  const uploadedAt = new Date();
  const capturedAt = new Date(input.captured_at);

  const locationResult =
    await resolveLocation(input, env);

  if (!locationResult.ok) {
    return jsonResponse(
      {
        ok: false,
        error: locationResult.error
      },
      502
    );
  }

  input.location_id =
    locationResult.location?.location_id ?? "";

  input.location_name =
    locationResult.location?.public_name ??
    locationResult.location?.name ??
    "";

  input.location_municipality =
    locationResult.location?.municipality ?? "";

  input.location_country =
    locationResult.location?.country ?? "";

  input.location_status =
    locationResult.location
      ? "matched"
      : "unknown";

  input.location_matched_by =
    locationResult.matched_by ?? "";

  const vesselMatchResult =
    await resolveVessel(input, env);

  if (!vesselMatchResult.ok) {
    return jsonResponse(
      {
        ok: false,
        error: vesselMatchResult.error
      },
      502
    );
  }

  input.vessel_match = vesselMatchResult.match;

  const submissionId =
    createSubmissionId(uploadedAt);

  const year =
    String(capturedAt.getUTCFullYear());

  const month =
    String(capturedAt.getUTCMonth() + 1)
      .padStart(2, "0");

  const submissionPath =
    createSubmissionPath(
      capturedAt,
      submissionId
    );

  const photoRecords = [];
  const commitFiles = [];

  const originalFilenames =
    Array.isArray(input.original_filenames)
      ? input.original_filenames
      : [];

  /*
   * Für jedes Foto:
   * - eigene Photo-ID
   * - eigener GitHub-Pfad
   * - eigener Datensatz in submission.photos
   * - eigener Blob im atomaren Commit
   */
  for (let index = 0; index < photos.length; index += 1) {
    const photo = photos[index];
    const photoId = createPhotoId();

    const photoPath =
      `inbox/photos/${year}/${month}/${photoId}.jpg`;

    const photoBytes =
      await photo.arrayBuffer();

    const suppliedOriginalFilename =
      typeof originalFilenames[index] === "string"
        ? originalFilenames[index].trim()
        : "";

    const legacyOriginalFilename =
      photos.length === 1 &&
      typeof input.original_filename === "string"
        ? input.original_filename.trim()
        : "";

    const originalFilename =
      suppliedOriginalFilename ||
      legacyOriginalFilename ||
      photo.name ||
      "";

    photoRecords.push({
      photo_id: photoId,
      path: photoPath,
      filename: `${photoId}.jpg`,
      original_filename: originalFilename,
      mime_type: "image/jpeg",
      size_bytes: photoBytes.byteLength,
      sequence: index + 1
    });

    commitFiles.push({
      path: photoPath,
      content: arrayBufferToBase64(photoBytes),
      encoding: "base64"
    });
  }

  const submission = buildSubmission({
    submissionId,
    uploadedAt,
    capturedAt,
    input,
    photos: photoRecords
  });

  commitFiles.push({
    path: submissionPath,
    content:
      JSON.stringify(submission, null, 2) + "\n",
    encoding: "utf-8"
  });

  const photoLabel =
    photoRecords.length === 1
      ? "1 Foto"
      : `${photoRecords.length} Fotos`;
  
  const commitResult =
    await createAtomicGitHubCommit({
      env,
      message:
        `Neue Schiffssichtung ${submissionId} mit ${photoLabel}`,
      files: commitFiles
    });

  if (!commitResult.ok) {
    return jsonResponse(
      {
        ok: false,
        error:
          "Fotos und Submission konnten nicht gespeichert werden.",
        github_step: commitResult.step,
        github_status: commitResult.status,
        github_response: commitResult.body
      },
      502
    );
  }

  /*
   * photo_id und photo_path bleiben für bestehende Clients erhalten.
   * Sie enthalten das jeweils erste Foto.
   */
  return jsonResponse(
    {
      ok: true,
      message:
        photoRecords.length === 1
          ? "Foto und Submission wurden gespeichert."
          : `${photoRecords.length} Fotos und Submission wurden gespeichert.`,

      submission_id: submissionId,
      submission_path: submissionPath,
      
      photo_count: photoRecords.length,
      
      received_photo_entries: photoEntries.length,
      received_photo_files: photos.length,
      
      photo_id:
        photoRecords[0]?.photo_id ?? "",
        
      photo_path:
        photoRecords[0]?.path ?? "",

      photos: photoRecords.map(photo => ({
        photo_id: photo.photo_id,
        photo_path: photo.path,
        original_filename:
          photo.original_filename,
        size_bytes: photo.size_bytes,
        sequence: photo.sequence
      })),

      commit_sha: commitResult.commitSha
    },
    201
  );
}

async function handleReviewSubmissionsList(request, env) {
  const url = new URL(request.url);

  const requestedStatus =
    typeof url.searchParams.get("status") === "string"
      ? url.searchParams.get("status").trim()
      : "new";

  const allowedStatuses = [
    "new",
    "reviewed",
    "rejected",
    "all"
  ];

  if (!allowedStatuses.includes(requestedStatus)) {
    return jsonResponse({
      ok: false,
      error: "Ungültiger Statusfilter."
    }, 400);
  }

  const requestedLimit = Number(
    url.searchParams.get("limit") ?? 50
  );

  const limit = Number.isInteger(requestedLimit)
    ? Math.min(Math.max(requestedLimit, 1), 100)
    : 50;

  const pathsResult = await listSubmissionPaths(env);

  if (!pathsResult.ok) {
    return jsonResponse({
      ok: false,
      error: pathsResult.error,
      github_status: pathsResult.status ?? null,
      github_response: pathsResult.body ?? null
    }, 502);
  }

  /*
   * Die Submission-ID enthält Datum und Uhrzeit.
   * Eine absteigende Pfadsortierung ergibt daher:
   * neueste Sichtungen zuerst.
   */
  const candidatePaths = pathsResult.paths
    .sort((a, b) => b.localeCompare(a))
    .slice(0, limit);

  const loadedFiles = await Promise.all(
    candidatePaths.map(path =>
      readGitHubFile({
        env,
        path
      })
    )
  );

  const submissions = [];

  for (const file of loadedFiles) {
    if (!file.ok) {
      continue;
    }

    let submission;

    try {
      submission = JSON.parse(
        String(file.content ?? "").replace(/^\uFEFF/, "")
      );
    } catch {
      continue;
    }

    const workflowStatus =
      submission.workflow?.status ?? "new";

    if (
      requestedStatus !== "all" &&
      workflowStatus !== requestedStatus
    ) {
      continue;
    }

    const photoRecords =
      Array.isArray(submission.photos)
        ? submission.photos
            .filter(photo =>
              photo &&
              typeof photo.path === "string" &&
              photo.path.trim() !== ""
            )
            .map((photo, index) => ({
              photo_id:
                typeof photo.photo_id === "string"
                  ? photo.photo_id
                  : "",
    
              path: photo.path,
    
              url:
                buildRawGitHubUrl(
                  env,
                  photo.path
                ),
    
              original_filename:
                typeof photo.original_filename === "string"
                  ? photo.original_filename
                  : "",
    
              size_bytes:
                Number.isFinite(photo.size_bytes)
                  ? photo.size_bytes
                  : null,
    
              sequence:
                Number.isInteger(photo.sequence)
                  ? photo.sequence
                  : index + 1
            }))
        : [];
    
    const firstPhoto =
      photoRecords[0] ?? null;

    submissions.push({
      submission_id:
        submission.submission_id ?? "",

      captured_at:
        submission.captured_at ?? "",

      uploaded_at:
        submission.uploaded_at ?? "",

      workflow_status:
        workflowStatus,

      location: {
        id:
          submission.location?.id ?? "",

        name:
          submission.location?.name ?? "",

        municipality:
          submission.location?.municipality ?? "",

        country:
          submission.location?.country ?? ""
      },

      movement:
        submission.movement ?? "unknown",

      direction:
        submission.direction ?? "unknown",

      vessel_name_entered:
        submission.vessel_name_entered ?? "",

      automatic_match: {
        status:
          submission.workflow?.auto?.vessel_match?.status ??
          "unmatched",

        vessel_id:
          submission.workflow?.auto?.vessel_match?.vessel_id ??
          "",

        matched_by:
          submission.workflow?.auto?.vessel_match?.matched_by ??
          "",

        matched_value:
          submission.workflow?.auto?.vessel_match?.matched_value ??
          "",

        candidate_count:
          submission.workflow?.auto?.vessel_match?.candidate_count ??
          0,

        candidate_ids:
          Array.isArray(
            submission.workflow?.auto?.vessel_match?.candidate_ids
          )
            ? submission.workflow.auto.vessel_match.candidate_ids
            : []
      },

      review:
        submission.workflow?.review ?? {
          reviewed: false,
          reviewed_at: "",
          vessel_id: "",
          decision: "",
          notes: ""
        },

      photo_count:
        photoRecords.length,
      
      photos:
        photoRecords,
      
      /*
       * Die bisherigen Felder bleiben vorläufig erhalten,
       * damit bestehende Testseiten kompatibel bleiben.
       */
      photo_path:
        firstPhoto?.path ?? "",
      
      photo_url:
        firstPhoto?.url ?? "",

      submission_path:
        file.path
    });
  }

  return jsonResponse({
    ok: true,
    status_filter: requestedStatus,
    count: submissions.length,
    submissions
  });
}

async function listSubmissionPaths(env) {
  const baseUrl =
    `https://api.github.com/repos/` +
    `${env.GITHUB_OWNER}/${env.GITHUB_REPO}`;

  const branchResult = await githubRequest(
    `${baseUrl}/git/ref/heads/${BRANCH}`,
    {
      method: "GET",
      headers: githubHeaders(env)
    }
  );

  if (!branchResult.ok) {
    return {
      ...branchResult,
      error:
        "Der aktuelle GitHub-Branch konnte nicht gelesen werden."
    };
  }

  const commitSha =
    branchResult.body?.object?.sha ?? "";

  if (!commitSha) {
    return {
      ok: false,
      status: 502,
      error: "GitHub lieferte keinen Commit-SHA."
    };
  }

  const treeResult = await githubRequest(
    `${baseUrl}/git/trees/${commitSha}?recursive=1`,
    {
      method: "GET",
      headers: githubHeaders(env)
    }
  );

  if (!treeResult.ok) {
    return {
      ...treeResult,
      error:
        "Der GitHub-Dateibaum konnte nicht gelesen werden."
    };
  }

  const tree = Array.isArray(treeResult.body?.tree)
    ? treeResult.body.tree
    : [];

  const paths = tree
    .filter(entry =>
      entry?.type === "blob" &&
      typeof entry.path === "string" &&
      /^inbox\/submissions\/\d{4}\/\d{2}\/SUB-[A-Z0-9-]+\.json$/i
        .test(entry.path)
    )
    .map(entry => entry.path);

  return {
    ok: true,
    paths
  };
}

function buildRawGitHubUrl(env, path) {
  const encodedPath = String(path)
    .split("/")
    .map(part => encodeURIComponent(part))
    .join("/");

  return (
    `https://raw.githubusercontent.com/` +
    `${encodeURIComponent(env.GITHUB_OWNER)}/` +
    `${encodeURIComponent(env.GITHUB_REPO)}/` +
    `${encodeURIComponent(BRANCH)}/` +
    encodedPath
  );
}

async function handleSubmissionReview(request, env) {

    let input;

    try {
        input = await request.json();
    } catch {
        return jsonResponse({
            ok: false,
            error: "Ungültiges JSON."
        }, 400);
    }

    const submissionId =
        typeof input.submission_id === "string"
            ? input.submission_id.trim()
            : "";

    const path = buildSubmissionPath(submissionId);

    if (!path) {
        return jsonResponse({
            ok: false,
            error: "Ungültige submission_id."
        }, 400);
    }

    const file = await readGitHubFile({
        env,
        path
    });

    if (!file.ok) {
        return jsonResponse(file, file.status ?? 500);
    }

    let submission;
    
    try {
      const normalizedContent =
        String(file.content ?? "").replace(/^\uFEFF/, "");
    
      submission = JSON.parse(normalizedContent);
    } catch (error) {
      return jsonResponse({
        ok: false,
        error: "Submission enthält ungültiges JSON.",
        parse_error:
          error instanceof Error
            ? error.message
            : String(error),
        content_length: String(file.content ?? "").length,
        content_start: String(file.content ?? "").slice(0, 300),
        content_end: String(file.content ?? "").slice(-100)
      }, 500);
    }

    const review = validateReviewInput(input, submission);
    
    if (!review.ok) {
        return jsonResponse(review, 400);
    }
    
    applyReview(submission, input, review);

    const update = await updateGitHubFile({
        env,
        path,
        content: JSON.stringify(submission, null, 2),
        sha: file.sha,
        message: `Review ${submissionId}: ${review.decision}`
    });

    if (!update.ok) {
        return jsonResponse(update, update.status ?? 500);
    }

    return jsonResponse({
      ok: true,
      submission_id: submissionId,
      decision: review.decision,
      path,
      commit: update.commit_sha ?? null
    });

}

function buildSubmission({
  submissionId,
  uploadedAt,
  capturedAt,
  input,
  photos
}) {
  return {
    schema_version: 10,
    submission_id: submissionId,
    uploaded_at: uploadedAt.toISOString(),
    captured_at: capturedAt.toISOString(),
    location: {
      status:
        input.location_status === "matched"
          ? "matched"
          : "unknown",
    
      matched_by:
        typeof input.location_matched_by === "string"
          ? input.location_matched_by
          : "",
    
      id:
        typeof input.location_id === "string"
          ? input.location_id
          : "",
    
      name:
        typeof input.location_name === "string"
          ? input.location_name
          : "",
    
      municipality:
        typeof input.location_municipality === "string"
          ? input.location_municipality
          : "",
    
      country:
        typeof input.location_country === "string"
          ? input.location_country
          : ""
    },
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
    
    photo_lat: parseCoordinate(input.photo_lat),
    
    photo_lon: parseCoordinate(input.photo_lon),
    
    photos,
    
    workflow: {
      status: "new",
    
      auto: {
        vessel_match: {
          status:
            input.vessel_match?.status ?? "unmatched",
    
          vessel_id:
            input.vessel_match?.vessel_id ?? "",
    
          matched_by:
            input.vessel_match?.matched_by ?? "",
    
          candidate_count:
            input.vessel_match?.candidate_count ?? 0,
          
          candidate_ids:
            Array.isArray(input.vessel_match?.candidate_ids)
              ? input.vessel_match.candidate_ids
              : [],
          
          matched_value:
            input.vessel_match?.matched_value ?? "",
          
          normalized_input:
            input.vessel_match?.normalized_input ?? ""
        }
      },
    
      review: {
        reviewed: false,
        reviewed_at: "",
        vessel_id: "",
        decision: "",
        notes: ""
      }
    }
  };
}

function validateReviewInput(input, submission) {
  const decision =
    typeof input.decision === "string"
      ? input.decision.trim()
      : "";

  const vesselId =
    typeof input.vessel_id === "string"
      ? input.vessel_id.trim()
      : "";

  const allowedDecisions = [
    "confirmed",
    "corrected",
    "rejected"
  ];

  if (!allowedDecisions.includes(decision)) {
    return {
      ok: false,
      error: "Ungültige Review-Entscheidung."
    };
  }

  if (decision === "confirmed") {
    const automaticVesselId =
      submission.workflow?.auto?.vessel_match?.vessel_id ?? "";

    if (!automaticVesselId) {
      return {
        ok: false,
        error:
          "Eine automatische Zuordnung kann nicht bestätigt werden, weil kein eindeutiger Treffer vorliegt."
      };
    }

    if (vesselId && vesselId !== automaticVesselId) {
      return {
        ok: false,
        error:
          "Bei confirmed muss die automatische vessel_id verwendet werden."
      };
    }

    return {
      ok: true,
      decision,
      vessel_id: automaticVesselId
    };
  }

  if (decision === "corrected") {
    if (!/^VES-\d{6}$/.test(vesselId)) {
      return {
        ok: false,
        error:
          "Bei corrected ist eine gültige vessel_id erforderlich."
      };
    }

    return {
      ok: true,
      decision,
      vessel_id: vesselId
    };
  }

  return {
    ok: true,
    decision,
    vessel_id: ""
  };
}

function applyReview(submission, input, validatedReview) {
  const notes =
    typeof input.notes === "string"
      ? input.notes.trim()
      : "";

  submission.workflow.status =
    validatedReview.decision === "rejected"
      ? "rejected"
      : "reviewed";
      
  // bisherigen Review archivieren
  if (submission.workflow.review?.reviewed) {
  
    if (!Array.isArray(submission.workflow.review_history)) {
      submission.workflow.review_history = [];
    }
  
    submission.workflow.review_history.push({
      reviewed_at: submission.workflow.review.reviewed_at,
      decision: submission.workflow.review.decision,
      vessel_id: submission.workflow.review.vessel_id,
      notes: submission.workflow.review.notes
    });
  
  }

  submission.workflow.review = {
    reviewed: true,
    reviewed_at: new Date().toISOString(),
    vessel_id: validatedReview.vessel_id,
    decision: validatedReview.decision,
    notes
  };

  return submission;
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

  const hasValidLocationId =
    typeof input.location_id === "string" &&
    /^LOC-\d{3,}$/.test(input.location_id);
  
  const photoLat = parseCoordinate(input.photo_lat);
  const photoLon = parseCoordinate(input.photo_lon);
  
  const hasValidCoordinates =
    photoLat !== null &&
    photoLon !== null &&
    photoLat >= -90 &&
    photoLat <= 90 &&
    photoLon >= -180 &&
    photoLon <= 180;
  
  if (!hasValidLocationId && !hasValidCoordinates) {
    return "Es fehlen eine gültige location_id oder gültige Fotokoordinaten.";
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
  
  if (
    input.photo_lat !== undefined &&
    Number.isNaN(Number(String(input.photo_lat).replace(",", ".")))
  ) {
    return "photo_lat ist ungültig.";
  }
  
  if (
    input.photo_lon !== undefined &&
    Number.isNaN(Number(String(input.photo_lon).replace(",", ".")))
  ) {
    return "photo_lon ist ungültig.";
  }

  return null;
}

async function resolveLocation(input, env) {
  const latitude = parseCoordinate(input.photo_lat);
  const longitude = parseCoordinate(input.photo_lon);

  const locationsResult = await loadLocations(env);

  if (!locationsResult.ok) {
    return locationsResult;
  }

  /*
   * Keine Fotokoordinaten vorhanden:
   * Standort über die mitgelieferte location_id bestimmen.
   */
  if (latitude === null || longitude === null) {
    const enteredLocationId =
      typeof input.location_id === "string"
        ? input.location_id.trim()
        : "";

    if (!/^LOC-\d{3,}$/.test(enteredLocationId)) {
      return {
        ok: true,
        location: null,
        matched_by: ""
      };
    }

    const locationById =
      locationsResult.locations.find(
        location => location.location_id === enteredLocationId
      ) ?? null;

    return {
      ok: true,
      location: locationById,
      matched_by: locationById ? "location_id" : ""
    };
  }

  /*
   * Koordinaten 0/0 gelten in diesem Projekt als ungültig.
   */
  if (latitude === 0 && longitude === 0) {
    return {
      ok: true,
      location: null,
      matched_by: ""
    };
  }

  let bestMatch = null;

  for (const location of locationsResult.locations) {
    const distanceM = calculateDistanceMeters(
      latitude,
      longitude,
      location.latitude,
      location.longitude
    );

    if (
      distanceM <= location.radius_m &&
      (
        bestMatch === null ||
        distanceM < bestMatch.distance_m
      )
    ) {
      bestMatch = {
        ...location,
        distance_m: Math.round(distanceM)
      };
    }
  }

  return {
    ok: true,
    location: bestMatch,
    matched_by: bestMatch ? "coordinates" : ""
  };
}

async function loadLocations(env) {
  const url =
    `https://api.github.com/repos/` +
    `${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/` +
    `${LOCATIONS_PATH}?ref=${encodeURIComponent(BRANCH)}`;

  const result = await githubRequest(url, {
    method: "GET",
    headers: githubHeaders(env)
  });

  if (!result.ok) {
    return {
      ok: false,
      error: "data/locations.csv konnte nicht aus GitHub geladen werden."
    };
  }

  if (
    typeof result.body.content !== "string" ||
    result.body.encoding !== "base64"
  ) {
    return {
      ok: false,
      error: "GitHub lieferte locations.csv nicht im erwarteten Format."
    };
  }

  let csvText;

  try {
    csvText = decodeBase64Utf8(
      result.body.content.replace(/\s/g, "")
    );
  } catch {
    return {
      ok: false,
      error: "locations.csv konnte nicht decodiert werden."
    };
  }

  try {
    return {
      ok: true,
      locations: parseLocationsCsv(csvText)
    };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "locations.csv konnte nicht verarbeitet werden."
    };
  }
}

function parseLocationsCsv(csvText) {
  const lines = csvText
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter(line => line.trim() !== "");

  if (lines.length < 2) {
    throw new Error("locations.csv enthält keine Standortdaten.");
  }

  const headers = lines[0].split(";").map(value => value.trim());

  const requiredHeaders = [
    "location_id",
    "latitude",
    "longitude",
    "radius_m"
  ];

  for (const requiredHeader of requiredHeaders) {
    if (!headers.includes(requiredHeader)) {
      throw new Error(
        `locations.csv: Spalte ${requiredHeader} fehlt.`
      );
    }
  }

  const locations = [];

  for (const line of lines.slice(1)) {
    const values = line.split(";");
    const row = {};

    headers.forEach((header, index) => {
      row[header] = (values[index] ?? "").trim();
    });

    const latitude = parseCoordinate(row.latitude);
    const longitude = parseCoordinate(row.longitude);
    const radiusM = Number(
      String(row.radius_m).replace(",", ".")
    );

    if (
      !/^LOC-\d{3,}$/.test(row.location_id) ||
      latitude === null ||
      longitude === null ||
      !Number.isFinite(radiusM) ||
      radiusM <= 0
    ) {
      continue;
    }

    locations.push({
      ...row,
      latitude,
      longitude,
      radius_m: radiusM
    });
  }

  return locations;
}

function parseCoordinate(value) {
  if (
    value === undefined ||
    value === null ||
    String(value).trim() === ""
  ) {
    return null;
  }

  const number = Number(
    String(value).trim().replace(",", ".")
  );

  return Number.isFinite(number) ? number : null;
}

function calculateDistanceMeters(
  latitude1,
  longitude1,
  latitude2,
  longitude2
) {
  const earthRadiusM = 6371000;
  const toRadians = value => value * Math.PI / 180;

  const lat1 = toRadians(latitude1);
  const lat2 = toRadians(latitude2);
  const deltaLat = toRadians(latitude2 - latitude1);
  const deltaLon = toRadians(longitude2 - longitude1);

  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) *
      Math.cos(lat2) *
      Math.sin(deltaLon / 2) ** 2;

  const c = 2 * Math.atan2(
    Math.sqrt(a),
    Math.sqrt(1 - a)
  );

  return earthRadiusM * c;
}

function decodeBase64Utf8(value) {
  const binary = atob(value);
  const bytes = Uint8Array.from(
    binary,
    character => character.charCodeAt(0)
  );

  return new TextDecoder().decode(bytes);
}

async function resolveVessel(input, env) {

  const enteredName =

    typeof input.vessel_name_entered === "string"

      ? input.vessel_name_entered.trim()

      : "";

  const normalizedEnteredName =

    normalizeVesselName(enteredName);

  if (!enteredName) {

    return {

      ok: true,

      match: {

        status: "unmatched",

        vessel_id: "",

        matched_by: "",

        matched_value: "",

        normalized_input: normalizedEnteredName,

        candidate_count: 0,

        candidate_ids: []
      }
    };
  }

  const vesselsResult = await loadVessels(env);

  if (!vesselsResult.ok) {
    return vesselsResult;
  }

  const matches = [];

  for (const vessel of vesselsResult.vessels) {
    if (normalizeVesselName(vessel.name) === normalizedEnteredName) {
      matches.push({
        vessel,
        matched_by: "name"
      });

      continue;
    }

    const formerNames = vessel.former_names
      .split("|")
      .map(value => value.trim())
      .filter(Boolean);

    if (
      formerNames.some(
        name => normalizeVesselName(name) === normalizedEnteredName
      )
    ) {
      matches.push({
        vessel,
        matched_by: "former_name"
      });
    }
  }

  if (matches.length === 1) {
    return {
      ok: true,
      match: {
        status: "matched",
      
        vessel_id: matches[0].vessel.vessel_id,
      
        matched_by: matches[0].matched_by,
      
        matched_value:
          matches[0].matched_by === "name"
            ? matches[0].vessel.name
            : enteredName,
      
        normalized_input: normalizedEnteredName,
      
        candidate_count: 1,
      
        candidate_ids: [
          matches[0].vessel.vessel_id
        ]
      }
    };
  }

  if (matches.length > 1) {
    return {
      ok: true,
      match: {
        status: "ambiguous",
      
        vessel_id: "",
      
        matched_by: "name",
      
        matched_value: enteredName,
      
        normalized_input: normalizedEnteredName,
      
        candidate_count: matches.length,
      
        candidate_ids: matches.map(
          match => match.vessel.vessel_id
        )
      }
    };
  }

  return {
    ok: true,
    match: {
      status: "unmatched",
      vessel_id: "",
      matched_by: "",
      matched_value: "",
      normalized_input: "",
      candidate_count: 0,
      candidate_ids: []
    }
  };
}

async function loadVessels(env) {
  const url =
    `https://api.github.com/repos/` +
    `${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/` +
    `${VESSELS_PATH}?ref=${encodeURIComponent(BRANCH)}`;

  const result = await githubRequest(url, {
    method: "GET",
    headers: githubHeaders(env)
  });

  if (!result.ok) {
    return {
      ok: false,
      error: "data/vessels.csv konnte nicht aus GitHub geladen werden."
    };
  }

  if (
    typeof result.body.content !== "string" ||
    result.body.encoding !== "base64"
  ) {
    return {
      ok: false,
      error: "GitHub lieferte vessels.csv nicht im erwarteten Format."
    };
  }

  let csvText;

  try {
    csvText = decodeBase64Utf8(
      result.body.content.replace(/\s/g, "")
    );
  } catch {
    return {
      ok: false,
      error: "vessels.csv konnte nicht decodiert werden."
    };
  }

  try {
    return {
      ok: true,
      vessels: parseVesselsCsv(csvText)
    };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "vessels.csv konnte nicht verarbeitet werden."
    };
  }
}

function parseVesselsCsv(csvText) {
  const lines = csvText
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter(line => line.trim() !== "");

  if (lines.length < 1) {
    throw new Error("vessels.csv ist leer.");
  }

  const headers = lines[0]
    .split(";")
    .map(value => value.trim());

  const requiredHeaders = [
    "vessel_id",
    "name",
    "former_names"
  ];

  for (const requiredHeader of requiredHeaders) {
    if (!headers.includes(requiredHeader)) {
      throw new Error(
        `vessels.csv: Spalte ${requiredHeader} fehlt.`
      );
    }
  }

  const vessels = [];

  for (const line of lines.slice(1)) {
    const values = line.split(";");
    const row = {};

    headers.forEach((header, index) => {
      row[header] = (values[index] ?? "").trim();
    });

    if (
      row.vessel_id === "" ||
      row.name === ""
    ) {
      continue;
    }

    vessels.push(row);
  }

  return vessels;
}

function normalizeVesselName(value) {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
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

async function updateGitHubFile({
  env,
  path,
  content,
  message,
  sha
}) {
  const url =
    `https://api.github.com/repos/` +
    `${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${path}`;

  const result = await githubRequest(url, {
    method: "PUT",
    headers: githubHeaders(env),
    body: JSON.stringify({
      message,
      content: encodeBase64Utf8(content),
      sha
    })
  });

  if (!result.ok) {
    return result;
  }

  return {
    ...result,
    commit_sha: result.body?.commit?.sha ?? null
  };
}

function buildSubmissionPath(submissionId) {
  if (!/^SUB-\d{8}-\d{6}-[A-F0-9]{6}$/i.test(submissionId)) {
    return null;
  }

  const year = submissionId.substring(4, 8);
  const month = submissionId.substring(8, 10);

  return `inbox/submissions/${year}/${month}/${submissionId}.json`;
}

async function readGitHubFile({
  env,
  path
}) {
  const url =
    `https://api.github.com/repos/` +
    `${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${path}`;

  const result = await githubRequest(url, {
    method: "GET",
    headers: githubHeaders(env)
  });

  if (!result.ok) {
    return result;
  }

  let content = "";

  try {
    content = decodeBase64Utf8(
      String(result.body?.content ?? "").replace(/\n/g, "")
    );
  }
  catch {
    return {
      ok: false,
      status: 500,
      error: "GitHub-Datei konnte nicht decodiert werden."
    };
  }

  return {
    ok: true,
    status: result.status,
    path,
    sha: result.body?.sha ?? "",
    content
  };
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

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-API-Key"
  };
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...corsHeaders()
    }
  });
}
