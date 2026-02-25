import { NextRequest, NextResponse } from "next/server";
import { fetchContaminants } from "@/lib/water-api";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest) {
  try {
    const results = await fetchContaminants("37934", "Farragut", "TN");
    return NextResponse.json({
      count: results.length,
      contaminants: results,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message });
  }
}
