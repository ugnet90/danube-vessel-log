// Danube Vessel Log
// File: docs/js/ais_decoder.js
// Version: 0.12.0
// Updated: 2026-07-24

"use strict";

window.AisDecoder = (() => {
  const ref = window.AisReference;
  const firstFinite = (...values) => {
    for (const value of values) {
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
    if (number === null) return "–";
    if (ref.shipTypes[number]) return ref.shipTypes[number];
    const decade = Math.floor(number / 10) * 10;
    return ref.shipTypes[decade] ? `${ref.shipTypes[decade]} (Code ${number})` : `AIS-Schiffstyp ${number}`;
  };
  const normalizeEta = body => {
    const month = firstFinite(body.Month, body.EtaMonth);
    const day = firstFinite(body.Day, body.EtaDay);
    const hour = firstFinite(body.Hour, body.EtaHour);
    const minute = firstFinite(body.Minute, body.EtaMinute);
    if ([month, day, hour, minute].every(value => value === null)) return "";
    const pad = value => value === null ? "??" : String(value).padStart(2, "0");
    return `${pad(day)}.${pad(month)}. ${pad(hour)}:${pad(minute)} UTC`;
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
    const dimensions = {
      bow: firstFinite(body.Dimension?.A, body.DimensionA, body.ToBow),
      stern: firstFinite(body.Dimension?.B, body.DimensionB, body.ToStern),
      port: firstFinite(body.Dimension?.C, body.DimensionC, body.ToPort),
      starboard: firstFinite(body.Dimension?.D, body.DimensionD, body.ToStarboard)
    };
    const length = dimensions.bow !== null && dimensions.stern !== null ? dimensions.bow + dimensions.stern : null;
    const width = dimensions.port !== null && dimensions.starboard !== null ? dimensions.port + dimensions.starboard : null;
    const navStatusCode = firstFinite(body.NavigationalStatus);
    const specialCode = firstFinite(body.SpecialManoeuvreIndicator);
    const epfdCode = firstFinite(body.FixType, body.PositionFixType);
    const shipTypeCode = firstFinite(body.Type, body.ShipType);

    return {
      source: sender,
      raw: payload,
      body,
      metadata,
      message: messageInfo(type, messageId),
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
        name: firstText(sender?.name, metadata.ShipName, body.Name, body.ShipName),
        imo: firstText(sender?.imo, body.ImoNumber, body.IMO, body.Imo),
        callSign: firstText(sender?.call_sign, body.CallSign),
        shipTypeCode,
        shipType: lookupShipType(shipTypeCode),
        destination: firstText(body.Destination),
        draught: firstFinite(body.MaximumStaticDraught, body.Draught),
        eta: normalizeEta(body),
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
