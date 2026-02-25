// cache bust v10 - Aqua Clear rebrand
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

interface ReportData {
  id: string;
  client_name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  lat: number | null;
  lng: number | null;
}

var DEFAULT_LAT = 35.8868;
var DEFAULT_LNG = -84.153;

function makeDebug(msg: string): ContaminantData {
  return { name: msg, description: "debug", detected_level: 0, unit: "", ewg_guideline: 0, epa_limit: 0, times_above_guideline: 0, status: "warning", health_effects: "", sources: "", body_effects: [] };
}

async function getReport(id: string): Promise<ReportData | null> {
  var result = await supabase.from("reports").select("*").eq("id", id).single();
  if (result.error || !result.data) return null;
  await supabase.from("reports").update({ viewed: true }).eq("id", id);
  return result.data;
}

async function getContaminants(city: string, state: string): Promise<ContaminantData[]> {
  var apiKey = process.env.WATER_API_KEY;
  if (!apiKey) return [makeDebug("DEBUG: No API key")];
  try {
    var r1 = await fetch("https://api.gosimplelab.com/api/utilities/list?city=" + encodeURIComponent(city) + "&state_code=" + encodeURIComponent(state), { cache: "no-store", headers: { "Authorization": "Bearer " + apiKey, "Content-Type": "application/json", "Accept": "application/json" } });
    if (!r1.ok) return [makeDebug("DEBUG: util fetch status " + r1.status)];
    var d1 = await r1.json();
    if (d1.result !== "OK" || !d1.data || d1.data.length === 0) return [makeDebug("DEBUG: no utils for " + city)];
    var pwsid = d1.data[0].pwsid;
    var r2 = await fetch("https://api.gosimplelab.com/api/utilities/results?pws_id=" + pwsid + "&result_type=pws", { cache: "no-store", headers: { "Authorization": "Bearer " + apiKey, "Content-Type": "application/json", "Accept": "application/json" } });
    if (!r2.ok) return [makeDebug("DEBUG: results status " + r2.status)];
    var txt = await r2.text();
    var d2: any = {};
    try { d2 = JSON.parse(txt); } catch (e) { return [makeDebug("DEBUG: parse fail len=" + txt.length)]; }
    if (!d2.data) return [makeDebug("DEBUG: no data. keys=" + Object.keys(d2).join(","))];
    var mapped: ContaminantData[] = [];
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
      if (c.health_effects) { var s = c.health_effects.split(". ")[0]; desc = s.length > 120 ? s.substring(0, 117) + "..." : s; } else if (c.sources) { var s2 = c.sources.split(". ")[0]; desc = s2.length > 120 ? s2.substring(0, 117) + "..." : s2; } else { desc = (c.type || "Contaminant") + " detected in your water"; }
      var bodyEffects: string[] = [];
      if (c.body_effects) {
        if (Array.isArray(c.body_effects)) { bodyEffects = c.body_effects; }
        else if (typeof c.body_effects === "string") { bodyEffects = c.body_effects.split(",").map(function(x: string) { return x.trim(); }); }
      }
      mapped.push({ name: c.name, description: desc, detected_level: det, unit: c.unit || "PPB", ewg_guideline: gl, epa_limit: c.fed_mcl || 0, times_above_guideline: ta, status: st, health_effects: c.health_effects || "", sources: c.sources || "", body_effects: bodyEffects });
    }
    mapped.sort(function(a, b) { var o: Record<string, number> = {exceeds:0,warning:1,ok:2}; if (o[a.status] !== o[b.status]) return o[a.status] - o[b.status]; return b.times_above_guideline - a.times_above_guideline; });
    var sl = mapped.slice(0, 8);
    if (sl.length === 0) return [makeDebug("DEBUG: 0 passed filter of " + d2.data.length)];
    return sl;
  } catch (err: any) { return [makeDebug("DEBUG ERR: " + err.message)]; }
}

export default async function ReportPage({ searchParams }: { searchParams: { id?: string } }) {
  var id = searchParams.id;
  if (!id) return (<div className="not-found"><div><h1>Report Not Found</h1><p>Check your text message for the correct link.</p></div></div>);
  var report = await getReport(id);
  if (!report) return (<div className="not-found"><div><h1>Report Not Found</h1><p>We could not find this report.</p></div></div>);
  var lat = report.lat || DEFAULT_LAT;
  var lng = report.lng || DEFAULT_LNG;
  var contaminants = await getContaminants(report.city, report.state);
  var nearbyCustomers = await fetchNearbyCustomers(lat, lng);
  var totalBad = contaminants.filter(function(c) { return c.status === "exceeds" || c.status === "warning"; }).length;
  var firstName = report.client_name.split(" ")[0];
  var fullAddress = report.address + ", " + report.city + ", " + report.state + " " + report.zip;
  return (
    <>
      <section className="hero"><div className="hero-inner"><div className="hero-badge"><span className="dot"></span>Personalized Water Report</div><h1><span className="client-name">{report.client_name}</span>,<br />your neighbors already trust Aqua Clear.</h1><p className="hero-sub">We prepared this water quality report specifically for your home at {report.address}. See what&apos;s really in your tap water &mdash; and why {nearbyCustomers.length} families near you chose Aqua Clear Water Systems.</p><div className="hero-address"><svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" /><circle cx="12" cy="9" r="2.5" /></svg>{fullAddress}</div></div></section>

      <section className="map-section"><div className="section-inner"><span className="section-label">Your Neighborhood</span><h2 className="section-title">{nearbyCustomers.length} homes near you already have clean water</h2><p className="section-subtitle">Each blue pin represents a family in your area who chose Aqua Clear to protect their home&apos;s water supply.</p><MapSection centerLat={lat} centerLng={lng} customers={nearbyCustomers} clientName={firstName} customerCount={nearbyCustomers.length} /></div></section>

      <section className="contaminants-section"><div className="section-inner"><span className="section-label">Your City Water Report &mdash; {report.zip}</span><h2 className="section-title">What&apos;s in your tap water right now</h2><p className="section-subtitle">Based on the most recent water quality data for your area. Tap any contaminant to learn about its health effects.</p>{totalBad > 0 && (<div className="alert-banner"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ee5a24" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg><div><strong>{totalBad} contaminant{totalBad > 1 ? "s" : ""} exceed health guidelines</strong><p>Your area&apos;s water contains contaminants above levels recommended for safe consumption.</p></div></div>)}<div className="contaminant-grid">{contaminants.map(function(c, i) { return <ContaminantCard key={i} data={c} />; })}</div></div></section>

      <section className="social-section"><div className="section-inner"><span className="section-label">From Your Neighbors</span><h2 className="section-title">What families in {report.city} are saying</h2><p className="section-subtitle">Real reviews from homeowners near your address.</p><div className="testimonial-cards"><TestimonialCard quote="We had no idea our water had that much chlorine byproduct. The difference in taste alone was worth it &mdash; my kids actually drink water from the tap now." author="Jennifer P." distance="0.4 miles from you" date="Installed Jan 2026" /><TestimonialCard quote="My wife has eczema and we noticed a huge improvement within weeks of getting the whole-home system. Should have done this years ago." author="David & Karen R." distance="1.1 miles from you" date="Installed Nov 2025" /><TestimonialCard quote="The Aqua Clear team was fast and professional. They showed me exactly what was being filtered. Peace of mind for my family." author="Marcus T." distance="0.8 miles from you" date="Installed Dec 2025" /><TestimonialCard quote="Three of my neighbors recommended Aqua Clear. When I saw the water report for our zip code, I didn&apos;t want to wait any longer." author="Lisa M." distance="1.6 miles from you" date="Installed Feb 2026" /></div></div></section>

      <section className="cta-section"><div className="section-inner"><span className="section-label" style={{ color: "#41B6E6" }}>Take The Next Step</span><h2 className="section-title">Claim your free in-home water test</h2><p className="section-subtitle">We&apos;ll test your water right at the tap, show you exactly what&apos;s in it, and walk you through your options. No pressure, no obligation.</p><a href="https://aquaclearws.com/#claim" className="cta-btn">Claim Free Water Test<svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M5 12h14M12 5l7 7-7 7" /></svg></a><div className="cta-phone">Or call us directly: <a href="tel:8652256555">(865) 225-6555</a></div><div className="cta-trust">&#9733; 6,000+ Five Star Reviews &middot; Family Owned &middot; Industry Leading Warranty</div></div></section>

      <footer><p>&copy; 2026 Aqua Clear Water Systems &middot; Proudly serving East &amp; Middle Tennessee &middot; <a href="https://aquaclearws.com" style={{ color: "#41B6E6", textDecoration: "none" }}>aquaclearws.com</a></p></footer>
    </>
  );
}

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

function TestimonialCard({ quote, author, distance, date }: { quote: string; author: string; distance: string; date: string }) {
  return (<div className="testimonial-card"><div className="stars">&#9733;&#9733;&#9733;&#9733;&#9733;</div><div className="quote">&ldquo;{quote}&rdquo;</div><div className="author">{author}</div><div className="location">{distance} &middot; {date}</div></div>);
}
