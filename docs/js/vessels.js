"use strict";

document.addEventListener("DOMContentLoaded", () => {
  const byId = id => document.getElementById(id);
  const workerUrl = String(window.VesselConfig?.workerUrl ?? "").trim().replace(/\/+$/, "");

  const apiKey = byId("apiKey");
  const reloadButton = byId("reloadButton");
  const searchInput = byId("searchInput");
  const typeFilter = byId("typeFilter");
  const flagFilter = byId("flagFilter");
  const statusFilter = byId("statusFilter");
  const showTestData = byId("showTestData");
  const vesselRows = byId("vesselRows");
  const resultCount = byId("resultCount");
  const listStatus = byId("listStatus");
  const emptyState = byId("emptyState");

  let vessels = [];

  function normalize(value) {
    return String(value ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("de");
  }

  function labelStatus(value) {
    return ({ active: "Aktiv", inactive: "Inaktiv", scrapped: "Verschrottet", unknown: "Unbekannt" })[value] || value || "–";
  }

  function fillSelect(select, values, formatter = value => value) {
    const selected = select.value;
    select.replaceChildren(new Option("Alle", ""));
    for (const value of [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, "de"))) {
      select.add(new Option(formatter(value), value));
    }
    if ([...select.options].some(option => option.value === selected)) select.value = selected;
  }

  function refreshFilters() {
    const production = vessels.filter(vessel => vessel.environment !== "test");
    const source = showTestData.checked ? vessels : production;
    fillSelect(typeFilter, source.map(vessel => vessel.ship_type));
    fillSelect(flagFilter, source.map(vessel => vessel.flag));
    fillSelect(statusFilter, source.map(vessel => vessel.status), labelStatus);
  }

  function matches(vessel) {
    if (!showTestData.checked && vessel.environment === "test") return false;
    if (typeFilter.value && vessel.ship_type !== typeFilter.value) return false;
    if (flagFilter.value && vessel.flag !== flagFilter.value) return false;
    if (statusFilter.value && vessel.status !== statusFilter.value) return false;

    const query = normalize(searchInput.value.trim());
    if (!query) return true;

    const haystack = normalize([
      vessel.vessel_id,
      vessel.name,
      vessel.former_names,
      vessel.mmsi,
      vessel.imo,
      vessel.eni,
      vessel.callsign,
      vessel.ship_type,
      vessel.ship_subtype,
      vessel.operator,
      vessel.cruise_brand,
      vessel.flag
    ].join(" "));

    return haystack.includes(query);
  }

  function openVessel(vesselId) {
    window.location.href = `vessel.html?id=${encodeURIComponent(vesselId)}`;
  }

  function render() {
    const filtered = vessels.filter(matches);
    vesselRows.replaceChildren();

    for (const vessel of filtered) {
      const row = document.createElement("tr");
      row.className = "vessel-row";
      row.tabIndex = 0;
      row.setAttribute("role", "link");
      row.setAttribute("aria-label", `${vessel.vessel_id} ${vessel.name} öffnen`);
      row.addEventListener("click", () => openVessel(vessel.vessel_id));
      row.addEventListener("keydown", event => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openVessel(vessel.vessel_id);
        }
      });

      const idCell = document.createElement("td");
      const id = document.createElement("span");
      id.className = "vessel-id";
      id.textContent = vessel.vessel_id;
      idCell.appendChild(id);
      if (vessel.environment === "test") {
        const badge = document.createElement("span");
        badge.className = "badge test";
        badge.textContent = "Test";
        idCell.appendChild(badge);
      }

      const nameCell = document.createElement("td");
      const name = document.createElement("span");
      name.className = "vessel-name";
      name.textContent = vessel.name || "–";
      nameCell.appendChild(name);
      if (vessel.former_names) {
        const former = document.createElement("span");
        former.className = "vessel-former-names";
        former.textContent = `früher: ${vessel.former_names.split("|").join(", ")}`;
        nameCell.appendChild(former);
      }

      const values = [
        vessel.ship_type || "–",
        vessel.operator || "–",
        vessel.flag || "–",
        vessel.year_built || "–",
        labelStatus(vessel.status)
      ];

      row.append(idCell, nameCell, ...values.map(value => {
        const cell = document.createElement("td");
        cell.textContent = value;
        return cell;
      }));
      vesselRows.appendChild(row);
    }

    resultCount.textContent = `${filtered.length} von ${vessels.length} Schiffen`;
    emptyState.classList.toggle("hidden", filtered.length !== 0);
  }

  async function load() {
    reloadButton.disabled = true;
    listStatus.className = "list-status";
    listStatus.textContent = "Schiffsliste wird geladen …";

    try {
      const response = await window.VesselApi.getVessels({
        workerUrl,
        apiKey: apiKey.value
      });
      vessels = Array.isArray(response.data?.vessels) ? response.data.vessels : [];
      refreshFilters();
      render();
      listStatus.textContent = "";
    } catch (error) {
      vessels = [];
      render();
      listStatus.className = "list-status error";
      listStatus.textContent = error instanceof Error ? error.message : String(error);
    } finally {
      reloadButton.disabled = false;
    }
  }

  reloadButton.addEventListener("click", load);
  apiKey.addEventListener("change", load);
  searchInput.addEventListener("input", render);
  for (const select of [typeFilter, flagFilter, statusFilter]) select.addEventListener("change", render);
  showTestData.addEventListener("change", () => { refreshFilters(); render(); });

  load();
});
