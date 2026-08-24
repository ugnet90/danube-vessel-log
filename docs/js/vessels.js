// Danube Vessel Log
// File: docs/js/vessels.js
// Version: 0.15.2
// Updated: 2026-08-24

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
  const sortHeaders = [...document.querySelectorAll("[data-sort-key]")];
  const collator = new Intl.Collator("de-AT", {
    numeric: true,
    sensitivity: "base"
  });

  let vessels = [];
  let sortKey = "vessel_id";
  let sortDirection = 1;

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

  function sortValue(vessel, key) {
    if (key === "status") return labelStatus(vessel.status);
    if (["year_built", "sighting_count", "photo_count"].includes(key)) {
      const rawValue = vessel?.[key];
      if (rawValue === null || rawValue === undefined || rawValue === "") return null;
      const number = Number(rawValue);
      if (key === "year_built") {
        return Number.isFinite(number) && number > 0 ? number : null;
      }
      return Number.isFinite(number) && number >= 0 ? number : null;
    }
    return String(vessel?.[key] ?? "").trim();
  }

  function compareVessels(left, right) {
    const leftValue = sortValue(left, sortKey);
    const rightValue = sortValue(right, sortKey);
    const leftMissing = leftValue === null || leftValue === "";
    const rightMissing = rightValue === null || rightValue === "";

    if (leftMissing && rightMissing) return collator.compare(left.vessel_id, right.vessel_id);
    if (leftMissing) return 1;
    if (rightMissing) return -1;

    let comparison;
    if (["year_built", "sighting_count", "photo_count"].includes(sortKey)) {
      comparison = leftValue - rightValue;
    } else {
      comparison = collator.compare(String(leftValue), String(rightValue));
    }

    if (comparison === 0 && sortKey !== "vessel_id") {
      comparison = collator.compare(left.vessel_id, right.vessel_id);
    }

    return comparison * sortDirection;
  }

  function updateSortHeaders() {
    for (const header of sortHeaders) {
      const key = header.dataset.sortKey;
      const active = key === sortKey;
      header.setAttribute(
        "aria-sort",
        active
          ? (sortDirection === 1 ? "ascending" : "descending")
          : "none"
      );
      header.classList.toggle("is-sorted", active);
      const indicator = header.querySelector(".sort-indicator");
      if (indicator) indicator.textContent = active ? (sortDirection === 1 ? "↑" : "↓") : "↕";
    }
  }

  function setSort(nextKey) {
    if (nextKey === sortKey) sortDirection *= -1;
    else {
      sortKey = nextKey;
      sortDirection = 1;
    }
    updateSortHeaders();
    render();
  }

  function openVessel(vesselId) {
    window.location.href = `vessel.html?id=${encodeURIComponent(vesselId)}`;
  }

  function render() {
    const filtered = vessels.filter(matches).sort(compareVessels);
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
      const countValue = value => {
        if (value === null || value === undefined || value === "") return "–";
        const number = Number(value);
        return Number.isFinite(number) && number >= 0
          ? String(number)
          : "–";
      };

      const values = [
        { value: countValue(vessel.sighting_count), numeric: true },
        { value: countValue(vessel.photo_count), numeric: true },
        { value: vessel.ship_type || "–" },
        { value: vessel.operator || "–" },
        { value: vessel.flag || "–" },
        { value: vessel.year_built || "–" },
        { value: labelStatus(vessel.status) }
      ];

      row.append(idCell, nameCell, ...values.map(item => {
        const cell = document.createElement("td");
        cell.textContent = item.value;
        if (item.numeric) cell.className = "numeric-column";
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
      updateSortHeaders();
      render();
      listStatus.textContent = response.data?.stats_warning || "";
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
  for (const header of sortHeaders) {
    header.querySelector("button")?.addEventListener("click", () => setSort(header.dataset.sortKey));
  }

  updateSortHeaders();
  load();
});
