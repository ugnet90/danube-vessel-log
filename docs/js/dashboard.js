// Danube Vessel Log
// File: docs/js/dashboard.js
// Version: 0.14.0
// Updated: 2026-07-28

"use strict";

document.addEventListener(
  "DOMContentLoaded",
  () => {
    const byId =
      id => document.getElementById(id);

    const workerUrl = String(
      window.VesselConfig?.workerUrl ?? ""
    )
      .trim()
      .replace(/\/+$/, "");

    const apiKey =
      byId("apiKey");

    const reloadButton =
      byId("reloadButton");

    const pageStatus =
      byId("pageStatus");

    const taskList =
      byId("taskList");

    const noTasks =
      byId("noTasks");

    const recentVesselList =
      byId("recentVesselList");

    const recentVesselEmpty =
      byId("recentVesselEmpty");

    let loading = false;

    const vesselStatusLabels = {
      active: "Aktiv",
      inactive: "Inaktiv",
      scrapped: "Verschrottet",
      unknown: "Unbekannt"
    };

    function formatDateTime(value) {
      if (!value) {
        return "–";
      }

      const date =
        new Date(value);

      if (
        Number.isNaN(
          date.getTime()
        )
      ) {
        return String(value);
      }

      return new Intl.DateTimeFormat(
        "de-AT",
        {
          dateStyle: "medium",
          timeStyle: "short"
        }
      ).format(date);
    }

    function numberValue(value) {
      const number =
        Number(value);

      return Number.isFinite(number)
        ? number
        : 0;
    }

    function setPageStatus(
      text,
      type = ""
    ) {
      pageStatus.className =
        "dashboard-page-status";

      if (type) {
        pageStatus.classList.add(type);
      }

      pageStatus.textContent =
        text;
    }

    function setMetric(
      id,
      value
    ) {
      byId(id).textContent =
        String(value);
    }

    function createTask({
      count,
      title,
      description,
      href,
      tone = ""
    }) {
      const link =
        document.createElement("a");

      link.className =
        "dashboard-task-item";

      if (tone) {
        link.classList.add(tone);
      }

      link.href = href;

      const text =
        document.createElement("span");

      text.className =
        "dashboard-task-text";

      const heading =
        document.createElement("strong");

      heading.textContent =
        title;

      const detail =
        document.createElement("span");

      detail.textContent =
        description;

      text.append(
        heading,
        detail
      );

      const badge =
        document.createElement("span");

      badge.className =
        "dashboard-task-count";

      badge.textContent =
        String(count);

      link.append(
        text,
        badge
      );

      return link;
    }

    function renderTasks({
      openSubmissionCount,
      enrichmentSummary,
      dataComplete
    }) {
      taskList.replaceChildren();

      const tasks = [];

      if (
        openSubmissionCount !== null &&
        openSubmissionCount > 0
      ) {
        const countText =
          openSubmissionCount >= 100
            ? "Mindestens 100 Sichtungen"
            : (
                openSubmissionCount === 1
                  ? "1 Sichtung"
                  : `${openSubmissionCount} Sichtungen`
              );

        tasks.push({
          count:
            openSubmissionCount >= 100
              ? "100+"
              : openSubmissionCount,

          title:
            `${countText} warten auf Prüfung`,

          description:
            "Sichtung einem bestehenden oder neuen Schiff zuordnen.",

          href:
            "submissions.html"
        });
      }

      if (enrichmentSummary) {
        const candidates =
          numberValue(
            enrichmentSummary
              .candidate_matches
          );

        const lowConfidence =
          numberValue(
            enrichmentSummary
              .low_confidence
          );

        const lookupErrors =
          numberValue(
            enrichmentSummary
              .lookup_errors
          );

        if (candidates > 0) {
          tasks.push({
            count: candidates,

            title:
              candidates === 1
                ? "1 Wikidata-Kandidat prüfen"
                : `${candidates} Wikidata-Kandidaten prüfen`,

            description:
              "Vorgeschlagene Stammdaten kontrollieren und übernehmen.",

            href:
              "vessel_enrichment.html"
          });
        }

        if (lowConfidence > 0) {
          tasks.push({
            count: lowConfidence,

            title:
              lowConfidence === 1
                ? "1 unsicheren Treffer prüfen"
                : `${lowConfidence} unsichere Treffer prüfen`,

            description:
              "Die technische Übereinstimmung reicht noch nicht aus.",

            href:
              "vessel_enrichment.html",

            tone:
              "warning"
          });
        }

        if (lookupErrors > 0) {
          tasks.push({
            count: lookupErrors,

            title:
              lookupErrors === 1
                ? "1 Anreicherungsfehler prüfen"
                : `${lookupErrors} Anreicherungsfehler prüfen`,

            description:
              "Mindestens eine Wikidata-Abfrage ist fehlgeschlagen.",

            href:
              "vessel_enrichment.html",

            tone:
              "error"
          });
        }
      }

      for (const task of tasks) {
        taskList.append(
          createTask(task)
        );
      }

      noTasks.classList.toggle(
        "hidden",
        tasks.length > 0
      );

      if (
        tasks.length === 0 &&
        !dataComplete
      ) {
        noTasks.textContent =
          "Die offenen Aufgaben konnten nicht vollständig ermittelt werden.";
      } else {
        noTasks.textContent =
          "Keine offenen Aufgaben.";
      }
    }

    function renderRecentVessels(
      vessels
    ) {
      recentVesselList
        .replaceChildren();

      const sorted = [...vessels]
        .sort((left, right) => {
          const leftTime =
            Date.parse(
              left.updated_at ?? ""
            ) || 0;

          const rightTime =
            Date.parse(
              right.updated_at ?? ""
            ) || 0;

          if (
            leftTime !== rightTime
          ) {
            return rightTime - leftTime;
          }

          return String(
            right.vessel_id ?? ""
          ).localeCompare(
            String(
              left.vessel_id ?? ""
            )
          );
        })
        .slice(0, 6);

      recentVesselEmpty.classList.toggle(
        "hidden",
        sorted.length > 0
      );

      for (const vessel of sorted) {
        const link =
          document.createElement("a");

        link.className =
          "dashboard-vessel-row";

        link.href =
          "vessel.html?id=" +
          encodeURIComponent(
            vessel.vessel_id
          );

        const main =
          document.createElement("span");

        main.className =
          "dashboard-vessel-main";

        const name =
          document.createElement("strong");

        name.textContent =
          vessel.name ||
          vessel.vessel_id;

        const identity =
          document.createElement("span");

        identity.textContent =
          [
            vessel.vessel_id,
            vessel.operator
          ]
            .filter(Boolean)
            .join(" · ");

        main.append(
          name,
          identity
        );

        const meta =
          document.createElement("span");

        meta.className =
          "dashboard-vessel-meta";

        const status =
          document.createElement("span");

        status.className =
          "dashboard-vessel-status";

        const normalizedStatus =
          vessel.status ||
          "unknown";

        status.classList.add(
          normalizedStatus
        );

        status.textContent =
          vesselStatusLabels[
            normalizedStatus
          ] ??
          normalizedStatus;

        const updated =
          document.createElement("span");

        updated.textContent =
          formatDateTime(
            vessel.updated_at
          );

        meta.append(
          status,
          updated
        );

        link.append(
          main,
          meta
        );

        recentVesselList.append(
          link
        );
      }
    }

    function renderRecentVesselError() {
      recentVesselList
        .replaceChildren();

      recentVesselEmpty.textContent =
        "Die Schiffsliste konnte nicht geladen werden.";

      recentVesselEmpty.classList.remove(
        "hidden"
      );
    }

    async function loadEnrichmentReport() {
      const response = await fetch(
        "data/vessel_enrichment.json?" +
        `ts=${Date.now()}`,
        {
          cache: "no-store"
        }
      );

      if (!response.ok) {
        throw new Error(
          "Anreicherungsreport: " +
          `HTTP ${response.status}`
        );
      }

      const report =
        await response.json();

      if (
        !report ||
        !Array.isArray(
          report.vessels
        )
      ) {
        throw new Error(
          "Der Anreicherungsreport hat nicht das erwartete Format."
        );
      }

      return report;
    }

    async function loadDashboard() {
      if (loading) {
        return;
      }

      loading = true;
      reloadButton.disabled = true;

      setPageStatus(
        "Übersicht wird geladen …"
      );

      const suppliedApiKey =
        apiKey.value.trim();

      const [
        vesselResult,
        submissionResult,
        enrichmentResult
      ] = await Promise.allSettled([
        window.VesselApi.getVessels({
          workerUrl,
          apiKey:
            suppliedApiKey
        }),

        window.VesselApi.request({
          workerUrl,

          path:
            "/review-submissions" +
            "?status=new&limit=100",

          apiKey:
            suppliedApiKey
        }),

        loadEnrichmentReport()
      ]);

      const errors = [];
      let workerSuccesses = 0;

      let productionVessels = [];
      let openSubmissionCount = null;
      let enrichmentSummary = null;

      if (
        vesselResult.status ===
        "fulfilled"
      ) {
        workerSuccesses += 1;

        const vessels =
          Array.isArray(
            vesselResult
              .value
              .data
              ?.vessels
          )
            ? vesselResult
                .value
                .data
                .vessels
            : [];

        productionVessels =
          vessels.filter(
            vessel =>
              vessel.environment !==
              "test"
          );

        const activeCount =
          productionVessels.filter(
            vessel =>
              vessel.status ===
              "active"
          ).length;

        setMetric(
          "vesselCount",
          productionVessels.length
        );

        setMetric(
          "activeVesselCount",
          activeCount
        );

        renderRecentVessels(
          productionVessels
        );
      } else {
        setMetric(
          "vesselCount",
          "–"
        );

        setMetric(
          "activeVesselCount",
          "–"
        );

        renderRecentVesselError();

        errors.push(
          vesselResult.reason
            ?.message ||
          "Schiffsliste nicht erreichbar"
        );
      }

      if (
        submissionResult.status ===
        "fulfilled"
      ) {
        workerSuccesses += 1;

        openSubmissionCount =
          numberValue(
            submissionResult
              .value
              .data
              ?.count
          );

        setMetric(
          "openSubmissionCount",
          openSubmissionCount >= 100
            ? "100+"
            : openSubmissionCount
        );
      } else {
        setMetric(
          "openSubmissionCount",
          "–"
        );

        errors.push(
          submissionResult.reason
            ?.message ||
          "Sichtungen nicht erreichbar"
        );
      }

      if (
        enrichmentResult.status ===
        "fulfilled"
      ) {
        const report =
          enrichmentResult.value;

        enrichmentSummary =
          report.summary ?? {};

        const actionCount =
          numberValue(
            enrichmentSummary
              .candidate_matches
          ) +
          numberValue(
            enrichmentSummary
              .low_confidence
          ) +
          numberValue(
            enrichmentSummary
              .lookup_errors
          );

        setMetric(
          "enrichmentActionCount",
          actionCount
        );

        byId(
          "enrichmentState"
        ).textContent =
          report.generated_at
            ? formatDateTime(
                report.generated_at
              )
            : "Noch nicht erstellt";

        byId(
          "reportMode"
        ).textContent =
          report.mode === "offline"
            ? "Nur Fehlstellenreport"
            : "Wikidata-Abfrage";
      } else {
        setMetric(
          "enrichmentActionCount",
          "–"
        );

        byId(
          "enrichmentState"
        ).textContent =
          "Nicht erreichbar";

        byId(
          "reportMode"
        ).textContent =
          "–";

        errors.push(
          enrichmentResult.reason
            ?.message ||
          "Anreicherungsreport nicht erreichbar"
        );
      }

      renderTasks({
        openSubmissionCount,
        enrichmentSummary,

        dataComplete:
          openSubmissionCount !== null &&
          enrichmentSummary !== null
      });

      byId(
        "workerState"
      ).textContent =
        workerSuccesses === 2
          ? "Erreichbar"
          : workerSuccesses === 1
            ? "Teilweise erreichbar"
            : "Nicht erreichbar";

      byId(
        "loadedAt"
      ).textContent =
        formatDateTime(
          new Date().toISOString()
        );

      if (errors.length === 0) {
        setPageStatus(
          "Übersicht wurde aktualisiert.",
          "success"
        );
      } else if (
        workerSuccesses > 0 ||
        enrichmentResult.status ===
          "fulfilled"
      ) {
        setPageStatus(
          "Übersicht teilweise geladen: " +
          errors.join(" · "),
          "warning"
        );
      } else {
        setPageStatus(
          errors.join(" · "),
          "error"
        );
      }

      reloadButton.disabled = false;
      loading = false;
    }

    reloadButton.addEventListener(
      "click",
      loadDashboard
    );

    apiKey.addEventListener(
      "change",
      loadDashboard
    );

    loadDashboard();
  }
);
