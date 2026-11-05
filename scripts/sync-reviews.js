const fs = require("fs");
const path = require("path");

const PLACE_ID = "ChIJzQeWRGqvbUcRpvOyffsIFT8";
const API_KEY = process.env.GOOGLE_PLACES_API_KEY;
const OUTPUT_PATH = path.join(process.cwd(), "public/reviews.json");

const FALLBACK_REVIEWS = [
  {
    review_id: "fallback_1",
    name: "Marlene H.",
    rating: 5,
    text: "Matthias hat unsere Hochzeit so wunderschön festgehalten – die Bilder sind einfach atemberaubend.",
    date: "2024-09-14",
    profile_photo_url: "",
  },
  {
    review_id: "fallback_2",
    name: "Thomas B.",
    rating: 5,
    text: "Tolle Drohnenaufnahmen für unser Firmenevent. Schnelle Kommunikation, top Ergebnis.",
    date: "2024-11-03",
    profile_photo_url: "",
  },
  {
    review_id: "fallback_3",
    name: "Sandra K.",
    rating: 5,
    text: "Die Fotos für unsere Website sind genau das, was wir uns vorgestellt haben.",
    date: "2025-01-22",
    profile_photo_url: "",
  },
];

// Bei Fehlern bestehende (echte) Bewertungen behalten; Fallback nur, wenn noch keine Datei existiert
function keepExistingOrFallback(reason) {
  if (fs.existsSync(OUTPUT_PATH)) {
    console.log(`::warning::${reason} – bestehende reviews.json bleibt unverändert.`);
    return;
  }
  console.log(`${reason} – keine bestehende Datei, Fallback wird verwendet.`);
  write(FALLBACK_REVIEWS);
}

async function fetchReviews() {
  if (!API_KEY) {
    return keepExistingOrFallback("Kein API Key (Secret GOOGLE_PLACES_API_KEY fehlt)");
  }

  const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${PLACE_ID}&fields=reviews&reviews_sort=newest&language=de&key=${API_KEY}`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!res.ok) {
      return keepExistingOrFallback(`Google API HTTP ${res.status}`);
    }
    const data = await res.json();
    console.log("API Status:", data.status);

    if (data.status !== "OK") {
      const detail = data.error_message ? ` (${data.error_message})` : "";
      return keepExistingOrFallback(`Google API Status ${data.status}${detail}`);
    }
    if (!data.result?.reviews?.length) {
      return keepExistingOrFallback("Keine Reviews in der API-Antwort");
    }

    const fetched = data.result.reviews
      .filter((r) => r.rating >= 4)
      .map((r) => ({
        review_id: `google_${r.time}`,
        name: r.author_name,
        rating: r.rating,
        text: r.text,
        date: new Date(r.time * 1000).toISOString().split("T")[0],
        profile_photo_url: r.profile_photo_url ?? "",
      }));

    if (!fetched.length) {
      return keepExistingOrFallback("Keine Reviews mit mindestens 4 Sternen");
    }

    const { reviews, added, updated } = mergeReviews(readExisting(), fetched);
    write(reviews);
    console.log(`${fetched.length} Reviews abgerufen, ${added} neu, ${updated} aktualisiert, ${reviews.length} gesamt gespeichert.`);
  } catch (err) {
    keepExistingOrFallback(`Fehler beim Abruf: ${err.name === "TimeoutError" ? "Zeitüberschreitung" : err.message}`);
  }
}

// Bereits gespeicherte echte Bewertungen lesen (Platzhalter werden ignoriert)
function readExisting() {
  try {
    const data = JSON.parse(fs.readFileSync(OUTPUT_PATH, "utf-8"));
    return (data.reviews ?? []).filter((r) => !String(r.review_id).startsWith("fallback_"));
  } catch {
    return [];
  }
}

// Neue Bewertungen zu den gespeicherten ergänzen. Pro Verfasser bleibt nur ein Eintrag:
// Bearbeitet jemand seine Bewertung, ersetzt die neuere Fassung die ältere.
function mergeReviews(existing, fetched) {
  const byAuthor = new Map(existing.map((r) => [r.name, r]));
  let added = 0;
  let updated = 0;
  for (const r of fetched) {
    const prev = byAuthor.get(r.name);
    if (!prev) {
      added++;
      byAuthor.set(r.name, r);
    } else if (prev.review_id !== r.review_id || prev.text !== r.text || prev.rating !== r.rating) {
      updated++;
      byAuthor.set(r.name, r);
    }
  }
  const reviews = [...byAuthor.values()].sort(
    (a, b) => b.date.localeCompare(a.date) || String(b.review_id).localeCompare(String(a.review_id))
  );
  return { reviews, added, updated };
}

function write(reviews) {
  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify({ reviews }, null, 2), "utf-8");
  console.log("Datei geschrieben:", OUTPUT_PATH);
}

fetchReviews();
