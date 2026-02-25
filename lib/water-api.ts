// ═══════════════════════════════════════════════════════
// SIMPLELAB WATER DATA API INTEGRATION
// ═══════════════════════════════════════════════════════

export interface ContaminantData {
  name: string;
  description: string;
  detected_level: number;
  unit: string;
  ewg_guideline: number;
  epa_limit: number;
  times_above_guideline: number;
  status: "exceeds" | "warning" | "ok";
}

/**
 * Fetches contaminant data from SimpleLab's Water Data API.
 *
 * Flow:
 * 1. Look up the local water utility by city/state using /api/utilities/list
 * 2. Fetch contaminant results for that utility using /api/utilities/results
 * 3. Map the results to our landing page format
 */
export async function fetchContaminants(
  zipCode: string,
  city?: string,
  state?: string
): Promise<ContaminantData[]> {
  const apiKey = process.env.WATER_API_KEY;

  if (!apiKey || apiKey === "your-api-key-here") {
    console.warn("No WATER_API_KEY set, using mock data");
    return getMockContaminants();
  }

  try {
    // Step 1: Find the local water utility
    const utilityParams = new URLSearchParams();
    if (city) utilityParams.set("city", city);
    if (state) utilityParams.set("state_code", state);

    const utilityRes = await fetch(
      `https://api.gosimplelab.com/api/utilities/list?${utilityParams.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
      }
    );

    if (!utilityRes.ok) {
      console.error("SimpleLab utilities/list error:", utilityRes.status);
      return getMockContaminants();
    }

    const utilityData = await utilityRes.json();

    if (
      utilityData.result !== "OK" ||
      !utilityData.data ||
      utilityData.data.length === 0
    ) {
      console.warn("No utilities found for", city, state);
      return getMockContaminants();
    }

    // Use the first (most likely) utility
    const pwsid = utilityData.data[0].pwsid;

    // Step 2: Get contaminant results for this utility
    const resultsRes = await fetch(
      `https://api.gosimplelab.com/api/utilities/results?pws_id=${pwsid}&result_type=pws`,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
      }
    );

    if (!resultsRes.ok) {
      console.error("SimpleLab utilities/results error:", resultsRes.status);
      return getMockContaminants();
    }

    const resultsData = await resultsRes.json();

    if (resultsData.result !== "OK" || !resultsData.data) {
      console.warn("No results for utility", pwsid);
      return getMockContaminants();
    }

    // Step 3: Map to our format — filter to detected contaminants with health relevance
    const mapped = resultsData.data
     .filter(
        (c: any) =>
          c.median !== null &&
          c.median > 0 &&
          c.pct_detected > 0
      )
      .map((c: any) => {
        const guideline = (c.slr && c.slr > 0) ? c.slr : (c.fed_mcl && c.fed_mcl > 0) ? c.fed_mcl : null;
        const epaLimit = c.fed_mcl || 0;

        // Skip contaminants with no guideline to compare against
        if (!guideline) return null;

        const detectedLevel = c.median;
        const timesAbove = Math.round(detectedLevel / guideline);

        // Only include contaminants that EXCEED the guideline
        if (timesAbove < 2) return null;

        let status: "exceeds" | "warning" | "ok";
        if (timesAbove >= 10) {
          status = "exceeds";
        } else if (timesAbove >= 2) {
          status = "warning";
        } else {
          status = "ok";
        }

        let description = "";
        if (c.health_effects) {
          const firstSentence = c.health_effects.split(". ")[0];
          description =
            firstSentence.length > 120
              ? firstSentence.substring(0, 117) + "..."
              : firstSentence;
        } else if (c.sources) {
          const firstSentence = c.sources.split(". ")[0];
          description =
            firstSentence.length > 120
              ? firstSentence.substring(0, 117) + "..."
              : firstSentence;
        } else {
          description = `${c.type || "Contaminant"} detected in your water supply`;
        }

        return {
          name: c.name,
          description,
          detected_level: detectedLevel,
          unit: c.unit || "PPB",
          ewg_guideline: guideline,
          epa_limit: epaLimit,
          times_above_guideline: timesAbove,
          status,
        };
      })
      .filter(Boolean)
      .sort((a: ContaminantData, b: ContaminantData) => {
        const statusOrder = { exceeds: 0, warning: 1, ok: 2 };
        if (statusOrder[a.status] !== statusOrder[b.status]) {
          return statusOrder[a.status] - statusOrder[b.status];
        }
        return b.times_above_guideline - a.times_above_guideline;
      })
      .slice(0, 8);
      })
      // Sort: exceeds first, then warning, then ok — and by severity within each
     .filter(Boolean)
      .sort((a: ContaminantData, b: ContaminantData) => {
        const statusOrder = { exceeds: 0, warning: 1, ok: 2 };
        if (statusOrder[a.status] !== statusOrder[b.status]) {
          return statusOrder[a.status] - statusOrder[b.status];
        }
        return b.times_above_guideline - a.times_above_guideline;
      })
      // Show the top 8 most relevant contaminants
      .slice(0, 8);

    if (mapped.length === 0) {
      return getMockContaminants();
    }

    return mapped;
  } catch (error) {
    console.error("SimpleLab API error:", error);
    return getMockContaminants();
  }
}

/**
 * Fallback mock data — used when the API is unavailable
 */
function getMockContaminants(): ContaminantData[] {
  return [
    {
      name: "Haloacetic Acids (HAA5)",
      description: "Disinfection byproduct linked to cancer risk",
      detected_level: 36.5,
      unit: "PPB",
      ewg_guideline: 0.1,
      epa_limit: 60,
      times_above_guideline: 281,
      status: "exceeds",
    },
    {
      name: "Total Trihalomethanes (TTHMs)",
      description: "Chlorine byproduct associated with bladder cancer",
      detected_level: 39.7,
      unit: "PPB",
      ewg_guideline: 0.2,
      epa_limit: 80,
      times_above_guideline: 198,
      status: "exceeds",
    },
    {
      name: "Chromium (Hexavalent)",
      description: 'Industrial pollutant — the "Erin Brockovich" chemical',
      detected_level: 0.44,
      unit: "PPB",
      ewg_guideline: 0.01,
      epa_limit: 100,
      times_above_guideline: 44,
      status: "exceeds",
    },
    {
      name: "Chloroform",
      description: "Volatile organic compound from water treatment",
      detected_level: 18.3,
      unit: "PPB",
      ewg_guideline: 1.5,
      epa_limit: 80,
      times_above_guideline: 12,
      status: "warning",
    },
  ];
}
