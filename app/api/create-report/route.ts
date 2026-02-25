import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import crypto from "crypto";

/**
 * POST /api/create-report
 *
 * Called by Zapier when a job is scheduled in your CRM.
 *
 * Request body:
 * {
 *   "client_name": "Sarah & James Mitchell",
 *   "address": "742 Maple Creek Drive",
 *   "city": "Farragut",
 *   "state": "TN",
 *   "zip": "37934",
 *   "phone": "865-555-1234",       // optional, for tracking
 *   "lat": 35.8868,                 // optional — if not provided, you'll need geocoding
 *   "lng": -84.1530                 // optional
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "report_id": "a1b2c3d4",
 *   "url": "https://yourdomain.com/report?id=a1b2c3d4"
 * }
 *
 * ZAPIER SETUP:
 * 1. Use "Webhooks by Zapier" > "POST" action
 * 2. URL: https://your-vercel-domain.com/api/create-report
 * 3. Headers: { "Authorization": "Bearer YOUR_API_SECRET", "Content-Type": "application/json" }
 * 4. Body: map fields from your CRM trigger
 */
export async function POST(request: NextRequest) {
  // ── Auth check ──
  const authHeader = request.headers.get("authorization");
  const expectedToken = `Bearer ${process.env.API_SECRET}`;

  if (!authHeader || authHeader !== expectedToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();

    // ── Validate required fields ──
    const { client_name, address, city, state, zip } = body;
    if (!client_name || !address || !city || !state || !zip) {
      return NextResponse.json(
        { error: "Missing required fields: client_name, address, city, state, zip" },
        { status: 400 }
      );
    }

    // ── Generate unique report ID (short, URL-safe) ──
    const report_id = crypto.randomBytes(6).toString("hex"); // 12-char hex string

    // ── Insert into Supabase ──
    const { error } = await supabaseAdmin.from("reports").insert({
      id: report_id,
      client_name: body.client_name,
      address: body.address,
      city: body.city,
      state: body.state,
      zip: body.zip,
      phone: body.phone || null,
      lat: body.lat || null,
      lng: body.lng || null,
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

    // ── Return the unique URL ──
    const baseUrl =
      process.env.NEXT_PUBLIC_SITE_URL ||
      `https://${request.headers.get("host")}`;
    const reportUrl = `${baseUrl}/report?id=${report_id}`;

    return NextResponse.json({
      success: true,
      report_id,
      url: reportUrl,
    });
  } catch (err) {
    console.error("Create report error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
