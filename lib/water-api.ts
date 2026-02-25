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
    return getMockContaminants();
  }

  try {
    const utilityParams = new URLSearchParams();
    if (city) utilityParams.set("city", city);
    if (state) utilityParams.set("state_code", state);

    const utilityRes = await fetch(
      "https://api.gosimplelab.com/api/utilities/list?" + utilityParams.toString(),
      {
        headers: {
          "Authorization": "Bearer " + apiKey,
          "Content-Type": "application/json",
          "Accept": "application/json",
        },
      }
    );

    if (!utilityRes.ok) {
      return getMockContaminants();
    }

    const utilityData = await utilityRes.json();

    if (utilityData.result !== "OK" || !utilityData.data || utilityData.data.length === 0) {
      return getMockContaminants();
    }

    const pwsid = utilityData.data[0].pwsid;

    const resultsRes = await fetch(
      "https://api.gosimplelab.com/api/utilities/results?pws_id=" + pwsid + "&result_type=pws",
      {
        headers: {
          "Authorization": "Bearer " + apiKey,
          "Content-Type": "application/json",
          "Accept": "application/json",
        },
      }
    );

    if (!resultsRes.ok) {
      return getMockContaminants();
    }

    const resultsData = await resultsRes.json();

    if (resultsData.result !== "OK" || !resultsData.data) {
      return getMockContaminants();
    }

    var mapped: ContaminantData[] = [];

    for (var i = 0; i < resultsData.data.length; i++) {
      var c = resultsData.data[i];

      var detected = c.max || c.median;
      if (detected === null || detected === undefined || detected <= 0) continue;

      var detRate = c.detection_rate;
      if (detRate) {
        var parsed = parseFloat(String(detRate).replace("%", ""));
        if (parsed <= 0) continue;
      }

      var guideline = null;
      if (c.slr !== null && c.slr !== undefined && c.slr > 0) {
        guideline = c.slr;
      } else if (c.fed_mcl !== null && c.fed_mcl !== undefined && c.fed_mcl > 0) {
        guideline = c.fed_mcl;
      }

      if (!guideline) continue;

      var timesAbove = Math.round(detected / guideline);

      if (timesAbove < 2) continue;

      var status: "exceeds" | "warning" | "ok" = "ok";
      if (timesAbove >= 10) {
        status = "exceeds";
      } else if (timesAbove >= 2) {
        status = "warning";
      }

      var description = "";
      if (c.health_effects) {
        var sentence = c.health_effects.split(". ")[0];
        description = sentence.length > 120 ? sentence.substring(0, 117) + "..." : sentence;
      } else if (c.sources) {
        var sentence2 = c.sources.split(". ")[0];
        description = sentence2.length > 120 ? sentence2.substring(0, 117) + "..." : sentence2;
      } else {
        description = (c.type || "Contaminant") + " detected in your water supply";
      }

      mapped.push({
        name: c.name,
        description: description,
        detected_level: detected,
        unit: c.unit || "PPB",
        ewg_guideline: guideline,
        epa_limit: c.fed_mcl || 0,
        times_above_guideline: timesAbove,
        status: status,
      });
    }

    mapped.sort(function (a, b) {
      var order: Record<string, number> = { exceeds: 0, warning: 1, ok: 2 };
      if (order[a.status] !== order[b.status]) {
        return order[a.status] - order[b.status];
      }
      return b.times_above_guideline - a.times_above_guideline;
    });

    mapped = mapped.slice(0, 8);

    if (mapped.length === 0) {
      return getMockContaminants();
    }

    return mapped;
  } catch (error) {
    return getMockContaminants();
  }
}

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
  ];
}
