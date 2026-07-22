"use strict";

document.addEventListener("DOMContentLoaded", () => {
  const byId = id => document.getElementById(id);
  const workerUrl = String(window.VesselConfig?.workerUrl ?? "").trim().replace(/\/+$/, "");
  const vesselId = new URLSearchParams(window.location.search).get("id")?.trim() || "";
  const apiKey = byId("apiKey");
  const reloadButton = byId("reloadButton");
  const pageStatus = byId("pageStatus");
  const content = byId("vesselContent");

  function value(value, suffix = "") {
    return value === null || value === undefined || value === "" ? "–" : `${value}${suffix}`;
  }

  function dateTime(valueText) {
    if (!valueText) return "–";
    const date = new Date(valueText);
    return Number.isNaN(date.getTime()) ? valueText : new Intl.DateTimeFormat("de-AT", { dateStyle: "medium", timeStyle: "short" }).format(date);
  }

  function set(id, text) { byId(id).textContent = text; }
  function statusLabel(status) { return ({ active: "Aktiv", inactive: "Inaktiv", scrapped: "Verschrottet", unknown: "Unbekannt" })[status] || value(status); }

  function render(payload) {
    const vessel = payload.vessel || {};
    const identity = vessel.identity || {};
    const classification = vessel.classification || {};
    const technical = vessel.technical || {};
    const operations = vessel.operations || {};
    const enrichment = vessel.enrichment || {};
    const audit = vessel.audit || {};

    document.title = `${identity.name || vesselId} – Schiff`;
    set("breadcrumbId", vesselId);
    set("vesselName", identity.name || vesselId);
    set("vesselSubtitle", [classification.ship_type, operations.operator].filter(Boolean).join(" · "));
    set("vesselId", vesselId);
    set("identityName", value(identity.name));
    set("formerNames", Array.isArray(identity.former_names) && identity.former_names.length ? identity.former_names.join(", ") : "–");
    set("mmsi", value(identity.mmsi)); set("imo", value(identity.imo)); set("eni", value(identity.eni)); set("callSign", value(identity.call_sign));
    set("shipType", value(classification.ship_type)); set("shipSubtype", value(classification.ship_subtype)); set("flag", value(classification.flag)); set("status", statusLabel(classification.status));
    set("yearBuilt", value(technical.year_built)); set("shipyard", value(technical.shipyard)); set("lengthM", value(technical.length_m, technical.length_m == null || technical.length_m === "" ? "" : " m")); set("widthM", value(technical.width_m, technical.width_m == null || technical.width_m === "" ? "" : " m")); set("draftM", value(technical.draft_m, technical.draft_m == null || technical.draft_m === "" ? "" : " m")); set("passengers", value(technical.passengers));
    set("operator", value(operations.operator)); set("owner", value(operations.owner)); set("manager", value(operations.manager)); set("cruiseBrand", value(operations.cruise_brand)); set("homePort", value(operations.home_port));
    set("enrichmentStatus", value(enrichment.status)); set("enrichmentDate", dateTime(enrichment.last_run_at)); set("sourceCount", String(Array.isArray(vessel.sources) ? vessel.sources.length : 0)); set("createdAt", dateTime(audit.created_at)); set("updatedAt", dateTime(audit.updated_at)); set("jsonPath", value(payload.path)); set("notes", value(vessel.notes));

    const badge = byId("environmentBadge");
    const isTest = audit.environment === "test" || Number(vesselId.slice(4)) < 100;
    badge.classList.toggle("hidden", !isTest);
    badge.textContent = "Testdatensatz";
    content.classList.remove("hidden");
  }

  async function load() {
    if (!/^VES-\d{6}$/.test(vesselId)) {
      pageStatus.className = "page-status error";
      pageStatus.textContent = "Die URL enthält keine gültige Vessel-ID.";
      reloadButton.disabled = true;
      return;
    }

    reloadButton.disabled = true;
    pageStatus.className = "page-status";
    pageStatus.textContent = "Schiff wird geladen …";
    content.classList.add("hidden");

    try {
      const response = await window.VesselApi.getVessel({ workerUrl, apiKey: apiKey.value, vesselId });
      render(response.data);
      pageStatus.textContent = "";
    } catch (error) {
      pageStatus.className = "page-status error";
      pageStatus.textContent = error instanceof Error ? error.message : String(error);
    } finally {
      reloadButton.disabled = false;
    }
  }

  reloadButton.addEventListener("click", load);
  apiKey.addEventListener("change", load);
  load();
});
