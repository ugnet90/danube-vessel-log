// Danube Vessel Log
// File: docs/js/vessel_reference.js
// Version: 0.13.5
// Updated: 2026-07-27

"use strict";

(() => {
  const REFERENCE_BASE_PATH =
    "data/reference";

  const FLAG_IMAGE_BASE_URL =
    "https://flagcdn.com";  

  const state = {
    loadPromise: null,
    loaded: false,

    flags: [],
    flagByCode: new Map(),

    shipTypes: [],
    shipTypeByCode: new Map(),
    shipTypeAliases: new Map(),

    subtypesByType: new Map(),
    subtypeAliasesByType: new Map(),

    sourceProviders: [],
    sourceProviderAliases: new Map(),

    sourceFields: [],
    sourceFieldByPath: new Map(),

    defaultTypeCode: "UNKNOWN",
    defaultSubtypeCode: "UNKNOWN"
  };

  function aliasKey(value) {
    return String(value ?? "")
      .trim()
      .toLocaleLowerCase("de-AT")
      .replace(/ß/g, "ss")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  async function fetchJson(filename) {
    const response = await fetch(
      `${REFERENCE_BASE_PATH}/${filename}`,
      {
        cache: "no-store"
      }
    );

    if (!response.ok) {
      throw new Error(
        `${filename} konnte nicht geladen werden ` +
        `(HTTP ${response.status}).`
      );
    }

    try {
      return await response.json();
    } catch {
      throw new Error(
        `${filename} enthält kein gültiges JSON.`
      );
    }
  }

  function registerAlias(
    map,
    alias,
    value,
    description
  ) {
    const normalizedAlias =
      aliasKey(alias);

    if (!normalizedAlias) {
      return;
    }

    const existingValue =
      map.get(normalizedAlias);

    if (
      existingValue &&
      existingValue !== value
    ) {
      throw new Error(
        `Doppelter Alias „${alias}“ bei ${description}.`
      );
    }

    map.set(
      normalizedAlias,
      value
    );
  }

  function buildFlags(documentData) {
    if (
      !Array.isArray(
        documentData?.countries
      )
    ) {
      throw new Error(
        "flags.json: countries fehlt."
      );
    }

    const countryByCode =
      new Map();

    for (
      const country
      of documentData.countries
    ) {
      const code =
        String(country?.code ?? "")
          .trim()
          .toUpperCase();

      const name =
        String(country?.name ?? "")
          .trim();

      if (
        !/^[A-Z]{2}$/.test(code) ||
        !name
      ) {
        throw new Error(
          "flags.json enthält einen ungültigen Ländereintrag."
        );
      }

      if (countryByCode.has(code)) {
        throw new Error(
          `flags.json enthält den Code ${code} doppelt.`
        );
      }

      countryByCode.set(
        code,
        {
          code,
          name
        }
      );
    }

    const preferredCodes =
      Array.isArray(
        documentData.preferred_codes
      )
        ? documentData.preferred_codes
            .map(code =>
              String(code)
                .trim()
                .toUpperCase()
            )
            .filter(code =>
              countryByCode.has(code)
            )
        : [];

    const preferredSet =
      new Set(preferredCodes);

    const preferredCountries =
      preferredCodes.map(
        code =>
          countryByCode.get(code)
      );

    const remainingCountries = [
      ...countryByCode.values()
    ]
      .filter(
        country =>
          !preferredSet.has(
            country.code
          )
      )
      .sort(
        (left, right) =>
          left.name.localeCompare(
            right.name,
            "de-AT"
          )
      );

    state.flags = [
      ...preferredCountries,
      ...remainingCountries
    ];

    state.flagByCode =
      countryByCode;
  }

  function buildClassification(
    documentData
  ) {
    if (
      !Array.isArray(
        documentData?.types
      )
    ) {
      throw new Error(
        "vessel_classification.json: types fehlt."
      );
    }

    state.defaultTypeCode =
      String(
        documentData.default_type_code ??
        "UNKNOWN"
      )
        .trim()
        .toUpperCase();

    state.defaultSubtypeCode =
      String(
        documentData.default_subtype_code ??
        "UNKNOWN"
      )
        .trim()
        .toUpperCase();

    const shipTypes = [];
    const typeByCode = new Map();
    const typeAliases = new Map();
    const subtypesByType = new Map();
    const subtypeAliasesByType =
      new Map();

    for (
      const type
      of documentData.types
    ) {
      const typeCode =
        String(type?.code ?? "")
          .trim()
          .toUpperCase();

      const typeLabel =
        String(type?.label ?? "")
          .trim();

      if (
        !/^[A-Z0-9_]+$/.test(
          typeCode
        ) ||
        !typeLabel
      ) {
        throw new Error(
          "vessel_classification.json enthält einen ungültigen Schiffstyp."
        );
      }

      if (typeByCode.has(typeCode)) {
        throw new Error(
          `Schiffstyp ${typeCode} ist doppelt vorhanden.`
        );
      }

      const normalizedType = {
        code: typeCode,
        label: typeLabel
      };

      shipTypes.push(
        normalizedType
      );

      typeByCode.set(
        typeCode,
        normalizedType
      );

      registerAlias(
        typeAliases,
        typeCode,
        typeCode,
        "Schiffstypen"
      );

      registerAlias(
        typeAliases,
        typeLabel,
        typeCode,
        "Schiffstypen"
      );

      for (
        const alias
        of Array.isArray(type.aliases)
          ? type.aliases
          : []
      ) {
        registerAlias(
          typeAliases,
          alias,
          typeCode,
          "Schiffstypen"
        );
      }

      const normalizedSubtypes = [];
      const subtypeAliases =
        new Map();

      if (
        !Array.isArray(
          type.subtypes
        )
      ) {
        throw new Error(
          `Schiffstyp ${typeCode} enthält keine Untertypen.`
        );
      }

      const seenSubtypeCodes =
        new Set();

      for (
        const subtype
        of type.subtypes
      ) {
        const subtypeCode =
          String(subtype?.code ?? "")
            .trim()
            .toUpperCase();

        const subtypeLabel =
          String(subtype?.label ?? "")
            .trim();

        if (
          !/^[A-Z0-9_]+$/.test(
            subtypeCode
          ) ||
          !subtypeLabel
        ) {
          throw new Error(
            `Schiffstyp ${typeCode} enthält einen ungültigen Untertyp.`
          );
        }

        if (
          seenSubtypeCodes.has(
            subtypeCode
          )
        ) {
          throw new Error(
            `Untertyp ${subtypeCode} ist bei ${typeCode} doppelt vorhanden.`
          );
        }

        seenSubtypeCodes.add(
          subtypeCode
        );

        normalizedSubtypes.push({
          code: subtypeCode,
          label: subtypeLabel
        });

        registerAlias(
          subtypeAliases,
          subtypeCode,
          subtypeCode,
          `Untertypen von ${typeCode}`
        );

        registerAlias(
          subtypeAliases,
          subtypeLabel,
          subtypeCode,
          `Untertypen von ${typeCode}`
        );

        for (
          const alias
          of Array.isArray(
            subtype.aliases
          )
            ? subtype.aliases
            : []
        ) {
          registerAlias(
            subtypeAliases,
            alias,
            subtypeCode,
            `Untertypen von ${typeCode}`
          );
        }
      }

      subtypesByType.set(
        typeCode,
        normalizedSubtypes
      );

      subtypeAliasesByType.set(
        typeCode,
        subtypeAliases
      );
    }

    if (
      !typeByCode.has(
        state.defaultTypeCode
      )
    ) {
      throw new Error(
        "Der Standard-Schiffstyp ist nicht definiert."
      );
    }

    state.shipTypes =
      shipTypes;

    state.shipTypeByCode =
      typeByCode;

    state.shipTypeAliases =
      typeAliases;

    state.subtypesByType =
      subtypesByType;

    state.subtypeAliasesByType =
      subtypeAliasesByType;
  }

  function buildSourceReference(
    documentData
  ) {
    if (
      !Array.isArray(
        documentData?.providers
      ) ||
      !Array.isArray(
        documentData?.fields
      )
    ) {
      throw new Error(
        "source_reference.json ist unvollständig."
      );
    }

    const providers = [];
    const providerAliases =
      new Map();

    for (
      const provider
      of documentData.providers
    ) {
      const value =
        String(provider?.value ?? "")
          .trim();

      const label =
        String(
          provider?.label ??
          provider?.value ??
          ""
        )
          .trim();

      if (!value || !label) {
        throw new Error(
          "source_reference.json enthält einen ungültigen Anbieter."
        );
      }

      if (
        providers.some(
          item =>
            item.value === value
        )
      ) {
        throw new Error(
          `Quellenanbieter ${value} ist doppelt vorhanden.`
        );
      }

      providers.push({
        value,
        label
      });

      registerAlias(
        providerAliases,
        value,
        value,
        "Quellenanbietern"
      );

      registerAlias(
        providerAliases,
        label,
        value,
        "Quellenanbietern"
      );

      for (
        const alias
        of Array.isArray(
          provider.aliases
        )
          ? provider.aliases
          : []
      ) {
        registerAlias(
          providerAliases,
          alias,
          value,
          "Quellenanbietern"
        );
      }
    }

    const fields = [];
    const fieldByPath =
      new Map();

    for (
      const field
      of documentData.fields
    ) {
      const path =
        String(field?.path ?? "")
          .trim();

      const label =
        String(field?.label ?? "")
          .trim();

      if (!path || !label) {
        throw new Error(
          "source_reference.json enthält ein ungültiges Feld."
        );
      }

      if (fieldByPath.has(path)) {
        throw new Error(
          `Quellenfeld ${path} ist doppelt vorhanden.`
        );
      }

      const normalizedField = {
        path,
        label,
        selectable:
          field.selectable !== false
      };

      fields.push(
        normalizedField
      );

      fieldByPath.set(
        path,
        normalizedField
      );
    }

    state.sourceProviders =
      providers;

    state.sourceProviderAliases =
      providerAliases;

    state.sourceFields =
      fields;

    state.sourceFieldByPath =
      fieldByPath;
  }

  async function load() {
    if (state.loaded) {
      return;
    }

    if (state.loadPromise) {
      return state.loadPromise;
    }

    state.loadPromise =
      (async () => {
        const [
          flagsDocument,
          classificationDocument,
          sourceDocument
        ] = await Promise.all([
          fetchJson("flags.json"),
          fetchJson(
            "vessel_classification.json"
          ),
          fetchJson(
            "source_reference.json"
          )
        ]);

        buildFlags(
          flagsDocument
        );

        buildClassification(
          classificationDocument
        );

        buildSourceReference(
          sourceDocument
        );

        state.loaded = true;

        enhanceFlagRendering(
          document
        );        
      })();

    try {
      await state.loadPromise;
    } catch (error) {
      state.loadPromise = null;
      throw error;
    }
  }

  function ensureLoaded() {
    if (!state.loaded) {
      throw new Error(
        "Die Vessel-Referenzdaten wurden noch nicht geladen."
      );
    }
  }

  function getFlags() {
    ensureLoaded();

    return state.flags.map(
      flag => ({ ...flag })
    );
  }

  function getShipTypes() {
    ensureLoaded();

    return state.shipTypes.map(
      type => ({ ...type })
    );
  }

  function getShipSubtypes(
    typeValue
  ) {
    ensureLoaded();

    const typeCode =
      canonicalShipType(
        typeValue
      ) ||
      state.defaultTypeCode;

    return (
      state.subtypesByType.get(
        typeCode
      ) ?? []
    ).map(
      subtype => ({
        ...subtype
      })
    );
  }

  function getSourceProviders() {
    ensureLoaded();

    return state.sourceProviders.map(
      provider => ({
        ...provider
      })
    );
  }

  function getSourceFields() {
    ensureLoaded();

    return state.sourceFields
      .filter(
        field =>
          field.selectable
      )
      .map(
        field => ({
          ...field
        })
      );
  }

  function canonicalShipType(
    value
  ) {
    ensureLoaded();

    const raw =
      String(value ?? "").trim();

    if (!raw) {
      return state.defaultTypeCode;
    }

    const upper =
      raw.toUpperCase();

    if (
      state.shipTypeByCode.has(
        upper
      )
    ) {
      return upper;
    }

    return (
      state.shipTypeAliases.get(
        aliasKey(raw)
      ) || ""
    );
  }

  function canonicalShipSubtype(
    typeValue,
    subtypeValue
  ) {
    ensureLoaded();

    const typeCode =
      canonicalShipType(
        typeValue
      );

    if (!typeCode) {
      return "";
    }

    const raw =
      String(
        subtypeValue ?? ""
      ).trim();

    if (!raw) {
      return state.defaultSubtypeCode;
    }

    const aliases =
      state.subtypeAliasesByType.get(
        typeCode
      );

    if (!aliases) {
      return "";
    }

    return (
      aliases.get(
        aliasKey(raw)
      ) || ""
    );
  }

  function shipTypeLabel(value) {
    ensureLoaded();

    const raw =
      String(value ?? "").trim();

    if (!raw) {
      return "–";
    }

    const typeCode =
      canonicalShipType(raw);

    return (
      state.shipTypeByCode.get(
        typeCode
      )?.label ||
      raw
    );
  }

  function shipSubtypeLabel(
    subtypeValue,
    typeValue
  ) {
    ensureLoaded();

    const raw =
      String(
        subtypeValue ?? ""
      ).trim();

    if (!raw) {
      return "–";
    }

    const typeCode =
      canonicalShipType(
        typeValue
      );

    const subtypeCode =
      canonicalShipSubtype(
        typeCode,
        raw
      );

    const subtypes =
      state.subtypesByType.get(
        typeCode
      ) ?? [];

    return (
      subtypes.find(
        subtype =>
          subtype.code ===
          subtypeCode
      )?.label ||
      raw
    );
  }

  function normalizeFlagCode(code) {
    const normalized =
      String(code ?? "")
        .trim()
        .toUpperCase();

    return /^[A-Z]{2}$/.test(
      normalized
    )
      ? normalized
      : "";
  }

  function flagEmoji(code) {
    const normalized =
      normalizeFlagCode(code);

    if (!normalized) {
      return "";
    }

    return String.fromCodePoint(
      ...[...normalized].map(
        character =>
          127397 +
          character.charCodeAt(0)
      )
    );
  }

  function flagLabel(code) {
    ensureLoaded();

    const raw =
      String(code ?? "")
        .trim();

    if (!raw) {
      return "–";
    }

    const normalized =
      normalizeFlagCode(raw);

    if (!normalized) {
      return raw;
    }

    const country =
      state.flagByCode.get(
        normalized
      );

    return country
      ? `${country.name} (${normalized})`
      : normalized;
  }

  function flagImageUrl(code) {
    const normalized =
      normalizeFlagCode(code);

    return normalized
      ? `${FLAG_IMAGE_BASE_URL}/` +
        `${normalized.toLowerCase()}.svg`
      : "";
  }

  function createFlagElement(
    code,
    options = {}
  ) {
    ensureLoaded();

    const raw =
      String(code ?? "")
        .trim();

    const normalized =
      normalizeFlagCode(raw);

    const wrapper =
      document.createElement("span");

    wrapper.className =
      "vessel-flag-display";

    wrapper.style.display =
      "inline-flex";

    wrapper.style.alignItems =
      "center";

    wrapper.style.gap =
      "0.4em";

    wrapper.style.verticalAlign =
      "middle";

    if (!normalized) {
      wrapper.textContent =
        raw || "–";

      return wrapper;
    }

    const country =
      state.flagByCode.get(
        normalized
      );

    const image =
      document.createElement("img");

    image.className =
      "vessel-flag-image";

    image.src =
      flagImageUrl(normalized);

    image.alt = country
      ? `Flagge ${country.name}`
      : `Flagge ${normalized}`;

    image.width = 20;
    image.loading = "lazy";
    image.decoding = "async";

    image.referrerPolicy =
      "no-referrer";

    image.style.display =
      "block";

    image.style.width =
      "20px";

    image.style.height =
      "auto";

    image.style.maxHeight =
      "15px";

    image.style.border =
      "1px solid rgba(0, 0, 0, 0.18)";

    image.style.borderRadius =
      "1px";

    image.addEventListener(
      "error",
      () => image.remove(),
      { once: true }
    );

    const text =
      document.createElement("span");

    text.textContent =
      options.showLabel === false
        ? normalized
        : flagLabel(normalized);

    wrapper.append(
      image,
      text
    );

    return wrapper;
  }

  function renderFlag(
    target,
    code,
    options = {}
  ) {
    ensureLoaded();

    const element =
      typeof target === "string"
        ? document.getElementById(
            target
          )
        : target;

    if (!(element instanceof Element)) {
      return false;
    }

    const normalized =
      normalizeFlagCode(code);

    element.replaceChildren(
      createFlagElement(
        code,
        options
      )
    );

    if (normalized) {
      element.dataset.flagRenderedCode =
        normalized;
    } else {
      delete element.dataset
        .flagRenderedCode;
    }

    return true;
  }

  function flagCodeFromText(value) {
    const text =
      String(value ?? "")
        .trim();

    const codeOnly =
      normalizeFlagCode(text);

    if (codeOnly) {
      return codeOnly;
    }

    return normalizeFlagCode(
      text.match(
        /\(([A-Z]{2})\)\s*$/
      )?.[1]
    );
  }

  function isFlagDisplayTarget(
    element
  ) {
    if (!(element instanceof Element)) {
      return false;
    }

    /*
     * Formularelemente dürfen niemals
     * durch eine SVG-Ausgabe ersetzt werden.
     */
    if (
      element.matches(
        "select, option, input, " +
        "textarea, button"
      )
    ) {
      return false;
    }

    /*
     * Eindeutig gekennzeichnete
     * reine Ausgabefelder.
     */
    if (
      element.id === "flag" ||
      element.id === "vesselFlag" ||
      element.hasAttribute(
        "data-vessel-flag"
      )
    ) {
      return true;
    }

    /*
     * Die indirekte Erkennung wird nur
     * bei typischen Textelementen erlaubt.
     */
    if (
      ![
        "DD",
        "STRONG",
        "SPAN"
      ].includes(element.tagName)
    ) {
      return false;
    }

    const label =
      element.previousElementSibling
        ?.textContent
        ?.trim()
        .replace(/:$/, "")
        .toLocaleLowerCase("de-AT");

    return label === "flagge";
  }

  function enhanceFlagElement(
    element
  ) {
    if (
      !state.loaded ||
      !isFlagDisplayTarget(element)
    ) {
      return;
    }

    const code =
      element.dataset.flagCode ||
      flagCodeFromText(
        element.textContent
      );

    if (!code) {
      return;
    }

    const existingImage =
      element.querySelector(
        ".vessel-flag-image"
      );

    if (
      existingImage &&
      element.dataset
        .flagRenderedCode === code
    ) {
      return;
    }

    renderFlag(
      element,
      code
    );
  }

  function enhanceFlagRendering(
    root = document
  ) {
    if (!state.loaded) {
      return;
    }

    if (root instanceof Element) {
      enhanceFlagElement(root);
    }

    const scope =
      root instanceof Document ||
      root instanceof Element
        ? root
        : document;

    for (
      const element
      of scope.querySelectorAll(
        "#flag, #vesselFlag, " +
        "[data-vessel-flag], " +
        ".catalog-candidate-meta strong, " +
        ".edit-name-match-meta strong"
      )
    ) {
      enhanceFlagElement(element);
    }
  }

  const flagObserver =
    new MutationObserver(
      mutations => {
        if (!state.loaded) {
          return;
        }

        for (
          const mutation
          of mutations
        ) {
          if (
            mutation.type ===
            "characterData"
          ) {
            enhanceFlagElement(
              mutation.target
                .parentElement
            );

            continue;
          }

          for (
            const addedNode
            of mutation.addedNodes
          ) {
            if (
              addedNode instanceof
              Element
            ) {
              enhanceFlagRendering(
                addedNode
              );
            }
          }

          if (
            mutation.target instanceof
            Element
          ) {
            enhanceFlagElement(
              mutation.target
            );
          }
        }
      }
    );

  if (document.documentElement) {
    flagObserver.observe(
      document.documentElement,
      {
        childList: true,
        characterData: true,
        subtree: true
      }
    );
  }

  function canonicalSourceProvider(
    value
  ) {
    ensureLoaded();

    const raw =
      String(value ?? "").trim();

    if (!raw) {
      return "";
    }

    return (
      state.sourceProviderAliases.get(
        aliasKey(raw)
      ) || ""
    );
  }

  function sourceProviderLabel(
    value
  ) {
    ensureLoaded();

    const raw =
      String(value ?? "").trim();

    const canonical =
      canonicalSourceProvider(raw);

    return (
      state.sourceProviders.find(
        provider =>
          provider.value ===
          canonical
      )?.label ||
      raw ||
      "Quelle"
    );
  }

  function sourceFieldLabel(path) {
    ensureLoaded();

    const normalizedPath =
      String(path ?? "").trim();

    return (
      state.sourceFieldByPath.get(
        normalizedPath
      )?.label ||
      normalizedPath ||
      "Unbekanntes Feld"
    );
  }

  function normalizeEni(value) {
    return String(value ?? "")
      .trim()
      .replace(
        /^ENI\s*[:#-]?\s*/i,
        ""
      )
      .replace(/[\s.-]/g, "");
  }

  function isValidEni(value) {
    const normalized =
      normalizeEni(value);

    return (
      normalized === "" ||
      /^\d{8}$/.test(
        normalized
      )
    );
  }

  window.VesselReference =
    Object.freeze({
      load,

      getFlags,
      getShipTypes,
      getShipSubtypes,
      getSourceProviders,
      getSourceFields,

      canonicalShipType,
      canonicalShipSubtype,
      canonicalSourceProvider,

      shipTypeLabel,
      shipSubtypeLabel,
      flagEmoji,
      flagLabel,
      flagImageUrl,
      createFlagElement,
      renderFlag,
      enhanceFlagRendering,

      sourceProviderLabel,
      sourceFieldLabel,

      normalizeEni,
      isValidEni
    });
})();
