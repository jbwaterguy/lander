// ═══════════════════════════════════════════════════════
// WATER CONTAMINANT API INTEGRATION
// ═══════════════════════════════════════════════════════
// This file fetches contaminant data for a given zip code.
// Replace the fetchContaminants function body with your actual API call.
// The rest of the app expects the ContaminantData[] format below.

export interface ContaminantData {
  name: string;
  description: string;
  detected_level: number;
  unit: string;
  ewg_guideline: number;
  epa_limit: number;
  times_above_guideline: number; // e.g. 281 means "281x above guideline"
  status: "exceeds" | "warning" | "ok";
}

export async function fetchContaminants(
  zipCode: string
): Promise<ContaminantData[]> {
  // ─────────────────────────────────────────────
  // OPTION 1: Your real API (uncomment & customize)
  // ─────────────────────────────────────────────
  // const response = await fetch(
  //   `${process.env.WATER_API_URL}?zip=${zipCode}`,
  //   {
  //     headers: {
  //       "Authorization": `Bearer ${process.env.WATER_API_KEY}`,
  //       "Content-Type": "application/json",
  //     },
  //   }
  // );
  //
  // if (!response.ok) {
  //   throw new Error(`Water API error: ${response.status}`);
  // }
  //
  // const rawData = await response.json();
  //
  // // Map your API's response shape to our ContaminantData format:
  // return rawData.contaminants.map((c: any) => ({
  //   name: c.contaminant_name,
  //   description: c.health_effect || "Detected in your water supply",
  //   detected_level: c.amount_detected,
  //   unit: c.unit || "ppb",
  //   ewg_guideline: c.ewg_health_guideline,
  //   epa_limit: c.epa_mcl,
  //   times_above_guideline: Math.round(c.amount_detected / c.ewg_health_guideline),
  //   status:
  //     c.amount_detected > c.ewg_health_guideline * 10
  //       ? "exceeds"
  //       : c.amount_detected > c.ewg_health_guideline
  //       ? "warning"
  //       : "ok",
  // }));

  // ─────────────────────────────────────────────
  // OPTION 2: Mock data (remove once your API is connected)
  // ─────────────────────────────────────────────
  return getMockContaminants(zipCode);
}

function getMockContaminants(_zipCode: string): ContaminantData[] {
  return [
    {
      name: "Haloacetic Acids (HAA5)",
      description: "Disinfection byproduct linked to cancer risk",
      detected_level: 36.5,
      unit: "ppb",
      ewg_guideline: 0.1,
      epa_limit: 60,
      times_above_guideline: 281,
      status: "exceeds",
    },
    {
      name: "Total Trihalomethanes (TTHMs)",
      description: "Chlorine byproduct associated with bladder cancer",
      detected_level: 39.7,
      unit: "ppb",
      ewg_guideline: 0.2,
      epa_limit: 80,
      times_above_guideline: 198,
      status: "exceeds",
    },
    {
      name: "Chromium (Hexavalent)",
      description: 'Industrial pollutant — the "Erin Brockovich" chemical',
      detected_level: 0.44,
      unit: "ppb",
      ewg_guideline: 0.01,
      epa_limit: 100,
      times_above_guideline: 44,
      status: "exceeds",
    },
    {
      name: "Chloroform",
      description: "Volatile organic compound from water treatment",
      detected_level: 18.3,
      unit: "ppb",
      ewg_guideline: 1.5,
      epa_limit: 80,
      times_above_guideline: 12,
      status: "warning",
    },
    {
      name: "Nitrate",
      description: "Runoff contaminant affecting infant health",
      detected_level: 1.2,
      unit: "ppm",
      ewg_guideline: 0.14,
      epa_limit: 10,
      times_above_guideline: 8,
      status: "warning",
    },
    {
      name: "Lead",
      description: "Heavy metal from aging pipes and fixtures",
      detected_level: 2.1,
      unit: "ppb",
      ewg_guideline: 0,
      epa_limit: 15,
      times_above_guideline: 0,
      status: "ok",
    },
  ];
}
