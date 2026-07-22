// Danube Vessel Log
// File: docs/js/vessel.js
// Version: 0.8.0
// Updated: 2026-07-22

"use strict";

document.addEventListener("DOMContentLoaded", () => {
  const byId = id => document.getElementById(id);

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
  const reloadButton = byId("reloadButton");
  const pageStatus = byId("pageStatus");
  const content = byId("vesselContent");

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
        ? sources
        : [];

    sourceList.replaceChildren();

    set(
      "sourceCountBadge",
      String(normalizedSources.length)
    );

    if (normalizedSources.length === 0) {
      sourceList.classList.add("hidden");
      sourceEmpty.classList.remove("hidden");
      return;
    }

    for (const source of normalizedSources) {
      const item =
        document.createElement("article");

      item.className = "source-item";

      const name =
        source?.name ||
        source?.provider ||
        source?.title ||
        "Quelle";

      const title = createTextElement(
        "h3",
        "source-title",
        name
      );

      item.append(title);

      const metadata = [
        source?.retrieved_at
          ? `abgerufen ${formatDate(
              source.retrieved_at
            )}`
          : "",

        source?.verified_at
          ? `geprüft ${formatDate(
              source.verified_at
            )}`
          : ""
      ]
        .filter(Boolean)
        .join(" · ");

      if (metadata) {
        item.append(
          createTextElement(
            "p",
            "source-meta",
            metadata
          )
        );
      }

      const url = safeUrl(
        source?.url ??
        source?.source_url ??
        ""
      );

      if (url) {
        const link =
          document.createElement("a");

        link.className = "source-link";
        link.href = url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = "Quelle öffnen";

        item.append(link);
      }

      sourceList.append(item);
    }

    sourceEmpty.classList.add("hidden");
    sourceList.classList.remove("hidden");
  }

  function renderSightings(
    sightings,
    sightingsMeta
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

    sightingsList.replaceChildren();

    set(
      "sightingsCount",
      String(normalizedSightings.length)
    );

    set(
      "summarySightings",
      String(normalizedSightings.length)
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
            gallery.append(link);
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
      value(classification.ship_type)
    );

    set(
      "shipSubtype",
      value(classification.ship_subtype)
    );

    set(
      "flag",
      value(classification.flag)
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
      payload.sightings_meta
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
      reloadButton.disabled = false;
    }
  }

  reloadButton.addEventListener(
    "click",
    load
  );

  apiKey.addEventListener(
    "change",
    load
  );

  load();
});
