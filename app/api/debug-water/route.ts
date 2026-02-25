import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const apiKey = process.env.WATER_API_KEY;
  const results: any = {};

  try {
    const utilityRes = await fetch(
      "https://api.gosimplelab.com/api/utilities/list?city=Farragut&state_code=TN",
      {
        headers: {
          "Authorization": "Bearer " + apiKey,
          "Content-Type": "application/json",
          "Accept": "application/json",
        },
      }
    );

    const utilityData = await utilityRes.json();
    const pwsid = utilityData.data[0].pwsid;
    results.pwsid = pwsid;

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

    const resultsData = await resultsRes.json();
    results.total = resultsData.data.length;

    // Show raw fields for first 5 contaminants so we can see the actual data shape
    results.raw_sample = resultsData.data.slice(0, 5).map(function(c: any) {
      return {
        name: c.name,
        median: c.median,
        average: c.average,
        avg_concentration: c.avg_concentration,
        max: c.max,
        detection_rate: c.detection_rate,
        pct_detected: c.pct_detected,
        unit: c.unit,
        slr: c.slr,
        fed_mcl: c.fed_mcl,
        fed_mclg: c.fed_mclg,
      };
    });

    // Find any contaminants that have ANY numeric value
    var with_values: any[] = [];
    for (var i = 0; i < resultsData.data.length; i++) {
      var c = resultsData.data[i];
      if (c.median > 0 || c.average > 0 || c.avg_concentration > 0 || c.max > 0) {
        with_values.push({
          name: c.name,
          median: c.median,
          average: c.average,
          avg_concentration: c.avg_concentration,
          max: c.max,
          detection_rate: c.detection_rate,
          pct_detected: c.pct_detected,
          unit: c.unit,
          slr: c.slr,
          fed_mcl: c.fed_mcl,
        });
      }
    }
    results.with_any_value_count = with_values.length;
    results.with_any_value = with_values.slice(0, 15);
  } catch (error: any) {
    results.error = error.message;
  }

  return NextResponse.json(results);
}
