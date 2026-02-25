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
    results.total_contaminants = resultsData.data.length;

    var passed_filter: any[] = [];
    var skipped_reasons: any[] = [];

    for (var i = 0; i < resultsData.data.length; i++) {
      var c = resultsData.data[i];

      if (c.median === null || c.median <= 0) {
        skipped_reasons.push({ name: c.name, reason: "no median", median: c.median });
        continue;
      }
      if (!c.pct_detected || c.pct_detected <= 0) {
        skipped_reasons.push({ name: c.name, reason: "no detections", pct: c.pct_detected });
        continue;
      }

      var guideline = null;
      if (c.slr && c.slr > 0) {
        guideline = c.slr;
      } else if (c.fed_mcl && c.fed_mcl > 0) {
        guideline = c.fed_mcl;
      }

      if (!guideline) {
        skipped_reasons.push({ name: c.name, reason: "no guideline", slr: c.slr, fed_mcl: c.fed_mcl });
        continue;
      }

      var timesAbove = Math.round(c.median / guideline);

      if (timesAbove < 2) {
        skipped_reasons.push({ name: c.name, reason: "below 2x", times: timesAbove, median: c.median, guideline: guideline });
        continue;
      }

      passed_filter.push({
        name: c.name,
        median: c.median,
        unit: c.unit,
        slr: c.slr,
        fed_mcl: c.fed_mcl,
        guideline_used: guideline,
        times_above: timesAbove,
      });
    }

    results.passed_count = passed_filter.length;
    results.passed = passed_filter;
    results.skipped_sample = skipped_reasons.slice(0, 10);
  } catch (error: any) {
    results.error = error.message;
  }

  return NextResponse.json(results);
}
