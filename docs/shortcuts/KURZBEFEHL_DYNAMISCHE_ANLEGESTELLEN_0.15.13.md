# Kurzbefehl-Anpassung 0.15.13 – stabile Orts-IDs für Anlegestellen

## Ziel

Die zweistufige Auswahl **Ort → Anlegestelle** bleibt für den Benutzer unverändert, trennt ab 0.15.13 aber sauber drei unterschiedliche Dinge:

- Aufnahmeort des Fotografen: bestehende `LOC-...`-Logik;
- bekannter Ort der Anlegestellenauswahl: neue stabile `BTA-...`-ID (`berth_area_id`);
- manuell neu eingegebener Ort: `berth_municipality_entered`.

Damit wird `berth_municipality_entered` tatsächlich nur noch dann befüllt, wenn der Benutzer **`+ neuen Ort eingeben`** auswählt. Ein bekannter Ort wie Linz oder Pupping wird nicht redundant als Freitext gespeichert.

## Betroffene Kurzbefehle

- **Schiffsichtung mit Foto(s)**
- **Schiffsichtung ohne Foto**

Der Zusatzfoto-Kurzbefehl bleibt unverändert.

## Neue technische Ortswerte

`GET /berth-options` liefert ohne Parameter weiterhin die sichtbaren Optionen:

- `Linz`
- `Pupping`
- `+ neuen Ort eingeben`
- `Ort unbekannt`

Die technischen Werte sind ab 0.15.13 jedoch:

- `Linz` → `BTA-001`
- `Pupping` → `BTA-002`
- `+ neuen Ort eingeben` → `unlisted`
- `Ort unbekannt` → `unknown`

`BTA` steht für **Berth Area**. Diese IDs gehören ausschließlich zur Anlegestellenauswahl und dürfen nicht mit den `LOC-...`-IDs der Foto-/Aufnahmeorte vermischt werden.

## 1. Startwerte

Vor dem Anlegerblock diese Variablen definiert halten:

- `berth_status = unknown`
- `berth_id =` leer
- `berth_area_id =` leer
- `berth_municipality_entered =` leer
- `berth_name_entered =` leer
- `alongside_position = unknown`

## 2. Orte laden

### URL

`https://danube-vessel-api.daniel-koechler.workers.dev/berth-options`

### „Inhalte von URL abrufen“

- Methode: `GET`
- Header: `X-Upload-Key` = vorhandener Upload-Key

`choices` abrufen und daraus auswählen. Das ausgewählte Objekt wie bisher über eine **Text**-Aktion in die Variable

`BerthOrtAuswahl`

übernehmen.

Danach `value_by_choice` aus der Worker-Antwort abrufen, als Wörterbuchvariable speichern und mit `BerthOrtAuswahl` den technischen Wert bestimmen. Diesen wieder über **Text** in

`BerthOrtWert`

speichern.

Beispiele:

- Linz → `BTA-001`
- Pupping → `BTA-002`
- `+ neuen Ort eingeben` → `unlisted`
- `Ort unbekannt` → `unknown`

## 3. Ortsauswahl auswerten

### Ort unbekannt

Wenn `BerthOrtWert = unknown`:

- `berth_area_id` bleibt leer;
- `BerthWert = unknown`;
- keine Anlegerliste laden.

### Neuer Ort

Wenn `BerthOrtWert = unlisted`:

1. `berth_area_id` bleibt leer;
2. nach Text fragen: **„Wie heißt der Ort?“**;
3. Eingabe in `berth_municipality_entered` speichern;
4. `BerthWert = unlisted`.

Die Anlegestelle wird später als Freitext abgefragt.

### Bekannter Ort

Sonst enthält `BerthOrtWert` eine stabile `BTA-...`-ID:

1. `berth_area_id = BerthOrtWert` setzen;
2. die Anleger für diese Area laden:

`https://danube-vessel-api.daniel-koechler.workers.dev/berth-options?area_id=[berth_area_id]`

3. `choices` abrufen und Anlegestelle auswählen;
4. Auswahl als Text in `BerthAuswahl` speichern;
5. `value_by_choice` abrufen;
6. technischen Wert der Auswahl in `BerthWert` speichern.

Beispiele für Linz:

- `Linz-Hauptplatz Nr. 13` → `BER-000003`
- `+ neue Anlegestelle eingeben` → `unlisted`
- `Anlegestelle unbekannt` → `unknown`

Der alte Parameter `?municipality=Linz` bleibt im Worker aus Kompatibilitätsgründen erhalten, soll in den aktualisierten Kurzbefehlen aber nicht mehr verwendet werden.

## 4. Anlegestelle auswerten

Vor diesem Block:

- `berth_name_entered` mit leerem Text initialisieren;
- `alongside_position = unknown` setzen.

### `BerthWert = unknown`

- `berth_status = unknown`
- `berth_id =` leer
- keine Liegeposition abfragen

Ist vorher ein bekannter Ort gewählt worden, bleibt `berth_area_id` erhalten. Damit weiß der Worker beispielsweise: **Ort Linz bekannt, konkrete Anlegestelle unbekannt**.

### `BerthWert = unlisted`

- `berth_status = unlisted`
- `berth_id =` leer
- nach Text fragen: **„Wie heißt die Anlegestelle?“**
- Eingabe in `berth_name_entered` speichern
- keine Liegeposition abfragen

Dabei gelten zwei saubere Fälle:

**Bekannter Ort + neue Anlegestelle**

- `berth_area_id = BTA-001` (z. B. Linz)
- `berth_municipality_entered =` leer
- `berth_name_entered =` eingegebener Anlegername

**Neuer Ort + neue Anlegestelle**

- `berth_area_id =` leer
- `berth_municipality_entered = Grein`
- `berth_name_entered = Grein Donaustation`

### Bekannte Anlegestelle

Sonst enthält `BerthWert` eine `BER-...`-ID:

- `berth_status = matched`
- `berth_id = BerthWert`

Danach nur bei `berth_status = matched` die Liegeposition abfragen:

- `1 - direkt am Anleger` → `1`
- `2 - zweite Reihe` → `2`
- `3 - dritte Reihe` → `3`
- `Unbekannt` → `unknown`

Ergebnis in `alongside_position` speichern.

## 5. JSON des Kurzbefehls

Der Upload enthält im Anlegerbereich ab 0.15.13:

```json
{
  "berth_status": "[berth_status]",
  "berth_id": "[berth_id]",
  "berth_area_id": "[berth_area_id]",
  "berth_municipality_entered": "[berth_municipality_entered]",
  "berth_name_entered": "[berth_name_entered]",
  "alongside_position": "[alongside_position]"
}
```

## 6. Erwartete Testfälle

### Brandstatt, bekannte Anlegestelle

- Ort: Pupping
- technischer Ort: `BTA-002`
- Anlegestelle: Brandstatt (Pupping)
- `berth_id = BER-000007`
- `berth_status = matched`

### Linz, neue Anlegestelle

- Ort: Linz
- `berth_area_id = BTA-001`
- `berth_municipality_entered =` leer
- `berth_status = unlisted`
- `berth_name_entered =` manuelle Eingabe

### Neuer Ort Grein

- `berth_area_id =` leer
- `berth_municipality_entered = Grein`
- `berth_status = unlisted`
- `berth_name_entered =` manuelle Eingabe

### Ort Linz, Anlegestelle unbekannt

- `berth_area_id = BTA-001`
- `berth_status = unknown`
- `berth_id =` leer
- `alongside_position = unknown`

## 7. Datenmodell

`data/berths.csv` enthält ab 0.15.13 zusätzlich die Spalte `berth_area_id`:

- Linzer Anleger → `BTA-001`
- Brandstatt/Pupping → `BTA-002`

Die stabile Area-ID dient ausschließlich als Elternbezug für die Anlegestellenauswahl. Die vorhandenen `location_id`- und `reference_location_id`-Spalten behalten ihre bisherige Bedeutung für Aufnahme-/Referenzorte und werden nicht umgedeutet.
