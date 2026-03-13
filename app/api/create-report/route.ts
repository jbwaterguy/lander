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
  try {
    var nomUrl = "https://nominatim.openstreetmap.org/search?q=" + encodeURIComponent(fullAddress) + "&format=json&limit=1&countrycodes=us";
    var r2 = await fetch(nomUrl, { headers: { "User-Agent": "WaterReportApp/1.0" }, signal: AbortSignal.timeout(5000) });
    if (r2.ok) {
      var d2 = await r2.json();
      if (d2.length > 0) return { lat: parseFloat(d2[0].lat), lng: parseFloat(d2[0].lon) };
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
