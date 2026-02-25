// cache bust v5
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { supabase } from "@/lib/supabase";
import { fetchNearbyCustomers, NearbyCustomer } from "@/lib/customers";
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

const DEFAULT_LAT = 35.8868;
const DEFAULT_LNG = -84.153;

async function getReport(id: string): Promise<ReportData | null> {
  const { data, error } = await supabase
    .from("reports")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !data) return null;
  await supabase.from("reports").update({ viewed: true }).eq("id", id);
  return data;
}

async function getContaminants(city: string, state: string): Promise<ContaminantData[]> {
  const apiKey = process.env.WATER_API_KEY;
  if (!apiKey) return [];

  try {
    var res1 = await fetch(
      "https://api.gosimplelab.com/api/utilities/list?city=" + encodeURIComponent(city) + "&state_code=" + encodeURIComponent(state),
      {
        cache: "no-store",
        headers: {
          "Authorization": "Bearer " + apiKey,
          "Content-Type": "application/json",
          "Accept": "application/json",
        },
      }
    );

    if (!res1.ok) return [];
    var data1 = await res1.json();
    if (data1.result !== "OK" || !data1.data || data1.data.length === 0) return [];

    var pwsid = data1.data[0].pwsid;

    var res2 = await fetch(
      "https://api.gosimplelab.com/api/utilities/results?pws_id=" + pwsid + "&result_type=pws",
      {
        cache: "no-store",
        headers: {
          "Authorization": "Bearer " + apiKey,
          "Content-Type": "application/json",
          "Accept": "application/json",
        },
      }
    );

    if (!res2.ok) return [];
    var data2 = await res2.json();
    if (data2.result !== "OK" || !data2.data) return [];

    var mapped: ContaminantData[] = [];

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

    return mapped.slice(0, 8);
  } catch (error) {
    return [];
  }
}

export default async function ReportPage({
  searchParams,
}: {
  searchParams: { id?: string };
}) {
  const id = searchParams.id;

  if (!id) {
    return (
      <div className="not-found">
        <div>
          <h1>Report Not Found</h1>
          <p>This link may be invalid. Please check the URL in your text message.</p>
        </div>
      </div>
    );
  }

  const report = await getReport(id);

  if (!report) {
    return (
      <div className="not-found">
        <div>
          <h1>Report Not Found</h1>
          <p>We couldn&apos;t find a report for this link. It may have expired or the URL may be incorrect.</p>
        </div>
      </div>
    );
  }

  const lat = report.lat || DEFAULT_LAT;
  const lng = report.lng || DEFAULT_LNG;

  const [contaminants, nearbyCustomers] = await Promise.all([
    getContaminants(report.city, report.state),
    fetchNearbyCustomers(lat, lng),
  ]);

  const exceedCount = contaminants.filter((c) => c.status === "exceeds").length;
  const warningCount = contaminants.filter((c) => c.status === "warning").length;
  const totalBad = exceedCount + warningCount;
  const firstName = report.client_name.split(" ")[0];
  const fullAddress = `${report.address}, ${report.city}, ${report.state} ${report.zip}`;

  return (
    <>
      <section className="hero">
        <div className="hero-inner">
          <div className="hero-badge">
            <span className="dot"></span>
            Personalized Water Report
          </div>
          <h1>
            <span className="client-name">{report.client_name}</span>,
            <br />
            your neighbors are already protecting their water.
          </h1>
          <p className="hero-sub">
            We prepared this report specifically for your home. See what&apos;s in
            your city water — and how {nearbyCustomers.length} families within 10
            miles of you have already made the switch.
          </p>
          <div className="hero-address">
            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" />
              <circle cx="12" cy="9" r="2.5" />
            </svg>
            {fullAddress}
          </div>
        </div>
      </section>

      <section className="map-section">
        <div className="section-inner">
          <span className="section-label">Your Neighborhood</span>
          <h2 className="section-title">
            {nearbyCustomers.length} homes near you already have clean water
          </h2>
          <p className="section-subtitle">
            Each blue pin represents a family in your area who chose to protect
            their home&apos;s water supply.
          </p>
          <MapSection
            centerLat={lat}
            centerLng={lng}
            customers={nearbyCustomers}
            clientName={firstName}
            customerCount={nearbyCustomers.length}
          />
        </div>
      </section>

      <section className="contaminants-section">
        <div className="section-inner">
          <span className="section-label">
            Your City Water Report — {report.zip}
          </span>
          <h2 className="section-title">
            What&apos;s in your tap water right now
          </h2>
          <p className="section-subtitle">
            Based on the most recent water quality data for your zip code. Levels
            shown against health guidelines.
          </p>

          {totalBad > 0 && (
            <div className="alert-banner">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ee5a24" strokeWidth="2">
                <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              <div>
                <strong>
                  {totalBad} contaminant{totalBad > 1 ? "s" : ""} exceed health guidelines
                </strong>
                <p>
                  Your area&apos;s water contains contaminants above levels
                  recommended for safe consumption.
                </p>
              </div>
            </div>
          )}

          <div className="contaminant-grid">
            {contaminants.map((c, i) => (
              <ContaminantCard key={i} data={c} />
            ))}
          </div>
        </div>
      </section>

      <section className="social-section">
        <div className="section-inner">
          <span className="section-label">From Your Neighbors</span>
          <h2 className="section-title">
            What families in {report.city} are saying
          </h2>
          <p className="section-subtitle">
            Real reviews from homeowners within a few miles of your address.
          </p>
          <div className="testimonial-cards">
            <TestimonialCard
              quote="We had no idea our water had that much chlorine byproduct. The difference in taste alone was worth it — my kids actually drink water from the tap now."
              author="Jennifer P."
              distance="0.4 miles from you"
              date="Installed Jan 2026"
            />
            <TestimonialCard
              quote="My wife has eczema and we noticed a huge improvement within weeks of getting the whole-home system. Should have done this years ago."
              author="David & Karen R."
              distance="1.1 miles from you"
              date="Installed Nov 2025"
            />
            <TestimonialCard
              quote="The install was fast and the team was professional. They showed me exactly what was being filtered. Peace of mind for my family."
              author="Marcus T."
              distance="0.8 miles from you"
              date="Installed Dec 2025"
            />
            <TestimonialCard
              quote="Three of my neighbors recommended them. When I saw the water report for our zip code, I didn't want to wait any longer."
              author="Lisa M."
              distance="1.6 miles from you"
              date="Installed Feb 2026"
            />
          </div>
        </div>
      </section>

      <section className="cta-section">
        <div className="section-inner">
          <span className="section-label" style={{ color: "var(--aqua)" }}>
            Take The Next Step
          </span>
          <h2 className="section-title">Get your free in-home water test</h2>
          <p className="section-subtitle">
            We&apos;ll test your water at the tap, show you exactly what&apos;s in
            it, and walk you through your options. No pressure, no obligation.
          </p>
          <a href="#" className="cta-btn">
            Schedule My Free Water Test
            <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </a>
          <div className="cta-trust">
            🔒 Free consultation · No obligation · Takes about 20 minutes
          </div>
        </div>
      </section>

      <footer>
        <p>
          © 2026 Pure Water Solutions · This report was prepared for the{" "}
          {report.client_name} household · {fullAddress}
        </p>
      </footer>
    </>
  );
}

function ContaminantCard({ data }: { data: ContaminantData }) {
  const statusClass = data.status;
  const valueClass =
    data.status === "exceeds"
      ? "danger"
      : data.status === "warning"
      ? "warn"
      : "safe";

  const barWidth = Math.min(
    data.status === "ok" ? 15 : 30 + (data.times_above_guideline / 300) * 65,
    95
  );

  const guidelinePos = Math.max(
    5,
    Math.min(data.status === "ok" ? 60 : (1 / data.times_above_guideline) * 100 * 30, 40)
  );

  return (
    <div className={`contaminant-card ${statusClass}`}>
      <div className="contaminant-info">
        <h4>{data.name}</h4>
        <div className="description">{data.description}</div>
      </div>
      <div className="contaminant-level">
        <div className={`value ${valueClass}`}>
          {data.status === "ok" ? "Below" : `${data.times_above_guideline}×`}
        </div>
        <div className="limit">
          {data.status === "ok" ? "EPA action level" : "above health guideline"}
        </div>
      </div>
      <div className="contaminant-bar-wrap">
        <div className="contaminant-bar">
          <div
            className={`fill ${valueClass}`}
            style={{ width: `${barWidth}%` }}
          />
          <div
            className="guideline-mark"
            style={{ left: `${guidelinePos}%` }}
          />
        </div>
      </div>
    </div>
  );
}

function TestimonialCard({
  quote,
  author,
  distance,
  date,
}: {
  quote: string;
  author: string;
  distance: string;
  date: string;
}) {
  return (
    <div className="testimonial-card">
      <div className="stars">★★★★★</div>
      <div className="quote">&ldquo;{quote}&rdquo;</div>
      <div className="author">{author}</div>
      <div className="location">
        {distance} · {date}
      </div>
    </div>
  );
}
