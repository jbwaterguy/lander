import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import crypto from "crypto";

/**
 * POST /api/create-report
 *
 * Auto-geocodes the address if lat/lng not provided.
 * lat/lng are now fully optional — just pass the street address.
 */

async function geocodeAddress(address: string, city: string, state: string, zip: string): Promise<{ lat: number; lng: number } | null> {
  const fullAddress = `${address}, ${city}, ${state} ${zip}`;
  
  // Try US Census Geocoder first (free, no key needed)
  try {
    const censusUrl = `https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?address=${encodeURIComponent(fullAddress)}&benchmark=Public_AR_Current&format=json`;
    const res = await fetch(censusUrl, { signal: AbortSignal.timeout(5000) });
    const data = await res.json();
    const match = data?.result?.addressMatches?.[0];
    if (match?.coordinates) {
      return { lat: match.coordinates.y, lng: match.coordinates.x };
    }
  } catch (e) {
    console.error("Census geocoder failed:", e);
  }

  // Fallback: OpenStreetMap Nominatim (free, no key needed)
  try {
    const nominatimUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(fullAddress)}&format=json&limit=1`;
    const res = await fetch(nominatimUrl, {
      headers: { "User-Agent": "AquaClearWaterReports/1.0" },
      signal: AbortSignal.timeout(5000),
    });
    const data = await res.json();
    if (data?.[0]) {
      return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
    }
  } catch (e) {
    console.error("Nominatim geocoder failed:", e);
  }

  return null;
}

export async function POST(request: NextRequest) {
  // — Auth check —
  const authHeader = request.headers.get("authorization");
  const expectedToken = `Bearer ${process.env.API_SECRET}`;

  if (!authHeader || authHeader !== expectedToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();

    // — Validate required fields —
    const { client_name, address, city, state, zip } = body;
    if (!client_name || !address || !city || !state || !zip) {
      return NextResponse.json(
        { error: "Missing required fields: client_name, address, city, state, zip" },
        { status: 400 }
      );
    }

    // — Auto-geocode if lat/lng not provided —
    let lat = body.lat || null;
    let lng = body.lng || null;

    if (!lat || !lng) {
      const coords = await geocodeAddress(address, city, state, zip);
      if (coords) {
        lat = coords.lat;
        lng = coords.lng;
      }
    }

    // — Generate unique report ID (short, URL-safe) —
    const report_id = crypto.randomBytes(6).toString("hex");

    // — Insert into Supabase —
    const { error } = await supabaseAdmin.from("reports").insert({
      id: report_id,
      client_name: body.client_name,
      address: body.address,
      city: body.city,
      state: body.state,
      zip: body.zip,
      phone: body.phone || null,
      lat,
      lng,
      created_at: new Date().toISOString(),
      viewed: false,
    });

    if (error) {
      console.error("Supabase insert error:", error);
      return NextResponse.json(
        { error: "Failed to create report" },
        { status: 500 }
      );
    }

    // — Return the unique URL —
    const baseUrl =
      process.env.NEXT_PUBLIC_SITE_URL ||
      `https://${request.headers.get("host")}`;
    const reportUrl = `${baseUrl}/report?id=${report_id}`;

    return NextResponse.json({
      success: true,
      report_id,
      url: reportUrl,
      geocoded: !body.lat || !body.lng ? true : false,
      coordinates: { lat, lng },
    });
  } catch (err) {
    console.error("Create report error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
