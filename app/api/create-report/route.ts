import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

var supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

function generateId(): string {
  var chars = "abcdef0123456789";
  var id = "";
  for (var i = 0; i < 12; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

async function geocodeAddress(address: string, city: string, state: string, zip: string): Promise<{ lat: number; lng: number } | null> {
  var fullAddress = address + ", " + city + ", " + state + " " + zip;
  var googleKey = process.env.GOOGLE_GEOCODE_KEY;

  // Try 1: Google Geocoding API (most accurate, handles new subdivisions)
  if (googleKey) {
    try {
      var googleUrl = "https://maps.googleapis.com/maps/api/geocode/json?address=" + encodeURIComponent(fullAddress) + "&key=" + googleKey;
      var rg = await fetch(googleUrl, { signal: AbortSignal.timeout(5000) });
      if (rg.ok) {
        var dg = await rg.json();
        if (dg.status === "OK" && dg.results && dg.results.length > 0) {
          var loc = dg.results[0].geometry.location;
          return { lat: loc.lat, lng: loc.lng };
        }
      }
    } catch (e) { /* fall through */ }
  }

  // Try 2: Full address via Census API (free fallback)
  try {
    var censusUrl = "https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?address=" + encodeURIComponent(fullAddress) + "&benchmark=Public_AR_Current&format=json";
    var r1 = await fetch(censusUrl, { signal: AbortSignal.timeout(5000) });
    if (r1.ok) {
      var d1 = await r1.json();
      if (d1.result && d1.result.addressMatches && d1.result.addressMatches.length > 0) {
        var match = d1.result.addressMatches[0].coordinates;
        return { lat: match.y, lng: match.x };
      }
    }
  } catch (e) { /* fall through */ }

  // Try 3: Full address via Nominatim (free fallback)
  try {
    var nomUrl = "https://nominatim.openstreetmap.org/search?q=" + encodeURIComponent(fullAddress) + "&format=json&limit=1&countrycodes=us";
    var r2 = await fetch(nomUrl, { headers: { "User-Agent": "WaterReportApp/1.0" }, signal: AbortSignal.timeout(5000) });
    if (r2.ok) {
      var d2 = await r2.json();
      if (d2.length > 0) return { lat: parseFloat(d2[0].lat), lng: parseFloat(d2[0].lon) };
    }
  } catch (e) { /* fall through */ }

  // Try 4: Just city + state + zip via Google (safety net with precision)
  if (googleKey) {
    try {
      var cityQuery = city + ", " + state + " " + zip;
      var rg2 = await fetch("https://maps.googleapis.com/maps/api/geocode/json?address=" + encodeURIComponent(cityQuery) + "&key=" + googleKey, { signal: AbortSignal.timeout(5000) });
      if (rg2.ok) {
        var dg2 = await rg2.json();
        if (dg2.status === "OK" && dg2.results && dg2.results.length > 0) {
          var loc2 = dg2.results[0].geometry.location;
          return { lat: loc2.lat, lng: loc2.lng };
        }
      }
    } catch (e) { /* fall through */ }
  }

  // Try 5: Just city + state + zip via Nominatim (last resort)
  try {
    var cityQuery2 = city + ", " + state + " " + zip;
    var r3 = await fetch("https://nominatim.openstreetmap.org/search?q=" + encodeURIComponent(cityQuery2) + "&format=json&limit=1&countrycodes=us", { headers: { "User-Agent": "WaterReportApp/1.0" }, signal: AbortSignal.timeout(5000) });
    if (r3.ok) {
      var d3 = await r3.json();
      if (d3.length > 0) return { lat: parseFloat(d3[0].lat), lng: parseFloat(d3[0].lon) };
    }
  } catch (e) { /* no geocode */ }
  return null;
}

export async function POST(request: NextRequest) {
  try {
    // ─── Authenticate: find company by API secret ───
    var authHeader = request.headers.get("Authorization") || "";
    var secret = authHeader.replace("Bearer ", "").trim();
    if (!secret) {
      return NextResponse.json({ error: "Missing Authorization header" }, { status: 401 });
    }

    var { data: company, error: companyError } = await supabase
      .from("companies")
      .select("id, domain, slug")
      .eq("api_secret", secret)
      .eq("active", true)
      .single();

    if (companyError || !company) {
      return NextResponse.json({ error: "Invalid API secret" }, { status: 401 });
    }

    // ─── Parse body ───
    var body = await request.json();
    var { client_name, address, city, state, zip, phone, lat, lng } = body;

    if (!client_name || !address || !city || !state || !zip) {
      return NextResponse.json({ error: "Missing required fields: client_name, address, city, state, zip" }, { status: 400 });
    }

    // ─── Geocode if needed ───
    var geocoded = false;
    if (!lat || !lng) {
      var coords = await geocodeAddress(address, city, state, zip);
      if (coords) { lat = coords.lat; lng = coords.lng; geocoded = true; }
    }

    // ─── Create report ───
    var id = generateId();
    var { error: insertError } = await supabase.from("reports").insert({
      id: id,
      client_name: client_name,
      address: address,
      city: city,
      state: state,
      zip: zip,
      phone: phone || null,
      lat: lat || null,
      lng: lng || null,
      company_id: company.id
    });

    if (insertError) {
      return NextResponse.json({ error: "Failed to create report", details: insertError.message }, { status: 500 });
    }

    // Build URL using company's custom domain
    var domain = company.domain || request.headers.get("host") || "localhost:3000";
    var protocol = domain.includes("localhost") ? "http" : "https";
    var url = protocol + "://" + domain + "/report?id=" + id;

    return NextResponse.json({
      id: id,
      url: url,
      company: company.slug,
      geocoded: geocoded,
      coordinates: lat && lng ? { lat: lat, lng: lng } : null
    });

  } catch (err: any) {
    return NextResponse.json({ error: "Server error", details: err.message }, { status: 500 });
  }
}
