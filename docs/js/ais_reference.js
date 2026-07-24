// Danube Vessel Log
// File: docs/js/ais_reference.js
// Version: 0.12.0
// Updated: 2026-07-24

"use strict";

window.AisReference = Object.freeze({
  senderClasses: Object.freeze({
    vessel: "Schiff",
    base_station: "Basisstation",
    aid_to_navigation: "Navigationszeichen",
    sar_aircraft: "SAR-Luftfahrzeug",
    other: "Sonstiger AIS-Sender"
  }),

  messageTypes: Object.freeze({
    PositionReport: { ids: "1, 2 oder 3", title: "Klasse-A-Positionsmeldung", group: "Position" },
    StandardClassBPositionReport: { ids: "18", title: "Standard-Klasse-B-Positionsmeldung", group: "Position" },
    ExtendedClassBPositionReport: { ids: "19", title: "Erweiterte Klasse-B-Positionsmeldung", group: "Position" },
    LongRangeAisBroadcastMessage: { ids: "27", title: "Langstrecken-Positionsmeldung", group: "Position" },
    ShipStaticData: { ids: "5", title: "Statische und reisebezogene Schiffsdaten", group: "Stammdaten" },
    StaticDataReport: { ids: "24", title: "Klasse-B-Stammdatenmeldung", group: "Stammdaten" },
    BaseStationReport: { ids: "4", title: "Basisstationsmeldung", group: "Infrastruktur" },
    AidToNavigationReport: { ids: "21", title: "Meldung eines Navigationszeichens", group: "Infrastruktur" },
    SarAircraftPositionReport: { ids: "9", title: "SAR-Luftfahrzeug-Positionsmeldung", group: "Sonderdienst" },
    DataLinkManagementMessage: { ids: "20", title: "Datenlink-Verwaltung", group: "Infrastruktur" },
    GnssBroadcastBinaryMessage: { ids: "17", title: "GNSS-Binärmeldung", group: "Binärdaten" },
    BinaryAcknowledge: { ids: "7 oder 13", title: "Binäre Bestätigung", group: "Binärdaten" },
    BinaryBroadcastMessage: { ids: "8", title: "Binäre Rundsendung", group: "Binärdaten" },
    AddressedBinaryMessage: { ids: "6", title: "Adressierte Binärmeldung", group: "Binärdaten" },
    SafetyRelatedBroadcastMessage: { ids: "14", title: "Sicherheitsbezogene Rundsendung", group: "Sicherheit" },
    AddressedSafetyRelatedMessage: { ids: "12", title: "Adressierte Sicherheitsmeldung", group: "Sicherheit" },
    Interrogation: { ids: "15", title: "AIS-Abfrage", group: "Steuerung" },
    AssignedModeCommand: { ids: "16", title: "Zuweisungsmodus-Befehl", group: "Steuerung" },
    ChannelManagement: { ids: "22", title: "Kanalverwaltung", group: "Steuerung" },
    GroupAssignmentCommand: { ids: "23", title: "Gruppenzuweisung", group: "Steuerung" },
    SingleSlotBinaryMessage: { ids: "25", title: "Ein-Slot-Binärmeldung", group: "Binärdaten" },
    MultipleSlotBinaryMessage: { ids: "26", title: "Mehr-Slot-Binärmeldung", group: "Binärdaten" },
    UtcAndDateInquiry: { ids: "10", title: "UTC-/Datumsabfrage", group: "Zeit" },
    UtcAndDateResponse: { ids: "11", title: "UTC-/Datumsantwort", group: "Zeit" },
    UnknownMessage: { ids: "–", title: "Nicht zugeordnete AIS-Meldung", group: "Unbekannt" }
  }),

  navigationStatus: Object.freeze({
    0: "Unter Maschine",
    1: "Vor Anker",
    2: "Manövrierunfähig",
    3: "Eingeschränkte Manövrierfähigkeit",
    4: "Durch Tiefgang behindert",
    5: "Festgemacht",
    6: "Auf Grund",
    7: "Fischfang",
    8: "Unter Segel",
    9: "Reserviert für HSC",
    10: "Reserviert für WIG",
    11: "Schleppt längsseits",
    12: "Schiebt oder schleppt längsseits",
    13: "Reserviert",
    14: "AIS-SART / MOB / EPIRB aktiv",
    15: "Nicht definiert"
  }),

  specialManoeuvre: Object.freeze({
    0: "Nicht verfügbar",
    1: "Kein besonderes Manöver",
    2: "Besonderes Manöver"
  }),

  epfd: Object.freeze({
    0: "Nicht definiert",
    1: "GPS",
    2: "GLONASS",
    3: "Kombiniertes GPS/GLONASS",
    4: "Loran-C",
    5: "Chayka",
    6: "Integriertes Navigationssystem",
    7: "Vermessung",
    8: "Galileo",
    15: "Interne GNSS-Anlage"
  }),

  shipTypes: Object.freeze({
    0: "Nicht verfügbar",
    20: "Tragflächenboot",
    30: "Fischereifahrzeug",
    31: "Schlepper",
    32: "Schlepper mit Schleppverband",
    33: "Bagger- oder Unterwasserarbeiten",
    34: "Taucheinsatz",
    35: "Militärisches Fahrzeug",
    36: "Segelfahrzeug",
    37: "Sportboot",
    40: "Hochgeschwindigkeitsfahrzeug",
    50: "Lotsenfahrzeug",
    51: "Such- und Rettungsfahrzeug",
    52: "Schlepper",
    53: "Hafendienstfahrzeug",
    54: "Fahrzeug mit Schadstoffbekämpfung",
    55: "Behördenfahrzeug",
    58: "Medizinisches Transportschiff",
    59: "Nichtkombattant",
    60: "Fahrgastschiff",
    70: "Frachtschiff",
    80: "Tankschiff",
    90: "Sonstiges Schiff"
  }),

  midCountries: Object.freeze({
    "201": "Albanien", "202": "Andorra", "203": "Österreich", "204": "Azoren (Portugal)",
    "205": "Belgien", "206": "Belarus", "207": "Bulgarien", "209": "Zypern",
    "211": "Deutschland", "212": "Zypern", "215": "Malta", "218": "Deutschland",
    "219": "Dänemark", "220": "Dänemark", "224": "Spanien", "225": "Spanien",
    "226": "Frankreich", "227": "Frankreich", "228": "Frankreich", "230": "Finnland",
    "231": "Färöer", "232": "Vereinigtes Königreich", "233": "Vereinigtes Königreich",
    "234": "Vereinigtes Königreich", "235": "Vereinigtes Königreich", "236": "Gibraltar",
    "237": "Griechenland", "238": "Kroatien", "239": "Griechenland", "240": "Griechenland",
    "241": "Griechenland", "242": "Marokko", "243": "Ungarn", "244": "Niederlande",
    "245": "Niederlande", "246": "Niederlande", "247": "Italien", "248": "Malta",
    "249": "Malta", "250": "Irland", "251": "Island", "252": "Liechtenstein",
    "253": "Luxemburg", "254": "Monaco", "255": "Portugal", "256": "Malta",
    "257": "Norwegen", "258": "Norwegen", "259": "Norwegen", "261": "Polen",
    "262": "Montenegro", "263": "Portugal", "264": "Rumänien", "265": "Schweden",
    "266": "Schweden", "267": "Slowakei", "268": "San Marino", "269": "Schweiz",
    "270": "Tschechien", "271": "Türkei", "272": "Ukraine", "273": "Russland",
    "274": "Nordmazedonien", "275": "Lettland", "276": "Estland", "277": "Litauen",
    "278": "Slowenien", "279": "Serbien", "301": "Anguilla", "303": "Alaska (USA)",
    "304": "Antigua und Barbuda", "305": "Antigua und Barbuda", "306": "Curaçao",
    "308": "Bahamas", "309": "Bahamas", "310": "Bermuda", "311": "Bahamas",
    "316": "Kanada", "338": "USA", "366": "USA", "367": "USA", "368": "USA",
    "369": "USA", "370": "Panama", "371": "Panama", "372": "Panama", "373": "Panama",
    "374": "Panama", "375": "St. Vincent und die Grenadinen", "376": "St. Vincent und die Grenadinen",
    "477": "Hongkong", "503": "Australien", "538": "Marshallinseln", "563": "Singapur",
    "564": "Singapur", "565": "Singapur", "566": "Singapur", "636": "Liberia"
  })
});
