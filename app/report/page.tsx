// Multi-tenant water report landing page
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { supabase } from "@/lib/supabase";
import { fetchNearbyCustomers } from "@/lib/customers";
import MapSection from "@/components/MapSection";

interface ContaminantData {
  name: string;
  description: string;
  detected_level: number;
  unit: string;
  ewg_guideline: number;
  epa_limit: number;
  times_above_guideline: number;
  status: "exceeds" | "warning" | "ok";
  health_effects: string;
  sources: string;
  body_effects: string[];
}

interface CompanyData {
  id: string;
  slug: string;
  name: string;
  phone: string;
  website: string;
  logo_url: string;
  domain: string;
  color_primary: string;
  color_accent: string;
  color_cta: string;
  tagline: string;
  years_in_business: number;
  bbb_rating: string;
  homes_served: string;
  trust_points: { icon: string; label: string }[];
  appointment_duration: number;
  appointment_steps: { title: string; description: string }[];
  webhook_viewed: string | null;
}

interface ReportData {
  id: string;
  client_name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  lat: number | null;
  lng: number | null;
  company_id: string;
  phone?: string;
  viewed?: boolean;
  viewed_at?: string;
  view_count?: number;
}

var DEFAULT_LAT = 35.8868;
var DEFAULT_LNG = -84.153;

function makeDebug(msg: string): ContaminantData {
  return { name: msg, description: "debug", detected_level: 0, unit: "", ewg_guideline: 0, epa_limit: 0, times_above_guideline: 0, status: "warning", health_effects: "", sources: "", body_effects: [] };
}

// ─── Get company from report's company_id ───
async function getCompany(companyId: string): Promise<CompanyData | null> {
  var result = await supabase.from("companies").select("*").eq("id", companyId).eq("active", true).single();
  if (result.error || !result.data) return null;
  return result.data;
}

// ─── Get report and track views ───
async function getReport(id: string, company?: CompanyData | null): Promise<ReportData | null> {
  var result = await supabase.from("reports").select("*").eq("id", id).single();
  if (result.error || !result.data) return null;

  var isFirstView = !result.data.viewed;
  var viewCount = (result.data.view_count || 0) + 1;

  await supabase.from("reports").update({
    viewed: true,
    viewed_at: isFirstView ? new Date().toISOString() : result.data.viewed_at,
    view_count: viewCount
  }).eq("id", id);

  var webhookUrl = company?.webhook_viewed || process.env.ZAPIER_VIEWED_WEBHOOK;
  if (isFirstView && webhookUrl) {
    try {
      await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          report_id: id,
          client_name: result.data.client_name,
          phone: result.data.phone || "",
          address: result.data.address,
          city: result.data.city,
          state: result.data.state,
          zip: result.data.zip,
          viewed_at: new Date().toISOString()
        })
      });
    } catch (e) { /* don't block page load */ }
  }

  return result.data;
}

// ─── Get contaminants (shared water cache — not company-specific) ───
async function getContaminants(city: string, state: string, zip: string, lat: number, lng: number): Promise<ContaminantData[]> {
  var cached = await supabase.from("water_cache").select("data, fetched_at").eq("zip", zip).single();
  if (cached.data && cached.data.data) {
    var age = Date.now() - new Date(cached.data.fetched_at).getTime();
    var ninetyDays = 90 * 24 * 60 * 60 * 1000;
    if (age < ninetyDays) return cached.data.data as ContaminantData[];
  }

  var apiKey = process.env.WATER_API_KEY;
  if (!apiKey) return [makeDebug("DEBUG: No API key")];

  // Helper to log each API call
  async function logApiCall(endpoint: string, detail: string) {
    await supabase.from("api_usage").insert({ service: "simplelab", endpoint: endpoint, zip: zip, city: city });
  }

  try {
    // Try city + state lookup first
    await logApiCall("utilities/list", "city=" + city);
    var r1 = await fetch("https://api.gosimplelab.com/api/utilities/list?city=" + encodeURIComponent(city) + "&state_code=" + encodeURIComponent(state), { cache: "no-store", headers: { "Authorization": "Bearer " + apiKey, "Content-Type": "application/json", "Accept": "application/json" } });
    var d1: any = null;
    if (r1.ok) { d1 = await r1.json(); }
    // If city lookup failed, fall back to lat/lng
    if (!d1 || d1.result !== "OK" || !d1.data || d1.data.length === 0) {
      await logApiCall("utilities/list", "lat/lng fallback");
      var r1ll = await fetch("https://api.gosimplelab.com/api/utilities/list?latitude=" + lat + "&longitude=" + lng, { cache: "no-store", headers: { "Authorization": "Bearer " + apiKey, "Content-Type": "application/json", "Accept": "application/json" } });
      if (r1ll.ok) { d1 = await r1ll.json(); }
    }
    // If lat/lng also failed, try state-wide search (gets all utilities in state)
    if (!d1 || d1.result !== "OK" || !d1.data || d1.data.length === 0) {
      await logApiCall("utilities/list", "state fallback");
      var r1st = await fetch("https://api.gosimplelab.com/api/utilities/list?state_code=" + encodeURIComponent(state), { cache: "no-store", headers: { "Authorization": "Bearer " + apiKey, "Content-Type": "application/json", "Accept": "application/json" } });
      if (r1st.ok) {
        var d1st = await r1st.json();
        // Find the utility closest to our coordinates
        if (d1st && d1st.result === "OK" && d1st.data && d1st.data.length > 0) {
          var closest: any = null;
          var closestDist = Infinity;
          for (var s = 0; s < d1st.data.length; s++) {
           var util = d1st.data[s];
if (util.latitude && util.longitude) {
  var dlat = util.latitude - lat;
  var dlng = util.longitude - lng;
              var dist = dlat * dlat + dlng * dlng;
              if (dist < closestDist) { closestDist = dist; closest = util; }
            }
          }
          if (closest) { d1 = { result: "OK", data: [closest] }; }
        }
      }
    }
    if (!d1 || d1.result !== "OK" || !d1.data || d1.data.length === 0) {
      return [makeDebug("DEBUG: no utils for " + city + " " + state + " at " + lat + "," + lng)];
    }

    var utilities = d1.data;
    var allPwsids: string[] = [];
    var contaminantMap: Record<string, ContaminantData> = {};
    for (var u = 0; u < utilities.length; u++) {
      var pwsid = utilities[u].pwsid;
      if (!pwsid) continue;
      allPwsids.push(pwsid);
      await logApiCall("utilities/results", "pwsid=" + pwsid);
      var r2 = await fetch("https://api.gosimplelab.com/api/utilities/results?pws_id=" + pwsid + "&result_type=pws", { cache: "no-store", headers: { "Authorization": "Bearer " + apiKey, "Content-Type": "application/json", "Accept": "application/json" } });
      if (!r2.ok) continue;
      var txt = await r2.text();
      var d2: any = {};
      try { d2 = JSON.parse(txt); } catch (e) { continue; }
      if (!d2.data) continue;
      for (var i = 0; i < d2.data.length; i++) {
        var c = d2.data[i];
        var det = c.max || c.median;
        if (det === null || det === undefined || det <= 0) continue;
        var dr = c.detection_rate;
        if (dr) { var p = parseFloat(String(dr).replace("%", "")); if (p <= 0) continue; }
        var gl: number | null = null;
        if (c.slr !== null && c.slr !== undefined && c.slr > 0) { gl = c.slr; } else if (c.fed_mcl !== null && c.fed_mcl !== undefined && c.fed_mcl > 0) { gl = c.fed_mcl; }
        if (!gl) continue;
        var ta = Math.round(det / gl);
        if (ta < 2) continue;
        var st: "exceeds" | "warning" | "ok" = ta >= 10 ? "exceeds" : "warning";
        var desc = "";
        if (c.health_effects) { var he = c.health_effects.split(". ")[0]; desc = he.length > 120 ? he.substring(0, 117) + "..." : he; }
        var bodyEffects: string[] = [];
        if (c.body_effects) {
          if (Array.isArray(c.body_effects)) { bodyEffects = c.body_effects; }
          else if (typeof c.body_effects === "string") { bodyEffects = c.body_effects.split(",").map(function(x: string) { return x.trim(); }); }
        }
        var existing = contaminantMap[c.name];
        if (!existing || ta > existing.times_above_guideline) {
          contaminantMap[c.name] = { name: c.name, description: desc, detected_level: det, unit: c.unit || "PPB", ewg_guideline: gl, epa_limit: c.fed_mcl || 0, times_above_guideline: ta, status: st, health_effects: c.health_effects || "", sources: c.sources || "", body_effects: bodyEffects };
        }
      }
    }
    var mapped: ContaminantData[] = [];
    for (var key in contaminantMap) { mapped.push(contaminantMap[key]); }
    mapped.sort(function(a, b) { var o: Record<string, number> = {exceeds:0,warning:1,ok:2}; if (o[a.status] !== o[b.status]) return o[a.status] - o[b.status]; return b.times_above_guideline - a.times_above_guideline; });
    var sl = mapped.slice(0, 8);
    if (sl.length === 0) return [makeDebug("DEBUG: 0 passed filter from " + utilities.length + " utilities")];
    await supabase.from("water_cache").upsert({ zip: zip, data: sl, pwsid: allPwsids.join(","), fetched_at: new Date().toISOString() }, { onConflict: "zip" });
    return sl;
  } catch (err: any) { return [makeDebug("DEBUG ERR: " + err.message)]; }
}

// ─── Get reviews scoped by company ───
async function getReviews(zip: string, companyId: string): Promise<{ reviews: { author: string; quote: string }[]; zipCount: number; totalCount: number }> {
  var local = await supabase.from("reviews").select("author, quote").eq("zip", zip).eq("rating", 5).eq("company_id", companyId);
  var zipReviews: { author: string; quote: string }[] = (local.data || []).filter(function(r) { return r.quote && r.quote.trim().length > 0; });
  var zipCount = zipReviews.length;

  var totalResult = await supabase.from("reviews").select("id", { count: "exact", head: true }).eq("rating", 5).eq("company_id", companyId);
  var totalCount = totalResult.count || 0;

  var reviews = [...zipReviews];
  if (reviews.length < 4) {
    var remaining = 4 - reviews.length;
    var localAuthors = reviews.map(function(r) { return r.author; });
    var fill = await supabase.from("reviews").select("author, quote").eq("rating", 5).eq("company_id", companyId).neq("zip", zip).limit(remaining * 3);
    var pool = (fill.data || []).filter(function(r) { return r.quote && r.quote.trim().length > 0 && localAuthors.indexOf(r.author) === -1; });
    for (var i = pool.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = pool[i]; pool[i] = pool[j]; pool[j] = t; }
    reviews = reviews.concat(pool.slice(0, remaining));
  }
  return { reviews: reviews, zipCount: zipCount, totalCount: totalCount };
}

// ═══ MAIN PAGE ═══
export default async function ReportPage({ searchParams }: { searchParams: { id?: string } }) {
  var id = searchParams.id;
  if (!id) return (<div className="not-found"><div><h1>Report Not Found</h1><p>Check your text message for the correct link.</p></div></div>);

  // Get report first to find company_id
  var reportRaw = await supabase.from("reports").select("*").eq("id", id).single();
  if (reportRaw.error || !reportRaw.data) return (<div className="not-found"><div><h1>Report Not Found</h1><p>We could not find this report.</p></div></div>);

  // Get the company for this report
  var co = await getCompany(reportRaw.data.company_id);
  if (!co) return (<div className="not-found"><div><h1>Report Not Found</h1><p>This report is no longer available.</p></div></div>);

  // Track the view (with company webhook)
  var report = await getReport(id, co) as ReportData;
  var lat = report.lat || DEFAULT_LAT;
  var lng = report.lng || DEFAULT_LNG;

  // Fetch all data — customers and reviews scoped to company
  var [contaminants, nearbyCustomers, reviewData] = await Promise.all([
    getContaminants(report.city, report.state, report.zip, lat, lng),
    fetchNearbyCustomers(lat, lng, co.id),
    getReviews(report.zip, co.id)
  ]);

  var reviews = reviewData.reviews;
  var zipReviewCount = reviewData.zipCount;
  var totalReviewCount = reviewData.totalCount;
  var firstReviews = reviews.slice(0, 4);
  var extraReviews = reviews.slice(4);
  var totalBad = contaminants.filter(function(c) { return c.status === "exceeds" || c.status === "warning"; }).length;
  var firstName = report.client_name.split(" ")[0];
  var fullAddress = report.address + ", " + report.city + ", " + report.state + " " + report.zip;
  var phoneDigits = (co.phone || "").replace(/\D/g, "");
  var steps = co.appointment_steps || [];
  var trustPoints = co.trust_points || [];

  return (
    <>
      {/* Inject company brand colors as CSS variables */}
      <style dangerouslySetInnerHTML={{ __html: `:root { --brand-primary: ${co.color_primary}; --brand-accent: ${co.color_accent}; --brand-cta: ${co.color_cta}; }` }} />

      <section className="hero"><div className="hero-inner">{co.logo_url && (<img src={co.logo_url} alt={co.name} style={{ height: "72px", marginBottom: "24px", display: "block" }} />)}<div className="hero-badge"><span className="dot"></span>Personalized Water Report</div><h1><span className="client-name">{report.client_name}</span>,<br />your neighbors already trust {co.name.split(" ")[0]}.</h1><p className="hero-sub">We prepared this water quality report specifically for your home at {report.address}. See what&apos;s really in your tap water &mdash; and why {nearbyCustomers.length} families near you chose {co.name}.</p><div className="hero-address"><svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" /><circle cx="12" cy="9" r="2.5" /></svg>{fullAddress}</div></div></section>

      <section className="map-section"><div className="section-inner"><span className="section-label">Your Neighborhood</span><h2 className="section-title">{nearbyCustomers.length} homes near you already have clean water</h2><p className="section-subtitle">Each blue pin represents a family in your area who chose {co.name} to protect their home&apos;s water supply.</p><MapSection centerLat={lat} centerLng={lng} customers={nearbyCustomers} clientName={firstName} customerCount={nearbyCustomers.length} /></div></section>

      <section className="contaminants-section"><div className="section-inner"><span className="section-label">Your City Water Report &mdash; {report.zip}</span><h2 className="section-title">What&apos;s in your tap water right now</h2><p className="section-subtitle">Based on the most recent water quality data for your area. Tap any contaminant to learn about its health effects.</p>{totalBad > 0 && (<div className="alert-banner"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ee5a24" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg><div><strong>{totalBad} contaminant{totalBad > 1 ? "s" : ""} exceed health guidelines</strong><p>Your area&apos;s water contains contaminants above levels recommended for safe consumption.</p></div></div>)}<div className="contaminant-grid">{contaminants.map(function(c, i) { return <ContaminantCard key={i} data={c} />; })}</div></div></section>

      <section className="social-section"><div className="section-inner"><span className="section-label">From Your Neighbors</span><h2 className="section-title">What families in {report.city} are saying</h2><p className="section-subtitle">Real reviews from homeowners near your address.</p><div className="review-counts">{zipReviewCount > 0 && (<div className="review-count-badge"><span className="review-count-num">{zipReviewCount}</span> five-star reviews in {report.zip}</div>)}<div className="review-count-badge total"><span className="review-count-num">{totalReviewCount.toLocaleString()}</span> total five-star reviews</div></div><div className="testimonial-cards">{firstReviews.map(function(r, i) { return <TestimonialCard key={i} quote={r.quote} author={r.author} />; })}</div>{extraReviews.length > 0 && (<details className="more-reviews"><summary className="more-reviews-btn">Read {extraReviews.length} More Review{extraReviews.length > 1 ? "s" : ""} <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9" /></svg></summary><div className="testimonial-cards extra-reviews-grid">{extraReviews.map(function(r, i) { return <TestimonialCard key={i + 4} quote={r.quote} author={r.author} />; })}</div></details>)}</div></section>

      {steps.length > 0 && (<section className="expect-section"><div className="section-inner"><span className="section-label">Your Upcoming Appointment</span><h2 className="section-title">Here&apos;s what to expect</h2><p className="section-subtitle">Your appointment takes about {co.appointment_duration} minutes. No surprises, no pressure &mdash; just honest answers about your water.</p><div className="expect-steps">{steps.map(function(step, i) { return (<div key={i} className="expect-step"><div className="step-num">{i + 1}</div><div className="step-content"><h3>{step.title}</h3><p>{step.description}</p></div></div>); })}</div></div></section>)}

      {trustPoints.length > 0 && (<section className="trust-section"><div className="section-inner"><span className="section-label" style={{ color: co.color_cta }}>Why Families Choose {co.name.split(" ")[0]}</span><h2 className="section-title">Built on trust for over {co.years_in_business} years</h2><div className="trust-grid">{trustPoints.map(function(tp, i) { return (<div key={i} className="trust-card"><div className="trust-icon">{tp.icon}</div><div className="trust-label" dangerouslySetInnerHTML={{ __html: tp.label.replace(/\n/g, "<br />") }} /></div>); })}</div></div></section>)}

      <section className="cta-section"><div className="section-inner"><h2 className="section-title">Questions before your appointment?</h2><p className="section-subtitle">We&apos;re happy to help. Give us a call anytime.</p>{co.phone && (<a href={"tel:" + phoneDigits} className="cta-btn">Call {co.phone}<svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" /></svg></a>)}<div className="cta-trust">We look forward to meeting you!</div></div></section>

      <footer><p>&copy; {new Date().getFullYear()} {co.name}{co.tagline ? " \u00b7 " + co.tagline : ""}{co.website ? " \u00b7 " : ""}{co.website && (<a href={co.website} style={{ color: co.color_accent, textDecoration: "none" }}>{co.website.replace(/^https?:\/\//, "")}</a>)}</p></footer>
    </>
  );
}

/* ─── SUB-COMPONENTS ─── */

function ContaminantCard({ data }: { data: ContaminantData }) {
  var vc = data.status === "exceeds" ? "danger" : data.status === "warning" ? "warn" : "safe";
  var bw = Math.min(data.status === "ok" ? 15 : 30 + (data.times_above_guideline / 300) * 65, 95);
  var gp = Math.max(5, Math.min(data.status === "ok" ? 60 : (1 / data.times_above_guideline) * 100 * 30, 40));
  var hasDetails = data.health_effects || data.sources || data.body_effects.length > 0;
  if (!hasDetails) {
    return (
      <div className={"contaminant-card " + data.status}>
        <div className="contaminant-top-row"><div className="contaminant-info"><h4>{data.name}</h4><div className="description">{data.description}</div></div><div className="contaminant-level"><div className={"value " + vc}>{data.times_above_guideline === 0 ? "" : data.times_above_guideline + "\u00d7"}</div><div className="limit">{data.times_above_guideline === 0 ? "" : "above guideline"}</div></div></div>
        <div className="contaminant-bar-wrap"><div className="contaminant-bar"><div className={"fill " + vc} style={{ width: bw + "%" }} /><div className="guideline-mark" style={{ left: gp + "%" }} /></div></div>
      </div>
    );
  }
  return (
    <details className={"contaminant-card expandable " + data.status}>
      <summary>
        <div className="contaminant-top-row"><div className="contaminant-info"><h4>{data.name}</h4><div className="description">{data.description}</div></div><div className="contaminant-level"><div className={"value " + vc}>{data.times_above_guideline === 0 ? "" : data.times_above_guideline + "\u00d7"}</div><div className="limit">{data.times_above_guideline === 0 ? "" : "above guideline"}</div></div></div>
        <div className="contaminant-bar-wrap"><div className="contaminant-bar"><div className={"fill " + vc} style={{ width: bw + "%" }} /><div className="guideline-mark" style={{ left: gp + "%" }} /></div></div>
        <div className="tap-hint"><span className="tap-icon">&#9432;</span> Tap for health details <span className="chevron">&#x25BE;</span></div>
      </summary>
      <div className="contaminant-details">
        {data.health_effects && (<div className="detail-block"><div className="detail-icon">&#9888;&#65039;</div><div><div className="detail-label">Health Effects</div><div className="detail-text">{data.health_effects}</div></div></div>)}
        {data.sources && (<div className="detail-block"><div className="detail-icon">&#128167;</div><div><div className="detail-label">How It Gets In Your Water</div><div className="detail-text">{data.sources}</div></div></div>)}
        {data.body_effects.length > 0 && (<div className="detail-block"><div className="detail-icon">&#129652;</div><div><div className="detail-label">Parts of the Body Affected</div><div className="body-tags">{data.body_effects.map(function(e, i) { return <span key={i} className="body-tag">{e}</span>; })}</div></div></div>)}
        <div className="detail-block detail-numbers"><div className="detail-icon">&#128200;</div><div><div className="detail-label">Detected Levels</div><div className="detail-text"><strong>{data.detected_level} {data.unit}</strong> detected &middot; Health guideline: {data.ewg_guideline} {data.unit}{data.epa_limit > 0 ? " \u00b7 EPA limit: " + data.epa_limit + " " + data.unit : ""}</div></div></div>
      </div>
    </details>
  );
}

function TestimonialCard({ quote, author }: { quote: string; author: string }) {
  return (<div className="testimonial-card"><div className="stars">&#9733;&#9733;&#9733;&#9733;&#9733;</div><div className="quote">&ldquo;{quote}&rdquo;</div><div className="author">{author}</div></div>);
}
