import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest) {
  const apiKey = process.env.WATER_API_KEY;
  var log: any[] = [];

  log.push({ step: "start", has_key: !!apiKey, key_length: apiKey?.length });

  try {
    var url1 = "https://api.gosimplelab.com/api/utilities/list?city=Farragut&state_code=TN";
    log.push({ step: "fetching_utilities", url: url1 });

    var res1 = await fetch(url1, {
      headers: {
        "Authorization": "Bearer " + apiKey,
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
    });

    log.push({ step: "utilities_response", status: res1.status, ok: res1.ok });

    var data1 = await res1.json();
    log.push({ step: "utilities_data", result: data1.result, count: data1.data?.length, pwsid: data1.data?.[0]?.pwsid });

    var pwsid = data1.data[0].pwsid;
    var url2 = "https://api.gosimplelab.com/api/utilities/results?pws_id=" + pwsid + "&result_type=pws";
    log.push({ step: "fetching_results", url: url2 });

    var res2 = await fetch(url2, {
      headers: {
        "Authorization": "Bearer " + apiKey,
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
    });

    log.push({ step: "results_response", status: res2.status, ok: res2.ok });

    var data2 = await res2.json();
    log.push({ step: "results_data", result: data2.result, total: data2.data?.length });

    var passed: any[] = [];
    for (var i = 0; i < data2.data.length; i++) {
      var c = data2.data[i];
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

      passed.push({ name: c.name, detected: detected, guideline: guideline, times: timesAbove });
    }

    log.push({ step: "filtering_done", passed_count: passed.length, passed: passed.slice(0, 5) });

  } catch (error: any) {
    log.push({ step: "ERROR", message: error.message, stack: error.stack?.substring(0, 200) });
  }

  return NextResponse.json(log);
}
