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

  const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${PLACE_ID}&fields=reviews&language=de&key=${API_KEY}`;

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

    const reviews = data.result.reviews
      .filter((r) => r.rating >= 4)
      .map((r) => ({
        review_id: `google_${r.time}`,
        name: r.author_name,
        rating: r.rating,
        text: r.text,
        date: new Date(r.time * 1000).toISOString().split("T")[0],
        profile_photo_url: r.profile_photo_url ?? "",
      }));

    if (!reviews.length) {
      return keepExistingOrFallback("Keine Reviews mit mindestens 4 Sternen");
    }
    write(reviews);
    console.log(`${reviews.length} Reviews gespeichert.`);
  } catch (err) {
    keepExistingOrFallback(`Fehler beim Abruf: ${err.name === "TimeoutError" ? "Zeitüberschreitung" : err.message}`);
  }
}

function write(reviews) {
  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify({ reviews }, null, 2), "utf-8");
  console.log("Datei geschrieben:", OUTPUT_PATH);
}

fetchReviews();
