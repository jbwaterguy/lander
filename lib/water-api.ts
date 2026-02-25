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

    if (utilityData.result !== "OK" || !utilityData.data || utilityData.data.length === 0) {
      console.warn("No utilities found for", city, state);
      return getMockContaminants();
    }

    const pwsid = utilityData.data[0].pwsid;

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

        if (!guideline) return null;

        const detectedLevel = c.median;
        const timesAbove = Math.round(detectedLevel / guideline);

        if (timesAbove < 2) return null;

        let status: "exceeds" | "warning" | "ok";
