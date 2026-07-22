/*
 * Danube Vessel Log
 * File: cloudflare/worker.js
 * Version: 0.8.1
 * Updated: 2026-07-22
 */

const API_VERSION = "2022-11-28";
const MAX_PHOTO_BYTES = 8 * 1024 * 1024; // 8 MB
const MAX_PHOTOS_PER_SUBMISSION = 10;
const VESSEL_DETAIL_SUBMISSION_SCAN_LIMIT = 100;
const BRANCH = "main";
const LOCATIONS_PATH = "data/locations.csv";
const VESSELS_PATH = "data/vessels.csv";
const VESSELS_DIRECTORY = "data/vessels";
const VESSEL_ID_PATTERN = /^VES-\d{6}$/;
const VESSEL_INDEX_HEADERS = [
  "vessel_id",
  "name",
  "former_names",
  "mmsi",
  "imo",
  "eni",
  "callsign",
  "ship_type",
  "ship_subtype",
  "operator",
  "cruise_brand",
  "flag",
  "status",
  "year_built",
  "length_m",
  "width_m",
  "json_path",
  "updated_at"
];

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

    if (request.method === "GET" && url.pathname === "/vessels") {
      try {
        return await handleVesselsList(request, env);
      } catch (error) {
        return jsonResponse({
          ok: false,
          error: "Unbehandelter Fehler beim Laden der Schiffsliste.",
          exception:
            error instanceof Error
              ? error.message
              : String(error)
        }, 500);
      }
    }

    if (request.method === "GET" && url.pathname === "/vessel") {
      try {
        return await handleVesselDetail(request, env);
      } catch (error) {
        return jsonResponse({
          ok: false,
          error: "Unbehandelter Fehler beim Laden des Schiffes.",
          exception:
            error instanceof Error
              ? error.message
              : String(error)
        }, 500);
      }
    }

    if (
      request.method === "GET" &&
      url.pathname === "/vessel-id-suggestion"
    ) {
      try {
        return await handleVesselIdSuggestion(request, env);
      } catch (error) {
        return jsonResponse({
          ok: false,
          error: "Unbehandelter Fehler bei der ID-Ermittlung.",
          exception:
            error instanceof Error
              ? error.message
              : String(error)
        }, 500);
      }
    }

    if (request.method === "POST" && url.pathname === "/vessel") {
      try {
        return await handleCreateVessel(request, env);
      } catch (error) {
        return jsonResponse({
          ok: false,
          error: "Unbehandelter Fehler bei der Schiffsanlage.",
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

    if (
      request.method === "POST" &&
      url.pathname === "/vessel-primary-photo"
    ) {
      try {
        return await handleVesselPrimaryPhoto(
          request,
          env
        );
      } catch (error) {
        return jsonResponse({
          ok: false,
          error:
            "Unbehandelter Fehler beim Ändern des Hauptfotos.",
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

  /*
   * Bisheriger Multipart-Weg:
   * photo bzw. photos können weiterhin verwendet werden.
   */
  const photoEntries = [
    ...form.getAll("photo"),
    ...form.getAll("photos")
  ];
  
  const multipartPhotos = photoEntries.filter(
    value =>
      value instanceof File &&
      value.size > 0
  );
  
  /*
   * Neuer Mehrfachfoto-Weg für Apple Kurzbefehle:
   * Jedes Foto steht als Base64-Text in einer eigenen Zeile.
   */
  const photosBase64Raw = form.get("photos_base64");
  
  const base64Photos = [];
  
  if (
    typeof photosBase64Raw === "string" &&
    photosBase64Raw.trim() !== ""
  ) {
    const encodedPhotos = photosBase64Raw
      .split(/\r?\n/)
      .map(value => value.trim())
      .filter(Boolean);
  
    for (
      let index = 0;
      index < encodedPhotos.length;
      index += 1
    ) {
      let encodedPhoto = encodedPhotos[index];
  
      /*
       * Sicherheitshalber auch Data-URLs akzeptieren:
       * data:image/jpeg;base64,...
       */
      const commaIndex =
        encodedPhoto.indexOf(",");
  
      if (
        encodedPhoto.startsWith("data:") &&
        commaIndex >= 0
      ) {
        encodedPhoto =
          encodedPhoto.slice(commaIndex + 1);
      }
  
      let binaryString;
  
      try {
        binaryString = atob(encodedPhoto);
      } catch {
        return jsonResponse(
          {
            ok: false,
            error:
              `Foto ${index + 1} in photos_base64 ` +
              `enthält kein gültiges Base64.`
          },
          400
        );
      }
  
      const bytes =
        new Uint8Array(binaryString.length);
  
      for (
        let byteIndex = 0;
        byteIndex < binaryString.length;
        byteIndex += 1
      ) {
        bytes[byteIndex] =
          binaryString.charCodeAt(byteIndex);
      }
  
      base64Photos.push(
        new File(
          [bytes],
          `shortcut-photo-${String(index + 1).padStart(2, "0")}.jpg`,
          {
            type: "image/jpeg"
          }
        )
      );
    }
  }
  
  /*
   * Wenn photos_base64 vorhanden ist, verwenden wir ausschließlich
   * diese Liste. Dadurch wird das erste Foto nicht doppelt gespeichert.
   *
   * Fehlt photos_base64, bleibt der bisherige Multipart-Weg aktiv.
   */
  const photos =
    base64Photos.length > 0
      ? base64Photos
      : multipartPhotos;
  
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
      
      received_photo_entries:
        photoEntries.length,
      
      received_base64_photos:
        base64Photos.length,
      
      received_photo_files:
        photos.length,
      
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


async function handleVesselsList(request, env) {
  const authError = checkManagementKey(request, env);
  if (authError) return authError;

  const result = await loadVessels(env);

  if (!result.ok) {
    return jsonResponse({
      ok: false,
      error: result.error
    }, 502);
  }

  const vessels = result.vessels
    .map(vessel => ({
      ...vessel,
      environment:
        parseVesselIdNumber(vessel.vessel_id) < 100
          ? "test"
          : "production"
    }))
    .sort((left, right) =>
      left.vessel_id.localeCompare(right.vessel_id)
    );

  return jsonResponse({
    ok: true,
    count: vessels.length,
    vessels
  });
}

async function handleVesselDetail(request, env) {
  const authError =
    checkManagementKey(request, env);

  if (authError) return authError;

  const url = new URL(request.url);

  const vesselId =
    typeof url.searchParams.get("vessel_id") === "string"
      ? url.searchParams
          .get("vessel_id")
          .trim()
      : "";

  if (!VESSEL_ID_PATTERN.test(vesselId)) {
    return jsonResponse({
      ok: false,
      error:
        "vessel_id fehlt oder hat nicht das Format VES-000000."
    }, 400);
  }

  const vesselResult =
    await loadCanonicalVessel(
      env,
      vesselId
    );

  if (!vesselResult.ok) {
    return jsonResponse({
      ok: false,
      error: vesselResult.error,
      vessel_id: vesselId,
      path: vesselResult.path ?? "",
      github_status:
        vesselResult.status ?? null
    }, vesselResult.status === 404 ? 404 : 502);
  }

  const sightingsResult =
    await loadVesselSightings({
      env,
      vesselId,
      vessel: vesselResult.vessel
    });

  if (!sightingsResult.ok) {
    return jsonResponse({
      ok: false,
      error: sightingsResult.error,
      vessel_id: vesselId,
      github_status:
        sightingsResult.status ?? null
    }, 502);
  }

  return jsonResponse({
    ok: true,
    vessel_id: vesselId,
    path: vesselResult.path,
    index: vesselResult.index,
    vessel: vesselResult.vessel,
    primary_photo:
      sightingsResult.primary_photo,
    sightings:
      sightingsResult.sightings,
    sightings_meta:
      sightingsResult.meta
  });
}

async function loadVesselSightings({
  env,
  vesselId,
  vessel
}) {
  const pathsResult =
    await listSubmissionPaths(env);

  if (!pathsResult.ok) {
    return {
      ok: false,
      status:
        pathsResult.status ?? 502,

      error:
        pathsResult.error ??
        "Die Submission-Dateien konnten nicht aufgelistet werden."
    };
  }

  const allPaths = [
    ...pathsResult.paths
  ].sort(
    (left, right) =>
      right.localeCompare(left)
  );

  const candidatePaths =
    allPaths.slice(
      0,
      VESSEL_DETAIL_SUBMISSION_SCAN_LIMIT
    );

  const loadedFiles =
    await Promise.all(
      candidatePaths.map(path =>
        readGitHubFile({
          env,
          path
        })
      )
    );

  const sightings = [];

  for (const file of loadedFiles) {
    if (!file.ok) continue;

    let submission;

    try {
      submission = JSON.parse(
        String(file.content ?? "")
          .replace(/^\uFEFF/, "")
      );
    } catch {
      continue;
    }

    const workflowStatus =
      submission.workflow?.status ??
      "new";

    const reviewedVesselId =
      submission.workflow
        ?.review
        ?.vessel_id ?? "";

    if (
      workflowStatus !== "reviewed" ||
      reviewedVesselId !== vesselId
    ) {
      continue;
    }

    const photos =
      Array.isArray(submission.photos)
        ? submission.photos
            .filter(photo =>
              photo &&
              typeof photo.path ===
                "string" &&
              photo.path.trim() !== ""
            )
            .map(
              (photo, index) => ({
                photo_id:
                  typeof photo.photo_id ===
                    "string"
                    ? photo.photo_id
                    : "",

                path: photo.path,

                url:
                  buildRawGitHubUrl(
                    env,
                    photo.path
                  ),

                original_filename:
                  typeof photo
                    .original_filename ===
                    "string"
                    ? photo.original_filename
                    : "",

                size_bytes:
                  Number.isFinite(
                    photo.size_bytes
                  )
                    ? photo.size_bytes
                    : null,

                sequence:
                  Number.isInteger(
                    photo.sequence
                  )
                    ? photo.sequence
                    : index + 1
              })
            )
        : [];

    sightings.push({
      submission_id:
        typeof submission.submission_id ===
          "string"
          ? submission.submission_id
          : "",

      captured_at:
        typeof submission.captured_at ===
          "string"
          ? submission.captured_at
          : "",

      uploaded_at:
        typeof submission.uploaded_at ===
          "string"
          ? submission.uploaded_at
          : "",

      vessel_name_entered:
        typeof submission
          .vessel_name_entered ===
          "string"
          ? submission
              .vessel_name_entered
          : "",

      location:
        submission.location &&
        typeof submission.location ===
          "object"
          ? {
              id:
                submission.location.id ??
                "",

              name:
                submission.location.name ??
                "",

              municipality:
                submission.location
                  .municipality ?? "",

              country:
                submission.location
                  .country ?? ""
            }
          : {
              id: "",
              name: "",
              municipality: "",
              country: ""
            },

      movement:
        typeof submission.movement ===
          "string"
          ? submission.movement
          : "unknown",

      direction:
        typeof submission.direction ===
          "string"
          ? submission.direction
          : "unknown",

      notes:
        typeof submission.notes ===
          "string"
          ? submission.notes
          : "",

      review_decision:
        submission.workflow
          ?.review
          ?.decision ?? "",

      review_notes:
        submission.workflow
          ?.review
          ?.notes ?? "",

      photo_count:
        photos.length,

      photos,

      submission_path:
        file.path
    });
  }

  sightings.sort(
    (left, right) =>
      String(right.captured_at)
        .localeCompare(
          String(left.captured_at)
        )
  );

  const primaryPhotoId =
    typeof vessel.media
      ?.primary_photo_id === "string"
      ? vessel.media.primary_photo_id
      : "";

  const primarySubmissionId =
    typeof vessel.media
      ?.primary_submission_id === "string"
      ? vessel.media
          .primary_submission_id
      : "";

  let primaryPhoto = null;

  if (primaryPhotoId) {
    for (const sighting of sightings) {
      const photo =
        sighting.photos.find(
          item =>
            item.photo_id ===
            primaryPhotoId
        );

      if (photo) {
        primaryPhoto = {
          ...photo,
          submission_id:
            sighting.submission_id,
          captured_at:
            sighting.captured_at
        };

        break;
      }
    }
  }

  if (
    !primaryPhoto &&
    primarySubmissionId
  ) {
    const primarySighting =
      sightings.find(
        sighting =>
          sighting.submission_id ===
          primarySubmissionId
      );

    if (
      primarySighting?.photos[0]
    ) {
      primaryPhoto = {
        ...primarySighting.photos[0],

        submission_id:
          primarySighting
            .submission_id,

        captured_at:
          primarySighting
            .captured_at
      };
    }
  }

  if (
    !primaryPhoto &&
    sightings[0]?.photos[0]
  ) {
    primaryPhoto = {
      ...sightings[0].photos[0],

      submission_id:
        sightings[0].submission_id,

      captured_at:
        sightings[0].captured_at
    };
  }

  return {
    ok: true,

    primary_photo:
      primaryPhoto,

    sightings,

    meta: {
      total_submission_count:
        allPaths.length,

      scanned_count:
        candidatePaths.length,

      matched_count:
        sightings.length,

      truncated:
        allPaths.length >
        candidatePaths.length
    }
  };
}

async function handleVesselPrimaryPhoto(
  request,
  env
) {
  const authError =
    checkManagementKey(request, env);

  if (authError) return authError;

  let input;

  try {
    input = await request.json();
  } catch {
    return jsonResponse({
      ok: false,
      error:
        "Der Anfrageinhalt ist kein gültiges JSON."
    }, 400);
  }

  const vesselId =
    typeof input?.vessel_id === "string"
      ? input.vessel_id.trim()
      : "";

  const photoId =
    typeof input?.photo_id === "string"
      ? input.photo_id.trim()
      : "";

  if (!VESSEL_ID_PATTERN.test(vesselId)) {
    return jsonResponse({
      ok: false,
      error:
        "vessel_id fehlt oder ist ungültig."
    }, 400);
  }

  if (
    !/^PHOTO-[A-Z0-9-]{6,80}$/.test(
      photoId
    )
  ) {
    return jsonResponse({
      ok: false,
      error:
        "photo_id fehlt oder ist ungültig."
    }, 400);
  }

  const vesselResult =
    await loadCanonicalVessel(
      env,
      vesselId
    );

  if (!vesselResult.ok) {
    return jsonResponse({
      ok: false,
      error: vesselResult.error,
      vessel_id: vesselId
    }, vesselResult.status === 404
      ? 404
      : 502);
  }

  /*
   * Es dürfen ausschließlich Fotos gewählt
   * werden, die zu einer bestätigten Sichtung
   * dieses Schiffes gehören.
   */
  const sightingsResult =
    await loadVesselSightings({
      env,
      vesselId,
      vessel: vesselResult.vessel
    });

  if (!sightingsResult.ok) {
    return jsonResponse({
      ok: false,
      error: sightingsResult.error
    }, sightingsResult.status ?? 502);
  }

  let selectedPhoto = null;
  let selectedSighting = null;

  for (
    const sighting
    of sightingsResult.sightings
  ) {
    const photo =
      sighting.photos.find(
        candidate =>
          candidate.photo_id === photoId
      );

    if (photo) {
      selectedPhoto = photo;
      selectedSighting = sighting;
      break;
    }
  }

  if (
    !selectedPhoto ||
    !selectedSighting
  ) {
    return jsonResponse({
      ok: false,
      error:
        "Das gewählte Foto gehört zu keiner verknüpften Sichtung dieses Schiffes."
    }, 404);
  }

  const vessel =
    vesselResult.vessel;

  const updatedAt =
    new Date().toISOString();

  if (
    !vessel.media ||
    typeof vessel.media !== "object" ||
    Array.isArray(vessel.media)
  ) {
    vessel.media = {};
  }

  vessel.media.primary_photo_id =
    photoId;

  vessel.media.primary_submission_id =
    selectedSighting.submission_id;

  vessel.media.primary_photo_updated_at =
    updatedAt;

  if (
    !vessel.audit ||
    typeof vessel.audit !== "object" ||
    Array.isArray(vessel.audit)
  ) {
    vessel.audit = {};
  }

  vessel.audit.updated_at =
    updatedAt;

  vessel.audit.updated_by =
    "web-ui-primary-photo";

  /*
   * Auch updated_at im CSV-Index wird
   * konsistent aktualisiert.
   */
  const vesselsResult =
    await loadVessels(env);

  if (!vesselsResult.ok) {
    return jsonResponse({
      ok: false,
      error: vesselsResult.error
    }, 502);
  }

  const updatedVessels =
    vesselsResult.vessels
      .map(indexVessel =>
        indexVessel.vessel_id ===
          vesselId
          ? {
              ...indexVessel,
              updated_at: updatedAt
            }
          : indexVessel
      )
      .sort(
        (left, right) =>
          left.vessel_id.localeCompare(
            right.vessel_id
          )
      );

  const commitResult =
    await createAtomicGitHubCommit({
      env,
      message:
        `Hauptfoto für ${vesselId} geändert`,
      files: [
        {
          path: vesselResult.path,
          content:
            JSON.stringify(
              vessel,
              null,
              2
            ) + "\n",
          encoding: "utf-8"
        },
        {
          path: VESSELS_PATH,
          content:
            serializeVesselsCsv(
              updatedVessels
            ),
          encoding: "utf-8"
        }
      ]
    });

  if (!commitResult.ok) {
    return jsonResponse({
      ok: false,
      error:
        "Das Hauptfoto konnte nicht gespeichert werden.",
      github_step:
        commitResult.step,
      github_status:
        commitResult.status,
      github_response:
        commitResult.body
    }, 502);
  }

  return jsonResponse({
    ok: true,
    message:
      "Hauptfoto wurde geändert.",
    vessel_id: vesselId,
    photo_id: photoId,
    submission_id:
      selectedSighting.submission_id,
    primary_photo: {
      ...selectedPhoto,
      submission_id:
        selectedSighting.submission_id,
      captured_at:
        selectedSighting.captured_at
    },
    commit_sha:
      commitResult.commitSha
  });
}

async function handleVesselIdSuggestion(request, env) {
  const url = new URL(request.url);
  const environment = normalizeVesselEnvironment(
    url.searchParams.get("environment")
  );

  if (!environment) {
    return jsonResponse({
      ok: false,
      error: "environment muss production oder test sein."
    }, 400);
  }

  const vesselsResult = await loadVessels(env);

  if (!vesselsResult.ok) {
    return jsonResponse({
      ok: false,
      error: vesselsResult.error
    }, 502);
  }

  const suggestion = await findAvailableVesselId({
    env,
    vessels: vesselsResult.vessels,
    environment
  });

  if (!suggestion.ok) {
    return jsonResponse({
      ok: false,
      error: suggestion.error
    }, suggestion.status ?? 502);
  }

  return jsonResponse({
    ok: true,
    environment,
    vessel_id: suggestion.vessel_id
  });
}

async function handleCreateVessel(request, env) {
  const authError = checkManagementKey(request, env);
  if (authError) return authError;

  let input;

  try {
    input = await request.json();
  } catch {
    return jsonResponse({
      ok: false,
      error: "Der Anfrageinhalt ist kein gültiges JSON."
    }, 400);
  }

  const validation = validateNewVesselInput(input);

  if (!validation.ok) {
    return jsonResponse({
      ok: false,
      error: validation.error
    }, 400);
  }

  const vesselsFile = await readGitHubFile({
    env,
    path: VESSELS_PATH
  });

  if (!vesselsFile.ok) {
    return jsonResponse({
      ok: false,
      error: "data/vessels.csv konnte nicht gelesen werden.",
      github_status: vesselsFile.status ?? null
    }, 502);
  }

  let vessels;

  try {
    vessels = parseVesselsCsv(vesselsFile.content);
  } catch (error) {
    return jsonResponse({
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "vessels.csv konnte nicht verarbeitet werden."
    }, 500);
  }

  const suggestion = await findAvailableVesselId({
    env,
    vessels,
    environment: validation.data.environment
  });

  if (!suggestion.ok) {
    return jsonResponse({
      ok: false,
      error: suggestion.error
    }, suggestion.status ?? 502);
  }

  const vesselId = suggestion.vessel_id;
  const vesselPath = `${VESSELS_DIRECTORY}/${vesselId}.json`;
  const createdAt = new Date().toISOString();

  let submission = null;
  let submissionPath = "";

  if (validation.data.submission_id) {
    submissionPath = buildSubmissionPath(
      validation.data.submission_id
    );

    if (!submissionPath) {
      return jsonResponse({
        ok: false,
        error: "Die submission_id ist ungültig."
      }, 400);
    }

    const submissionFile = await readGitHubFile({
      env,
      path: submissionPath
    });

    if (!submissionFile.ok) {
      return jsonResponse({
        ok: false,
        error: "Die zugehörige Sichtung konnte nicht gelesen werden.",
        github_status: submissionFile.status ?? null
      }, submissionFile.status === 404 ? 404 : 502);
    }

    try {
      submission = JSON.parse(
        String(submissionFile.content ?? "")
          .replace(/^\uFEFF/, "")
      );
    } catch {
      return jsonResponse({
        ok: false,
        error: "Die zugehörige Sichtung enthält ungültiges JSON."
      }, 500);
    }

    if ((submission.workflow?.status ?? "new") !== "new") {
      return jsonResponse({
        ok: false,
        error:
          "Die Sichtung wurde bereits bearbeitet und kann nicht erneut " +
          "mit einer Neuanlage verknüpft werden."
      }, 409);
    }
  }

  const primaryPhoto =
    Array.isArray(submission?.photos)
      ? submission.photos[0] ?? null
      : null;

  const vessel = buildCanonicalVessel({
    vesselId,
    input: validation.data,
    createdAt,
    primaryPhotoId:
      typeof primaryPhoto?.photo_id === "string"
        ? primaryPhoto.photo_id
        : ""
  });

  const indexRow = buildVesselIndexRow({
    vessel,
    path: vesselPath,
    updatedAt: createdAt
  });

  const updatedVessels = [
    ...vessels,
    indexRow
  ].sort((left, right) =>
    left.vessel_id.localeCompare(right.vessel_id)
  );

  const commitFiles = [
    {
      path: vesselPath,
      content: JSON.stringify(vessel, null, 2) + "\n",
      encoding: "utf-8"
    },
    {
      path: VESSELS_PATH,
      content: serializeVesselsCsv(updatedVessels),
      encoding: "utf-8"
    }
  ];

  if (submission && submissionPath) {
    applyCreatedVesselReview({
      submission,
      vesselId,
      reviewedAt: createdAt,
      notes: validation.data.review_notes
    });

    commitFiles.push({
      path: submissionPath,
      content: JSON.stringify(submission, null, 2) + "\n",
      encoding: "utf-8"
    });
  }

  const commitResult = await createAtomicGitHubCommit({
    env,
    message:
      submission
        ? `Neues Schiff ${vesselId} aus ${validation.data.submission_id}`
        : `Neues Schiff ${vesselId}`,
    files: commitFiles
  });

  if (!commitResult.ok) {
    return jsonResponse({
      ok: false,
      error:
        "Das Schiff konnte nicht atomar in JSON und CSV gespeichert werden.",
      github_step: commitResult.step,
      github_status: commitResult.status,
      github_response: commitResult.body
    }, commitResult.status === 422 ? 409 : 502);
  }

  return jsonResponse({
    ok: true,
    message:
      submission
        ? "Schiff wurde angelegt und mit der Sichtung verknüpft."
        : "Schiff wurde angelegt.",
    vessel_id: vesselId,
    path: vesselPath,
    index: indexRow,
    vessel,
    linked_submission_id:
      validation.data.submission_id || "",
    commit_sha: commitResult.commitSha
  }, 201);
}

function validateNewVesselInput(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {
      ok: false,
      error: "Die Schiffsdaten fehlen."
    };
  }

  const environment = normalizeVesselEnvironment(
    input.environment
  );

  if (!environment) {
    return {
      ok: false,
      error: "environment muss production oder test sein."
    };
  }

  const name = normalizeIndexText(input.name, 150);

  if (!name) {
    return {
      ok: false,
      error: "Der Schiffsname ist erforderlich."
    };
  }

  const formerNames = normalizeStringArray(
    input.former_names,
    50,
    150
  );

  const simpleFields = {
    mmsi: normalizeIndexText(input.mmsi, 30),
    imo: normalizeIndexText(input.imo, 30),
    eni: normalizeIndexText(input.eni, 30),
    call_sign: normalizeIndexText(input.call_sign, 40),
    ship_type: normalizeIndexText(input.ship_type, 80),
    ship_subtype: normalizeIndexText(input.ship_subtype, 80),
    flag: normalizeIndexText(input.flag, 10).toUpperCase(),
    shipyard: normalizeFreeText(input.shipyard, 200),
    operator: normalizeIndexText(input.operator, 200),
    owner: normalizeFreeText(input.owner, 200),
    manager: normalizeFreeText(input.manager, 200),
    cruise_brand: normalizeIndexText(input.cruise_brand, 200),
    home_port: normalizeFreeText(input.home_port, 150),
    notes: normalizeFreeText(input.notes, 5000),
    review_notes: normalizeFreeText(input.review_notes, 1000),
    submission_id:
      typeof input.submission_id === "string"
        ? input.submission_id.trim()
        : ""
  };

  const unsafeIndexValues = [
    name,
    ...formerNames,
    simpleFields.mmsi,
    simpleFields.imo,
    simpleFields.eni,
    simpleFields.call_sign,
    simpleFields.ship_type,
    simpleFields.ship_subtype,
    simpleFields.operator,
    simpleFields.cruise_brand,
    simpleFields.flag
  ];

  if (
    unsafeIndexValues.some(value =>
      /[;\r\n|]/.test(value)
    )
  ) {
    return {
      ok: false,
      error:
        "Indexfelder dürfen keine Semikolons, Zeilenumbrüche oder " +
        "senkrechten Striche enthalten."
    };
  }

  const status =
    typeof input.status === "string"
      ? input.status.trim()
      : "unknown";

  if (
    !["active", "inactive", "scrapped", "unknown"]
      .includes(status)
  ) {
    return {
      ok: false,
      error: "Der Schiffsstatus ist ungültig."
    };
  }

  const yearBuilt = parseOptionalInteger(
    input.year_built,
    1800,
    new Date().getUTCFullYear() + 1
  );

  if (!yearBuilt.ok) {
    return {
      ok: false,
      error: "Das Baujahr ist ungültig."
    };
  }

  const lengthM = parseOptionalNumber(input.length_m, 0, 1000);
  const widthM = parseOptionalNumber(input.width_m, 0, 200);
  const draftM = parseOptionalNumber(input.draft_m, 0, 50);
  const passengers = parseOptionalInteger(input.passengers, 0, 10000);

  if (!lengthM.ok || !widthM.ok || !draftM.ok) {
    return {
      ok: false,
      error: "Länge, Breite oder Tiefgang sind ungültig."
    };
  }

  if (!passengers.ok) {
    return {
      ok: false,
      error: "Die Passagierzahl ist ungültig."
    };
  }

  return {
    ok: true,
    data: {
      environment,
      name,
      former_names: formerNames,
      ...simpleFields,
      status,
      year_built: yearBuilt.value,
      length_m: lengthM.value,
      width_m: widthM.value,
      draft_m: draftM.value,
      passengers: passengers.value
    }
  };
}

function normalizeVesselEnvironment(value) {
  const normalized =
    typeof value === "string"
      ? value.trim().toLowerCase()
      : "production";

  return ["production", "test"].includes(normalized)
    ? normalized
    : "";
}

function normalizeIndexText(value, maximumLength) {
  return normalizeFreeText(value, maximumLength)
    .replace(/\s+/g, " ");
}

function normalizeFreeText(value, maximumLength) {
  const normalized =
    typeof value === "string"
      ? value.trim()
      : "";

  return normalized.slice(0, maximumLength);
}

function normalizeStringArray(value, maximumItems, maximumLength) {
  if (!Array.isArray(value)) {
    return [];
  }

  return [
    ...new Set(
      value
        .map(item => normalizeIndexText(item, maximumLength))
        .filter(Boolean)
    )
  ].slice(0, maximumItems);
}

function parseOptionalNumber(value, minimum, maximum) {
  if (
    value === undefined ||
    value === null ||
    String(value).trim() === ""
  ) {
    return { ok: true, value: null };
  }

  const number = Number(
    String(value).trim().replace(",", ".")
  );

  return {
    ok:
      Number.isFinite(number) &&
      number >= minimum &&
      number <= maximum,
    value: number
  };
}

function parseOptionalInteger(value, minimum, maximum) {
  const parsed = parseOptionalNumber(value, minimum, maximum);

  if (!parsed.ok || parsed.value === null) {
    return parsed;
  }

  return {
    ok: Number.isInteger(parsed.value),
    value: parsed.value
  };
}

async function findAvailableVesselId({
  env,
  vessels,
  environment
}) {
  const startNumber = environment === "test" ? 0 : 100;
  const endNumber = environment === "test" ? 99 : 999999;

  const usedNumbers = new Set(
    vessels
      .map(vessel => parseVesselIdNumber(vessel.vessel_id))
      .filter(number =>
        number !== null &&
        number >= startNumber &&
        number <= endNumber
      )
  );

  const maximumUsed =
    usedNumbers.size > 0
      ? Math.max(...usedNumbers)
      : startNumber - 1;

  let candidateNumber = Math.max(
    startNumber,
    maximumUsed + 1
  );

  while (candidateNumber <= endNumber) {
    if (!usedNumbers.has(candidateNumber)) {
      const vesselId = formatVesselId(candidateNumber);
      const path = `${VESSELS_DIRECTORY}/${vesselId}.json`;
      const file = await readGitHubFile({ env, path });

      if (file.status === 404) {
        return {
          ok: true,
          vessel_id: vesselId
        };
      }

      if (!file.ok) {
        return {
          ok: false,
          status: file.status ?? 502,
          error:
            `Der mögliche JSON-Pfad ${path} konnte nicht geprüft werden.`
        };
      }
    }

    candidateNumber += 1;
  }

  return {
    ok: false,
    status: 409,
    error:
      environment === "test"
        ? "Der reservierte Test-ID-Bereich VES-000000 bis VES-000099 ist voll."
        : "Es ist keine produktive Vessel-ID mehr verfügbar."
  };
}

function parseVesselIdNumber(vesselId) {
  if (!VESSEL_ID_PATTERN.test(vesselId ?? "")) {
    return null;
  }

  return Number(vesselId.slice(4));
}

function formatVesselId(number) {
  return `VES-${String(number).padStart(6, "0")}`;
}

function buildCanonicalVessel({
  vesselId,
  input,
  createdAt,
  primaryPhotoId
}) {
  return {
    schema_version: 1,
    vessel_id: vesselId,
    identity: {
      name: input.name,
      former_names: input.former_names,
      mmsi: input.mmsi,
      imo: input.imo,
      eni: input.eni,
      call_sign: input.call_sign
    },
    classification: {
      ship_type: input.ship_type,
      ship_subtype: input.ship_subtype,
      status: input.status,
      flag: input.flag
    },
    technical: {
      year_built: input.year_built,
      shipyard: input.shipyard,
      length_m: input.length_m,
      width_m: input.width_m,
      draft_m: input.draft_m,
      passengers: input.passengers
    },
    operations: {
      operator: input.operator,
      owner: input.owner,
      manager: input.manager,
      cruise_brand: input.cruise_brand,
      home_port: input.home_port
    },
    name_history: [],
    identifiers_history: [],
    sources: [],
    enrichment: {
      status: "pending",
      last_run_at: "",
      providers: []
    },
    media: {
      primary_photo_id: primaryPhotoId,
      primary_submission_id: input.submission_id
    },
    notes: input.notes,
    audit: {
      environment: input.environment,
      created_at: createdAt,
      created_from_submission_id: input.submission_id,
      updated_at: createdAt,
      updated_by: "web-ui"
    }
  };
}

function buildVesselIndexRow({ vessel, path, updatedAt }) {
  return {
    vessel_id: vessel.vessel_id,
    name: vessel.identity.name,
    former_names: vessel.identity.former_names.join("|"),
    mmsi: vessel.identity.mmsi,
    imo: vessel.identity.imo,
    eni: vessel.identity.eni,
    callsign: vessel.identity.call_sign,
    ship_type: vessel.classification.ship_type,
    ship_subtype: vessel.classification.ship_subtype,
    operator: vessel.operations.operator,
    cruise_brand: vessel.operations.cruise_brand,
    flag: vessel.classification.flag,
    status: vessel.classification.status,
    year_built:
      vessel.technical.year_built ?? "",
    length_m:
      vessel.technical.length_m ?? "",
    width_m:
      vessel.technical.width_m ?? "",
    json_path: path,
    updated_at: updatedAt
  };
}

function serializeVesselsCsv(vessels) {
  const lines = [
    VESSEL_INDEX_HEADERS.join(";")
  ];

  for (const vessel of vessels) {
    lines.push(
      VESSEL_INDEX_HEADERS
        .map(header => serializeVesselIndexValue(vessel[header]))
        .join(";")
    );
  }

  return lines.join("\n") + "\n";
}

function serializeVesselIndexValue(value) {
  const normalized =
    value === null || value === undefined
      ? ""
      : String(value);

  if (/[;\r\n]/.test(normalized)) {
    throw new Error(
      "Ein CSV-Indexwert enthält ein unzulässiges Trennzeichen."
    );
  }

  return normalized;
}

function applyCreatedVesselReview({
  submission,
  vesselId,
  reviewedAt,
  notes
}) {
  if (!submission.workflow || typeof submission.workflow !== "object") {
    submission.workflow = {};
  }

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

  submission.workflow.status = "reviewed";
  submission.workflow.review = {
    reviewed: true,
    reviewed_at: reviewedAt,
    vessel_id: vesselId,
    decision: "created",
    notes
  };
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

  /*
   * Offene Sichtungen werden beim Laden immer gegen den aktuellen
   * Vessel-Index neu abgeglichen. Dadurch bleiben Kandidaten aktuell,
   * auch wenn Testdaten oder Vessel-IDs nachträglich geändert wurden.
   */
  const vesselsResult = await loadVessels(env);

  if (!vesselsResult.ok) {
    return jsonResponse({
      ok: false,
      error: vesselsResult.error
    }, 502);
  }

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

    const storedAutomaticMatch = normalizeVesselMatch(
      submission.workflow?.auto?.vessel_match
    );

    const automaticMatch =
      workflowStatus === "new"
        ? matchVesselByName(
            submission.vessel_name_entered ?? "",
            vesselsResult.vessels
          )
        : storedAutomaticMatch;

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

      automatic_match: automaticMatch,

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

    /*
     * Vor einer Bestätigung oder Korrektur wird der automatische Treffer
     * nochmals aus dem aktuellen Vessel-Index berechnet. So kann keine
     * veraltete Vessel-ID aus einer älteren Submission bestätigt werden.
     * Der aktuelle Treffer wird mit der Review-Entscheidung gespeichert.
     */
    if (input.decision !== "rejected") {
      const vesselsResult = await loadVessels(env);

      if (!vesselsResult.ok) {
        return jsonResponse({
          ok: false,
          error: vesselsResult.error
        }, 502);
      }

      if (!submission.workflow || typeof submission.workflow !== "object") {
        submission.workflow = {};
      }

      if (!submission.workflow.auto || typeof submission.workflow.auto !== "object") {
        submission.workflow.auto = {};
      }

      submission.workflow.auto.vessel_match =
        matchVesselByName(
          submission.vessel_name_entered ?? "",
          vesselsResult.vessels
        );
    }

    const review =
      await validateReviewInput(input, submission, env);
    
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

async function validateReviewInput(input, submission, env) {
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

  if (decision === "rejected") {
    return {
      ok: true,
      decision,
      vessel_id: ""
    };
  }

  let reviewedVesselId = vesselId;

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

    reviewedVesselId = automaticVesselId;
  }

  if (!VESSEL_ID_PATTERN.test(reviewedVesselId)) {
    return {
      ok: false,
      error:
        decision === "corrected"
          ? "Bei corrected ist eine gültige vessel_id erforderlich."
          : "Die automatisch ermittelte vessel_id ist ungültig."
    };
  }

  /*
   * Eine Review-Zuordnung ist erst gültig, wenn sowohl der
   * CSV-Indexeintrag als auch der kanonische JSON-Stammdatensatz
   * vorhanden und konsistent sind.
   */
  const vesselResult =
    await loadCanonicalVessel(env, reviewedVesselId);

  if (!vesselResult.ok) {
    return {
      ok: false,
      error:
        `Die Vessel-ID ${reviewedVesselId} kann nicht verwendet werden: ` +
        vesselResult.error
    };
  }

  return {
    ok: true,
    decision,
    vessel_id: reviewedVesselId
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
  const vesselsResult = await loadVessels(env);

  if (!vesselsResult.ok) {
    return vesselsResult;
  }

  return {
    ok: true,
    match: matchVesselByName(
      input?.vessel_name_entered ?? "",
      vesselsResult.vessels
    )
  };
}

function matchVesselByName(enteredNameValue, vessels) {
  const enteredName =
    typeof enteredNameValue === "string"
      ? enteredNameValue.trim()
      : "";

  const normalizedEnteredName =
    normalizeVesselName(enteredName);

  if (!enteredName) {
    return normalizeVesselMatch({
      normalized_input: normalizedEnteredName
    });
  }

  const matches = [];

  for (const vessel of Array.isArray(vessels) ? vessels : []) {
    if (normalizeVesselName(vessel.name) === normalizedEnteredName) {
      matches.push({
        vessel,
        matched_by: "name",
        matched_value: vessel.name
      });

      continue;
    }

    const formerNames = String(vessel.former_names ?? "")
      .split("|")
      .map(value => value.trim())
      .filter(Boolean);

    const matchedFormerName = formerNames.find(
      name => normalizeVesselName(name) === normalizedEnteredName
    );

    if (matchedFormerName) {
      matches.push({
        vessel,
        matched_by: "former_name",
        matched_value: matchedFormerName
      });
    }
  }

  if (matches.length === 1) {
    return normalizeVesselMatch({
      status: "matched",
      vessel_id: matches[0].vessel.vessel_id,
      matched_by: matches[0].matched_by,
      matched_value: matches[0].matched_value,
      normalized_input: normalizedEnteredName,
      candidate_count: 1,
      candidate_ids: [
        matches[0].vessel.vessel_id
      ]
    });
  }

  if (matches.length > 1) {
    return normalizeVesselMatch({
      status: "ambiguous",
      vessel_id: "",
      matched_by: "name",
      matched_value: enteredName,
      normalized_input: normalizedEnteredName,
      candidate_count: matches.length,
      candidate_ids: matches.map(
        match => match.vessel.vessel_id
      )
    });
  }

  return normalizeVesselMatch({
    normalized_input: normalizedEnteredName
  });
}

function normalizeVesselMatch(value) {
  const source =
    value && typeof value === "object"
      ? value
      : {};

  const allowedStatuses = [
    "matched",
    "ambiguous",
    "unmatched"
  ];

  const status = allowedStatuses.includes(source.status)
    ? source.status
    : "unmatched";

  const candidateIds = Array.isArray(source.candidate_ids)
    ? source.candidate_ids
        .filter(value => typeof value === "string")
        .map(value => value.trim())
        .filter(value => VESSEL_ID_PATTERN.test(value))
    : [];

  return {
    status,
    vessel_id:
      typeof source.vessel_id === "string"
        ? source.vessel_id.trim()
        : "",
    matched_by:
      typeof source.matched_by === "string"
        ? source.matched_by.trim()
        : "",
    matched_value:
      typeof source.matched_value === "string"
        ? source.matched_value
        : "",
    candidate_count:
      Number.isInteger(source.candidate_count)
        ? source.candidate_count
        : candidateIds.length,
    candidate_ids: candidateIds,
    normalized_input:
      typeof source.normalized_input === "string"
        ? source.normalized_input
        : ""
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
    "former_names",
    "json_path"
  ];

  for (const requiredHeader of requiredHeaders) {
    if (!headers.includes(requiredHeader)) {
      throw new Error(
        `vessels.csv: Spalte ${requiredHeader} fehlt.`
      );
    }
  }

  const vessels = [];
  const seenVesselIds = new Set();

  for (const line of lines.slice(1)) {
    const values = line.split(";");
    const row = {};

    headers.forEach((header, index) => {
      row[header] = (values[index] ?? "").trim();
    });

    if (
      row.vessel_id === "" &&
      row.name === "" &&
      row.json_path === ""
    ) {
      continue;
    }

    if (!VESSEL_ID_PATTERN.test(row.vessel_id)) {
      throw new Error(
        `vessels.csv: Ungültige vessel_id ${row.vessel_id || "(leer)"}.`
      );
    }

    if (!row.name) {
      throw new Error(
        `vessels.csv: Name für ${row.vessel_id} fehlt.`
      );
    }

    const expectedPath =
      `${VESSELS_DIRECTORY}/${row.vessel_id}.json`;

    if (row.json_path !== expectedPath) {
      throw new Error(
        `vessels.csv: json_path für ${row.vessel_id} muss ` +
        `${expectedPath} sein.`
      );
    }

    if (seenVesselIds.has(row.vessel_id)) {
      throw new Error(
        `vessels.csv: Doppelte vessel_id ${row.vessel_id}.`
      );
    }

    seenVesselIds.add(row.vessel_id);
    vessels.push(row);
  }

  return vessels;
}

async function loadCanonicalVessel(
  env,
  vesselId,
  preloadedVessels = null
) {
  if (!VESSEL_ID_PATTERN.test(vesselId)) {
    return {
      ok: false,
      status: 400,
      error: "Die Vessel-ID ist ungültig."
    };
  }

  let vessels = preloadedVessels;

  if (!Array.isArray(vessels)) {
    const vesselsResult = await loadVessels(env);

    if (!vesselsResult.ok) {
      return vesselsResult;
    }

    vessels = vesselsResult.vessels;
  }

  const index =
    vessels.find(
      vessel => vessel.vessel_id === vesselId
    ) ?? null;

  if (!index) {
    return {
      ok: false,
      status: 404,
      error:
        `${vesselId} ist in data/vessels.csv nicht vorhanden.`
    };
  }

  const expectedPath =
    `${VESSELS_DIRECTORY}/${vesselId}.json`;

  const indexedPath =
    typeof index.json_path === "string"
      ? index.json_path.trim()
      : "";

  if (indexedPath !== expectedPath) {
    return {
      ok: false,
      status: 409,
      path: indexedPath,
      error:
        `Der CSV-Index verweist nicht auf den erwarteten JSON-Pfad ` +
        `${expectedPath}.`
    };
  }

  const file = await readGitHubFile({
    env,
    path: indexedPath
  });

  if (!file.ok) {
    return {
      ok: false,
      status: file.status ?? 502,
      path: indexedPath,
      error:
        file.status === 404
          ? `Der kanonische Stammdatensatz ${indexedPath} fehlt.`
          : `Der kanonische Stammdatensatz ${indexedPath} konnte nicht gelesen werden.`
    };
  }

  let vessel;

  try {
    vessel = JSON.parse(
      String(file.content ?? "").replace(/^\uFEFF/, "")
    );
  } catch (error) {
    return {
      ok: false,
      status: 500,
      path: indexedPath,
      error:
        `Der kanonische Stammdatensatz ${indexedPath} enthält ungültiges JSON: ` +
        (
          error instanceof Error
            ? error.message
            : String(error)
        )
    };
  }

  if (
    !vessel ||
    typeof vessel !== "object" ||
    Array.isArray(vessel)
  ) {
    return {
      ok: false,
      status: 500,
      path: indexedPath,
      error:
        `Der kanonische Stammdatensatz ${indexedPath} ist kein JSON-Objekt.`
    };
  }

  if (vessel.vessel_id !== vesselId) {
    return {
      ok: false,
      status: 409,
      path: indexedPath,
      error:
        `Die vessel_id im JSON stimmt nicht mit ${vesselId} überein.`
    };
  }

  if (
    !Number.isInteger(vessel.schema_version) ||
    vessel.schema_version < 1
  ) {
    return {
      ok: false,
      status: 409,
      path: indexedPath,
      error:
        "Im kanonischen JSON fehlt eine gültige schema_version."
    };
  }

  const canonicalName =
    typeof vessel.identity?.name === "string"
      ? vessel.identity.name.trim()
      : "";

  if (!canonicalName) {
    return {
      ok: false,
      status: 409,
      path: indexedPath,
      error:
        "Im kanonischen JSON fehlt identity.name."
    };
  }

  if (canonicalName !== index.name) {
    return {
      ok: false,
      status: 409,
      path: indexedPath,
      error:
        `Der Name im CSV-Index (${index.name}) stimmt nicht mit ` +
        `identity.name im JSON (${canonicalName}) überein.`
    };
  }

  return {
    ok: true,
    path: indexedPath,
    index,
    vessel
  };
}

function normalizeVesselName(value) {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function checkManagementKey(request, env) {
  const configuredKey =
    typeof env.API_KEY === "string"
      ? env.API_KEY.trim()
      : "";

  if (!configuredKey) {
    return null;
  }

  const suppliedKey =
    request.headers.get("X-API-Key") ?? "";

  if (suppliedKey !== configuredKey) {
    return jsonResponse({
      ok: false,
      error: "Nicht autorisiert."
    }, 401);
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
    "Access-Control-Allow-Headers": "Content-Type, X-API-Key, X-Upload-Key"
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
