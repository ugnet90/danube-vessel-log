// Danube Vessel Log
// File: docs/js/ais_decoder.js
// Version: 0.12.1
// Updated: 2026-07-25

"use strict";

window.AisDecoder = (() => {
  const ref = window.AisReference;

  const firstFinite = (...values) => {
    for (const value of values) {
      if (value === null || value === undefined || value === "" || typeof value === "boolean") continue;
      const number = Number(value);
      if (Number.isFinite(number)) return number;
    }
    return null;
  };

  const firstText = (...values) => {
    for (const value of values) {
      const text = String(value ?? "").trim();
      if (text) return text;
    }
    return "";
  };

  const asBoolean = value => typeof value === "boolean" ? value : null;

  const getMessageBody = payload => {
    const message = payload?.Message;
    if (!message || typeof message !== "object") return {};
    const type = String(payload?.MessageType ?? "");
    if (type && message[type] && typeof message[type] === "object") return message[type];
    const first = Object.values(message).find(value => value && typeof value === "object");
    return first ?? {};
  };

  const historyEntries = sender => {
    const entries = [];
    const seenPayloads = new Set();

    for (const item of sender?.message_history ?? []) {
      const payload = item?.raw_payload;
      if (!payload || typeof payload !== "object") continue;
      seenPayloads.add(payload);
      entries.push({
        type: firstText(item?.message_type, payload?.MessageType, "UnknownMessage"),
        receivedAt: item?.received_at ?? "",
        payload,
        body: getMessageBody(payload)
      });
    }

    const currentPayload = sender?.raw_payload;
    if (currentPayload && typeof currentPayload === "object" && !seenPayloads.has(currentPayload)) {
      entries.unshift({
        type: firstText(sender?.message_type, currentPayload?.MessageType, "UnknownMessage"),
        receivedAt: sender?.received_at ?? "",
        payload: currentPayload,
        body: getMessageBody(currentPayload)
      });
    }

    return entries;
  };

  const latestBody = (entries, types) => {
    const allowed = new Set(Array.isArray(types) ? types : [types]);
    return entries.find(entry => allowed.has(entry.type))?.body ?? {};
  };

  const latestStaticDataParts = entries => {
    let reportA = {};
    let reportB = {};

    for (const entry of entries) {
      if (entry.type !== "StaticDataReport") continue;
      if (!Object.keys(reportA).length && entry.body?.ReportA?.Valid !== false) reportA = entry.body?.ReportA ?? {};
      if (!Object.keys(reportB).length && entry.body?.ReportB?.Valid !== false) reportB = entry.body?.ReportB ?? {};
      if (Object.keys(reportA).length && Object.keys(reportB).length) break;
    }

    return { reportA, reportB };
  };

  const validHeading = value => {
    const number = firstFinite(value);
    return number !== null && number >= 0 && number <= 359 ? number : null;
  };

  const validCourse = value => {
    const number = firstFinite(value);
    return number !== null && number >= 0 && number < 360 ? number : null;
  };

  const validSpeed = value => {
    const number = firstFinite(value);
    return number !== null && number >= 0 && number < 102.3 ? number : null;
  };

  const validRot = value => {
    const number = firstFinite(value);
    return number !== null && number !== -128 ? number : null;
  };

  const position = (latitude, longitude) => {
    const lat = firstFinite(latitude);
    const lon = firstFinite(longitude);
    if (lat === null || lon === null || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
    return { latitude: lat, longitude: lon };
  };

  const midInfo = mmsi => {
    const digits = String(mmsi ?? "").replace(/\D/g, "").padStart(9, "0");
    let mid = "";
    if (/^00\d{7}$/.test(digits)) mid = digits.slice(2, 5);
    else if (/^0\d{8}$/.test(digits)) mid = digits.slice(1, 4);
    else mid = digits.slice(0, 3);
    return { mid, country: ref.midCountries[mid] ?? "Nicht in der lokalen MID-Tabelle" };
  };

  const messageInfo = (type, messageId) => {
    const known = ref.messageTypes[type] ?? ref.messageTypes.UnknownMessage;
    return { type: type || "UnknownMessage", ids: known.ids, title: known.title, group: known.group, messageId };
  };

  const lookupShipType = code => {
    const number = firstFinite(code);
    if (number === null) return "Nicht verfügbar";
    if (ref.shipTypes[number]) return ref.shipTypes[number];
    const decade = Math.floor(number / 10) * 10;
    return ref.shipTypes[decade] ? `${ref.shipTypes[decade]} (Code ${number})` : `AIS-Schiffstyp ${number}`;
  };

  const normalizeEta = body => {
    const eta = body?.Eta ?? {};
    const month = firstFinite(eta.Month, body?.Month, body?.EtaMonth);
    const day = firstFinite(eta.Day, body?.Day, body?.EtaDay);
    const hour = firstFinite(eta.Hour, body?.Hour, body?.EtaHour);
    const minute = firstFinite(eta.Minute, body?.Minute, body?.EtaMinute);
    if ([month, day, hour, minute].every(value => value === null)) return "";
    const pad = value => value === null ? "??" : String(value).padStart(2, "0");
    return `${pad(day)}.${pad(month)}. ${pad(hour)}:${pad(minute)} UTC`;
  };

  const normalizeImo = (...values) => {
    for (const value of values) {
      const digits = String(value ?? "").replace(/\D/g, "");
      if (digits && Number(digits) > 0) return digits;
    }
    return "";
  };

  const dimensionsFrom = (...sources) => {
    for (const source of sources) {
      const dimension = source?.Dimension ?? source;
      const dimensions = {
        bow: firstFinite(dimension?.A, source?.DimensionA, source?.ToBow),
        stern: firstFinite(dimension?.B, source?.DimensionB, source?.ToStern),
        port: firstFinite(dimension?.C, source?.DimensionC, source?.ToPort),
        starboard: firstFinite(dimension?.D, source?.DimensionD, source?.ToStarboard)
      };
      if (Object.values(dimensions).some(value => value !== null)) return dimensions;
    }
    return { bow: null, stern: null, port: null, starboard: null };
  };

  function decode(sender) {
    const payload = sender?.raw_payload ?? {};
    const body = getMessageBody(payload);
    const metadata = payload?.MetaData ?? {};
    const type = firstText(sender?.message_type, payload?.MessageType, "UnknownMessage");
    const messageId = firstFinite(body.MessageID, sender?.diagnostics?.message_id);
    const mmsi = firstText(sender?.mmsi, metadata.MMSI_String, metadata.MMSI, body.UserID);
    const mid = midInfo(mmsi);
    const messagePosition = sender?.message_position ?? position(body.Latitude, body.Longitude);
    const metadataPosition = sender?.metadata_position ?? position(metadata.latitude, metadata.longitude);

    const entries = historyEntries(sender);
    const shipStatic = latestBody(entries, "ShipStaticData");
    const extendedClassB = latestBody(entries, "ExtendedClassBPositionReport");
    const { reportA, reportB } = latestStaticDataParts(entries);

    const dimensions = dimensionsFrom(shipStatic, reportB, extendedClassB, body);
    const calculatedLength = dimensions.bow !== null && dimensions.stern !== null ? dimensions.bow + dimensions.stern : null;
    const calculatedWidth = dimensions.port !== null && dimensions.starboard !== null ? dimensions.port + dimensions.starboard : null;
    const length = firstFinite(sender?.length_m, calculatedLength);
    const width = firstFinite(sender?.width_m, calculatedWidth);

    const navStatusCode = firstFinite(body.NavigationalStatus, sender?.navigation_status);
    const specialCode = firstFinite(body.SpecialManoeuvreIndicator);
    const epfdCode = firstFinite(body.FixType, body.PositionFixType, sender?.diagnostics?.fix_type);
    const shipTypeCode = firstFinite(sender?.ship_type, shipStatic.Type, reportB.ShipType, extendedClassB.Type, body.Type, body.ShipType);
    const observedTypes = [...new Set(sender?.message_types ?? entries.map(entry => entry.type))].filter(Boolean).sort();

    return {
      source: sender,
      raw: payload,
      body,
      metadata,
      message: {
        ...messageInfo(type, messageId),
        observedTypes
      },
      general: {
        senderClass: sender?.sender_class ?? "other",
        senderClassLabel: ref.senderClasses[sender?.sender_class] ?? ref.senderClasses.other,
        mmsi,
        mid: mid.mid,
        country: mid.country,
        receivedAt: sender?.received_at ?? "",
        aisTime: firstText(sender?.ais_time, metadata.time_utc),
        repeatIndicator: firstFinite(body.RepeatIndicator, sender?.diagnostics?.repeat_indicator),
        userId: firstFinite(body.UserID, sender?.raw_user_id)
      },
      position: {
        message: messagePosition,
        metadata: metadataPosition,
        sog: validSpeed(sender?.sog ?? body.Sog),
        cog: validCourse(sender?.cog ?? body.Cog),
        heading: validHeading(sender?.true_heading ?? body.TrueHeading),
        rateOfTurn: validRot(body.RateOfTurn),
        timestampSecond: firstFinite(body.Timestamp),
        accuracy: asBoolean(body.PositionAccuracy ?? sender?.diagnostics?.position_accuracy)
      },
      vessel: {
        name: firstText(sender?.name, metadata.ShipName, shipStatic.Name, reportA.Name, extendedClassB.Name, body.Name, body.ShipName),
        imo: normalizeImo(sender?.imo, shipStatic.ImoNumber, body.ImoNumber, body.IMO, body.Imo),
        callSign: firstText(sender?.call_sign, shipStatic.CallSign, reportB.CallSign, body.CallSign),
        shipTypeCode,
        shipType: lookupShipType(shipTypeCode),
        destination: firstText(sender?.destination, shipStatic.Destination, body.Destination),
        draught: firstFinite(sender?.draft_m, shipStatic.MaximumStaticDraught, body.MaximumStaticDraught, body.Draught),
        eta: normalizeEta(shipStatic),
        length,
        width,
        dimensions
      },
      navigation: {
        statusCode: navStatusCode,
        status: navStatusCode === null ? "–" : (ref.navigationStatus[navStatusCode] ?? `Code ${navStatusCode}`),
        specialCode,
        special: specialCode === null ? "–" : (ref.specialManoeuvre[specialCode] ?? `Code ${specialCode}`)
      },
      diagnostics: {
        valid: asBoolean(body.Valid ?? sender?.diagnostics?.valid),
        raim: asBoolean(body.Raim ?? sender?.diagnostics?.raim),
        fixTypeCode: epfdCode,
        fixType: epfdCode === null ? "–" : (ref.epfd[epfdCode] ?? `Code ${epfdCode}`),
        communicationState: firstFinite(body.CommunicationState, sender?.diagnostics?.communication_state),
        longRangeEnable: asBoolean(body.LongRangeEnable ?? sender?.diagnostics?.long_range_enable),
        rawKeys: Object.keys(body).sort()
      }
    };
  }

  return Object.freeze({ decode, getMessageBody });
})();
