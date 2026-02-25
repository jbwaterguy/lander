import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const apiKey = process.env.WATER_API_KEY;
  const results: any = {
    has_api_key: !!apiKey,
    key_length: apiKey?.length || 0,
    key_preview: apiKey ? apiKey.substring(0, 5) + "..." : "MISSING",
  };

  try {
    // Step 1: Test utilities list
    const utilityRes = await fetch(
      "https://api.gosimplelab.com/api/utilities/list?city=Farragut&state_code=TN",
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
      }
    );
    results.utility_status = utilityRes.status;
    const utilityData = await utilityRes.json();
    results.utility_result = utilityData.result;
    results.utility_count = utilityData.data?.length || 0;

    if (utilityData.data?.[0]?.pwsid) {
      const pwsid = utilityData.data[0].pwsid;
      results.pwsid = pwsid;

      // Step 2: Test results
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
      results.results_status = resultsRes.status;
      const resultsData = await resultsRes.json();
      results.results_result = resultsData.result;
      results.contaminant_count = resultsData.data?.length || 0;
      // Show first 3 contaminants as sample
      results.sample_contaminants = resultsData.data?.slice(0, 3).map((c: any) => ({
        name: c.name,
        median: c.median,
        unit: c.unit,
        fed_mcl: c.fed_mcl,
        slr: c.slr,
      }));
    }
  } catch (error: any) {
    results.error = error.message;
  }

  return NextResponse.json(results);
}
