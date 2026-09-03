# Kurzbefehl-Anpassung 0.15.11 – dynamische Anlegestellen

## Ziel

Die beiden Sichtungs-Kurzbefehle sollen die Anlegestellen nicht mehr als feste Menüpunkte enthalten.

Die Auswahl wird ab 0.15.11 direkt aus der kanonischen Datei `data/berths.csv` geladen. Der Cloudflare Worker stellt dafür den für Apple Kurzbefehle optimierten Endpunkt

`GET /berth-options`

bereit.

Die Auswahl erfolgt zweistufig:

1. **Ort** auswählen, z. B. `Linz` oder `Pupping`.
2. Danach nur die **Anlegestellen dieses Orts** anzeigen.

Eine neue aktive Anlegestelle in `data/berths.csv` erscheint dadurch künftig automatisch in den Sichtungs-Kurzbefehlen. Die Kurzbefehle selbst müssen dafür nicht mehr geändert werden.

## Betroffene Kurzbefehle

- **Schiffsichtung mit Foto(s)**
- **Schiffsichtung ohne Foto**

Der Kurzbefehl **Foto(s) zu Schiff hinzufügen** bleibt unverändert, weil dort keine neue Sichtung mit Anlegestelle erzeugt wird.

## Voraussetzung

Der vorhandene `X-Upload-Key` wird weiterverwendet. Es ist kein zusätzlicher Schlüssel erforderlich. Das entspricht dem bestehenden Abruf der Schiffsliste über `GET /vessel-names`.

## 1. Vor der Anlegestellenauswahl

Die vorhandenen Startwerte bleiben:

- `berth_status = unknown`
- `berth_id =` leer
- `berth_name_entered =` leer
- `alongside_position = unknown`

Bei `movement = moving` bleibt die bisherige Logik bestehen:

- `berth_status = not_applicable`
- keine Orts-/Anlegestellenauswahl;
- keine Liegepositionsfrage.

Die neue dynamische Auswahl wird nur im Zweig für **angelegt / moored** verwendet.

## 2. Orte dynamisch laden

### URL

`https://danube-vessel-api.daniel-koechler.workers.dev/berth-options`

### Aktion „Inhalt von URL abrufen“

- Methode: `GET`
- Header: `X-Upload-Key` = derselbe vorhandene Upload-Key wie beim Schiffsnamen-Abruf

Die Antwort enthält unter anderem:

```json
{
  "ok": true,
  "level": "municipality",
  "choices": [
    "Linz",
    "Pupping",
    "Anderer Ort",
    "Ort unbekannt"
  ],
  "value_by_choice": {
    "Linz": "Linz",
    "Pupping": "Pupping",
    "Anderer Ort": "unlisted",
    "Ort unbekannt": "unknown"
  }
}
```

### Im Kurzbefehl

1. Aus der Antwort den Wörterbuchwert `choices` abrufen.
2. Mit **Aus Liste auswählen** den Ort auswählen lassen.
3. Aus der Antwort den Wörterbuchwert `value_by_choice` abrufen.
4. Aus diesem Wörterbuch mit der sichtbaren Ortsauswahl als Schlüssel den technischen Wert abrufen.
5. Diesen Wert z. B. als Variable `berth_area_value` speichern.

## 3. Sonderfälle der Ortsauswahl

### `berth_area_value = unknown`

Setzen:

- `berth_status = unknown`
- `berth_id =` leer
- `berth_name_entered =` leer
- `alongside_position = unknown`

Danach keine weitere Anleger- oder Liegepositionsfrage.

### `berth_area_value = unlisted`

Der Ort bzw. die Anlegestelle ist noch nicht in `data/berths.csv` vorhanden.

Setzen:

- `berth_status = unlisted`
- `berth_id =` leer

Danach mit **Nach Eingabe fragen** den Namen der Anlegestelle erfassen und in `berth_name_entered` speichern.

Anschließend wie bisher die Liegeposition 1/2/3/Unbekannt abfragen.

## 4. Anlegestellen des gewählten Orts laden

Ist `berth_area_value` ein echter Ortsname, wird ein zweiter Abruf durchgeführt.

Den Ortsnamen vor dem Einsetzen in die URL mit der Kurzbefehle-Aktion zum **URL-Codieren** codieren.

Beispiel für Linz:

`https://danube-vessel-api.daniel-koechler.workers.dev/berth-options?municipality=Linz`

Wieder:

- Methode: `GET`
- Header: `X-Upload-Key` = vorhandener Upload-Key

Beispielantwort:

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
    "Andere Anlegestelle",
    "Anlegestelle unbekannt"
  ],
  "value_by_choice": {
    "Linz-Schloss Nr. 11": "BER-000001",
    "Linz-Nibelungen Nr. 12": "BER-000002",
    "Linz-Hauptplatz Nr. 13": "BER-000003",
    "Linz-Lentos Nr. 14": "BER-000004",
    "Linz 1 – Brucknerhaus": "BER-000005",
    "Linz 32": "BER-000006",
    "Andere Anlegestelle": "unlisted",
    "Anlegestelle unbekannt": "unknown"
  }
}
```

Für `Pupping` enthält `choices` derzeit automatisch `Brandstatt (Pupping)` plus die beiden Sonderauswahlen.

### Im Kurzbefehl

1. `choices` aus der zweiten Antwort abrufen.
2. Mit **Aus Liste auswählen** die Anlegestelle auswählen.
3. `value_by_choice` aus der zweiten Antwort abrufen.
4. Mit der sichtbaren Anlegerauswahl als Schlüssel den technischen Wert abrufen.
5. Den Wert z. B. als `berth_choice_value` speichern.

## 5. Technischen Anlegerwert auswerten

### Wert beginnt mit `BER-`

Bekannte Anlegestelle:

- `berth_status = matched`
- `berth_id = berth_choice_value`
- `berth_name_entered =` leer

Danach Liegeposition 1/2/3/Unbekannt abfragen.

### Wert = `unlisted`

- `berth_status = unlisted`
- `berth_id =` leer
- mit **Nach Eingabe fragen** den Namen erfassen und in `berth_name_entered` speichern
- danach Liegeposition 1/2/3/Unbekannt abfragen

### Wert = `unknown`

- `berth_status = unknown`
- `berth_id =` leer
- `berth_name_entered =` leer
- `alongside_position = unknown`
- keine Liegepositionsfrage

## 6. Liegeposition

Die bestehende 0.15.0-Logik bleibt unverändert:

- `1 – direkt am Anleger` → `1`
- `2 – zweite Reihe` → `2`
- `3 – dritte Reihe` → `3`
- `Unbekannt` → `unknown`

Die Frage wird nur gestellt, wenn `berth_status` `matched` oder `unlisted` ist.

## 7. JSON der Sichtung

Am bestehenden Submission-JSON ändert sich nichts. Es werden weiterhin die vorhandenen Felder verwendet:

```json
{
  "movement": "[movement]",
  "direction": "[direction]",
  "berth_status": "[berth_status]",
  "berth_id": "[berth_id]",
  "berth_name_entered": "[berth_name_entered]",
  "alongside_position": "[alongside_position]"
}
```

Die technische `berth_id` bleibt damit die stabile Verknüpfung im Datenmodell. Der sichtbare Name im Kurzbefehl ist nur die Auswahloberfläche.

## 8. Verhalten bei neuen Anlegern

Für einen neuen Anleger ist künftig nur noch die Datenpflege erforderlich:

1. neuen Datensatz in `data/berths.csv` ergänzen;
2. `active = true` setzen;
3. committen;
4. Worker liest die aktuelle CSV beim nächsten Abruf automatisch ein.

Wenn der Anleger zu einer bereits vorhandenen Gemeinde gehört, erscheint er automatisch im zweiten Menü dieser Gemeinde. Eine neue Gemeinde erscheint automatisch im ersten Menü.

Es ist **keine Änderung an den beiden iPhone-Kurzbefehlen** nötig.

## 9. Empfohlener Test nach dem Worker-Deployment

Je einen Test durchführen:

1. `Linz` → `Linz-Nibelungen Nr. 12` → Position 1;
2. `Pupping` → `Brandstatt (Pupping)` → Position 1;
3. bekannter Ort → `Andere Anlegestelle` → Freitext;
4. bekannter Ort → `Anlegestelle unbekannt`;
5. `Anderer Ort` → Freitext;
6. `Ort unbekannt`;
7. Sichtung `moving` → keine Orts-/Anlegerauswahl.

Erst wenn diese Tests funktionieren, die identische Auswahlstruktur in den zweiten Sichtungs-Kurzbefehl übernehmen.
