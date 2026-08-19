# iPhone-Kurzbefehl „Schiffsichtung mit Foto(s)“ – Fotoindividuelle Metadaten

Stand: Danube Vessel Log 0.14.27 · 19.08.2026

## Ziel

Bei einer Mehrfachfoto-Sichtung erhält **jedes einzelne Foto** eigene Aufnahme-Metadaten:

- `captured_at`
- `photo_lat`
- `photo_lon`

Der Worker löst daraus für jedes Foto separat den Aufnahmeort über `data/location_areas.geojson` auf.

Damit kann eine einzige Sichtung z. B. enthalten:

- Foto 1–3: `Untere Donaulände, Linz`
- Foto 4–7: `Nibelungenbrücke, Linz`

## Wichtige Änderung im Kurzbefehl

Die bisherige gemeinsame Metadatenstruktur bleibt für die Rückwärtskompatibilität bestehen. Zusätzlich wird ein Array `photo_metadata` erzeugt, dessen Reihenfolge **genau der Reihenfolge der hochgeladenen Fotos** entspricht.

Beispiel:

```json
{
  "captured_at": "2026-08-19T08:14:03+02:00",
  "photo_lat": 48.3074,
  "photo_lon": 14.2879,
  "vessel_name_entered": "Beispielschiff",
  "vessel_id": "VES-000123",
  "notes": "",
  "photo_metadata": [
    {
      "captured_at": "2026-08-19T08:14:03+02:00",
      "photo_lat": 48.3074,
      "photo_lon": 14.2879
    },
    {
      "captured_at": "2026-08-19T08:18:41+02:00",
      "photo_lat": 48.3086,
      "photo_lon": 14.2847
    }
  ]
}
```

## Aufbau in Apple Kurzbefehle

1. Nach der Auswahl der Fotos eine Aktion **„Mit jedem wiederholen“** über die ausgewählten Fotos verwenden.
2. Für **„Wiederholungselement“** je Foto die Aufnahmezeit ermitteln und in ISO-kompatibler Form formatieren.
3. Für dasselbe Wiederholungselement dessen Aufnahmeort ermitteln.
4. Aus dem Aufnahmeort Breitengrad und Längengrad lesen.
5. Pro Foto ein Wörterbuch mit exakt diesen Schlüsseln erzeugen:
   - `captured_at`
   - `photo_lat`
   - `photo_lon`
6. Jedes Wörterbuch einer gemeinsamen Liste/Variable `photo_metadata` hinzufügen.
7. Nach Ende der Wiederholung die Liste als Wert des Schlüssels `photo_metadata` in das bisherige JSON-Metadatenobjekt aufnehmen.
8. Die Reihenfolge der Foto-Liste und der `photo_metadata`-Liste darf anschließend nicht mehr getrennt sortiert oder verändert werden.

## Fotos ohne GPS

Hat ein einzelnes Foto keinen Aufnahmeort, bleiben `photo_lat` und `photo_lon` für dieses Foto leer/null. Der Worker zeigt für dieses Foto dann `Aufnahmeort unbekannt` an. Andere Fotos derselben Sichtung bleiben davon unberührt.

## Rückwärtskompatibilität

Fehlt `photo_metadata`, verarbeitet der Worker die Sichtung weiterhin wie bisher. Es werden dann **keine fotoindividuellen Metadaten erfunden**.

## Darstellung im Viewer

Für neue Foto-Metadaten zeigt die Schiffsdetailseite die Aufnahmezeit und den Aufnahmeort direkt **unter jedem Foto** an. Damit ist die Information auch am iPhone ohne Mouseover verfügbar.

Der Sichtungskopf wird aus den aktuell noch vorhandenen Fotos abgeleitet:

- ein eindeutiger Foto-Aufnahmeort → dieser Ort wird angezeigt;
- mehrere unterschiedliche Foto-Aufnahmeorte → `Mehrere Aufnahmeorte: …`;
- keine fotoindividuellen Daten → Rückfall auf den bisherigen Sichtungsort.

Wird ein Foto gelöscht, wird auch `data/sightings.json` neu aufgebaut. Da die Überschrift aus den verbleibenden Foto-Metadaten gebildet wird, verschwindet ein Aufnahmeort automatisch aus dem Text, sobald kein verbleibendes Foto mehr diesem Ort zugeordnet ist.
