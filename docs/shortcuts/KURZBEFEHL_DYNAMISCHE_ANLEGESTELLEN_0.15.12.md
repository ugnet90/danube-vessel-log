# Kurzbefehl-Anpassung 0.15.12 – dynamische Orte und Anlegestellen

## Ziel

Die beiden Sichtungs-Kurzbefehle verwenden für Ort und Anlegestelle keine fest gepflegten Listen mehr. Die aktiven Anlegestellen werden über den geschützten Worker-Endpunkt

`GET /berth-options`

unmittelbar aus der kanonischen Datei `data/berths.csv` geladen.

Die sichtbaren Sonderauswahlen sind ab 0.15.12 bewusst analog zur dynamischen Schiffsauswahl formuliert:

- `+ neuen Ort eingeben`
- `Ort unbekannt`
- `+ neue Anlegestelle eingeben`
- `Anlegestelle unbekannt`

Die technischen Werte bleiben unverändert:

- neue, noch nicht gelistete Auswahl → `unlisted`
- unbekannte Auswahl → `unknown`
- bekannte Anlegestelle → stabile `BER-...`-ID

## Betroffene Kurzbefehle

- **Schiffsichtung mit Foto(s)**
- **Schiffsichtung ohne Foto**

Der Kurzbefehl für reine zusätzliche Schiffsfotos bleibt unverändert.

## Bedienreihenfolge

Für eine angelegte Sichtung bleibt die Bedienung konsistent:

1. Schiff
2. Bewegung
3. Ausrichtung
4. Ort
5. Anlegestelle
6. Liegeposition

Bei einer Sichtung in Fahrt wird weiterhin keine Orts-/Anlegestellen- oder Liegepositionsauswahl benötigt.

## 1. Startwerte

Vor der Verarbeitung der Anlegestelle diese Variablen definiert halten:

- `berth_status = unknown`
- `berth_id =` leer
- `berth_municipality_entered =` leer
- `berth_name_entered =` leer
- `alongside_position = unknown`

`berth_municipality_entered` ist neu. Es dient ausschließlich dazu, den vom Benutzer eingegebenen bzw. bereits ausgewählten Ort einer noch nicht gelisteten Anlegestelle an den Worker zu übergeben.

## 2. Orte dynamisch laden

### URL

`https://danube-vessel-api.daniel-koechler.workers.dev/berth-options`

### „Inhalte von URL abrufen“

- Methode: `GET`
- Header: `X-Upload-Key` = vorhandener Upload-Key

Beispielantwort:

```json
{
  "ok": true,
  "level": "municipality",
  "choices": [
    "Linz",
    "Pupping",
    "+ neuen Ort eingeben",
    "Ort unbekannt"
  ],
  "value_by_choice": {
    "Linz": "Linz",
    "Pupping": "Pupping",
    "+ neuen Ort eingeben": "unlisted",
    "Ort unbekannt": "unknown"
  }
}
```

Die bereits aufgebaute Kurzbefehlslogik kann weiterverwendet werden. Wird die Ortsauswahl in eine Textvariable `BerthOrtAuswahl` übernommen, lautet die Sonderfall-Bedingung ab 0.15.12:

`Wenn BerthOrtAuswahl ist + neuen Ort eingeben`

Anführungszeichen werden im Vergleichsfeld nicht mit eingegeben.

## 3. Neuer Ort

Bei Auswahl von

`+ neuen Ort eingeben`

wird intern weiterhin

`BerthOrtWert = unlisted`

gesetzt.

Zusätzlich:

1. **Nach Text fragen**: `Wie heißt der Ort?`
2. Ergebnis in `berth_municipality_entered` speichern.

Beispiel:

`+ neuen Ort eingeben` → `Grein`

führt zu:

- `BerthOrtWert = unlisted`
- `berth_municipality_entered = Grein`

Da für einen noch nicht gelisteten Ort keine Anlegerliste geladen werden kann, wird später unmittelbar nach dem Namen der neuen Anlegestelle gefragt.

## 4. Ort unbekannt

Bei

`Ort unbekannt`

setzen:

- `BerthOrtWert = unknown`
- `BerthWert = unknown`
- `berth_status = unknown`
- `berth_id =` leer
- `berth_municipality_entered =` leer
- `berth_name_entered =` leer
- `alongside_position = unknown`

Danach keine Anlegestellen- und keine Liegepositionsfrage.

## 5. Anlegestellen eines bekannten Orts laden

Für einen echten Ortswert wie `Linz` oder `Pupping`:

`https://danube-vessel-api.daniel-koechler.workers.dev/berth-options?municipality=[BerthOrtWert]`

Wieder:

- Methode `GET`
- Header `X-Upload-Key`

Beispiel Linz:

```json
{
  "ok": true,
  "level": "berth",
  "municipality": "Linz",
  "choices": [
    "Linz-Schloss Nr. 11",
    "Linz-Nibelungen Nr. 12",
    "Linz-Hauptplatz Nr. 13",
    "Linz-Lentos Nr. 14",
    "Linz 1 – Brucknerhaus",
    "Linz 32",
    "+ neue Anlegestelle eingeben",
    "Anlegestelle unbekannt"
  ],
  "value_by_choice": {
    "Linz-Schloss Nr. 11": "BER-000001",
    "Linz-Nibelungen Nr. 12": "BER-000002",
    "Linz-Hauptplatz Nr. 13": "BER-000003",
    "Linz-Lentos Nr. 14": "BER-000004",
    "Linz 1 – Brucknerhaus": "BER-000005",
    "Linz 32": "BER-000006",
    "+ neue Anlegestelle eingeben": "unlisted",
    "Anlegestelle unbekannt": "unknown"
  }
}
```

Für Pupping wird derzeit `Brandstatt (Pupping)` plus die beiden Sonderauswahlen geliefert.

Die bereits getestete Zuordnung über `value_by_choice` bleibt bestehen:

1. `value_by_choice` aus `BerthOptionsAnleger` abrufen.
2. Als `BerthZuordnung` speichern.
3. Mit `BerthAuswahl` als Schlüssel den technischen Wert abrufen.
4. Als Text in `BerthWert` speichern.

## 6. Neue Anlegestelle an bekanntem Ort

Bei einem bekannten Ort und Auswahl

`+ neue Anlegestelle eingeben`

liefert `BerthWert` den technischen Wert `unlisted`.

Bevor nach dem Anlegernamen gefragt wird, den bereits bekannten Ort übernehmen:

`berth_municipality_entered = BerthOrtWert`

Danach:

1. `berth_status = unlisted`
2. `berth_id =` leer
3. **Nach Text fragen**: `Wie heißt die Anlegestelle?`
4. Eingabe in `berth_name_entered` speichern
5. `alongside_position = unknown`
6. keine Liegepositionsfrage

Beispiel:

`Linz` → `+ neue Anlegestelle eingeben` → `Testanleger`

liefert:

- `berth_municipality_entered = Linz`
- `berth_name_entered = Testanleger`
- `berth_status = unlisted`

## 7. Neue Anlegestelle an neuem Ort

Wurde zuvor `+ neuen Ort eingeben` gewählt, ist `berth_municipality_entered` bereits durch die Ortsabfrage gesetzt.

Beispiel:

- Ort: `Grein`
- Anlegestelle: `Grein Donaustation`

Ergebnis:

- `BerthOrtWert = unlisted`
- `BerthWert = unlisted`
- `berth_status = unlisted`
- `berth_id =` leer
- `berth_municipality_entered = Grein`
- `berth_name_entered = Grein Donaustation`
- `alongside_position = unknown`

Der Worker übernimmt den eingegebenen Ort in `submission.berth.municipality` und den Anlegernamen in `submission.berth.name`.

## 8. Bekannte Anlegestelle

Beginnt `BerthWert` mit `BER-`, wird die bekannte Anlegestelle verwendet:

- `berth_status = matched`
- `berth_id = BerthWert`
- `berth_municipality_entered =` leer
- `berth_name_entered =` leer

Nur in diesem Fall wird die Liegeposition abgefragt:

- `1 – direkt am Anleger` → `1`
- `2 – zweite Reihe` → `2`
- `3 – dritte Reihe` → `3`
- `Unbekannt` → `unknown`

Vor diesem `Wenn berth_status ist matched` wird `alongside_position` grundsätzlich auf `unknown` gesetzt. Das Menü überschreibt den Wert nur bei einer bekannten Anlegestelle.

## 9. Anlegestelle unbekannt

Bei

`Anlegestelle unbekannt`

liefert `BerthWert = unknown`.

Setzen:

- `berth_status = unknown`
- `berth_id =` leer
- `berth_name_entered =` leer
- `alongside_position = unknown`

Es wird keine Liegeposition abgefragt.

## 10. Submission-JSON

Der Kurzbefehl sendet zusätzlich das neue Eingabefeld `berth_municipality_entered`:

```json
{
  "movement": "[movement]",
  "direction": "[direction]",
  "berth_status": "[berth_status]",
  "berth_id": "[berth_id]",
  "berth_municipality_entered": "[berth_municipality_entered]",
  "berth_name_entered": "[berth_name_entered]",
  "alongside_position": "[alongside_position]"
}
```

Der Worker validiert `berth_municipality_entered` als Text mit maximal 120 Zeichen. Bei `berth_status = unlisted` hat dieser Wert Vorrang vor einem eventuell aus dem Aufnahmeort abgeleiteten Gemeindenamen.

Das Feld wird nicht als redundantes neues Top-Level-Feld in der gespeicherten Submission geführt. Der Worker übernimmt es in das bereits vorhandene kanonische Feld `submission.berth.municipality`.

## 11. Empfohlene Tests

Nach dem Worker-Deployment zuerst den Kurzbefehl **Schiffsichtung mit Foto(s)** testen:

1. `Pupping` → `Brandstatt (Pupping)` → Position 2 → `BER-000007`, `matched`, Position `2`.
2. `Linz` → bekannter Anleger → `BER-...`, `matched`, Liegepositionsmenü erscheint.
3. `Linz` → `+ neue Anlegestelle eingeben` → Freitext → Gemeinde `Linz`, `unlisted`, keine Liegepositionsfrage.
4. `+ neuen Ort eingeben` → `Grein` → neue Anlegestelle eingeben → beide Freitexte werden gespeichert, keine Liegepositionsfrage.
5. `Ort unbekannt` → keine Anleger- oder Liegepositionsfrage.
6. Bekannter Ort → `Anlegestelle unbekannt` → keine Liegepositionsfrage.
7. `moving` → keine Orts-/Anleger-/Liegepositionsauswahl.

Erst danach denselben Block in **Schiffsichtung ohne Foto** übernehmen.
