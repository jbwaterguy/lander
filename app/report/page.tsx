export const dynamic = "force-dynamic";
export const revalidate = 0;

import { supabase } from "@/lib/supabase";
import { fetchContaminants, ContaminantData } from "@/lib/water-api";
import { fetchNearbyCustomers, NearbyCustomer } from "@/lib/customers";
import MapSection from "@/components/MapSection";

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

// Default coordinates for Farragut, TN — used if lat/lng not provided
const DEFAULT_LAT = 35.8868;
const DEFAULT_LNG = -84.153;

async function getReport(id: string): Promise<ReportData | null> {
  const { data, error } = await supabase
    .from("reports")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !data) return null;

  // Mark as viewed
  await supabase.from("reports").update({ viewed: true }).eq("id", id);

  return data;
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

  // ── Fetch all data in parallel ──
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
    fetchContaminants(report.zip, report.city, report.state),
    fetchNearbyCustomers(lat, lng),
  ]);

  const exceedCount = contaminants.filter((c) => c.status === "exceeds").length;
  const firstName = report.client_name.split(" ")[0];
  const fullAddress = `${report.address}, ${report.city}, ${report.state} ${report.zip}`;

  return (
    <>
      {/* ═══ HERO ═══ */}
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
            <svg
              width="14"
              height="14"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              viewBox="0 0 24 24"
            >
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" />
              <circle cx="12" cy="9" r="2.5" />
            </svg>
            {fullAddress}
          </div>
        </div>
      </section>

      {/* ═══ MAP ═══ */}
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

      {/* ═══ CONTAMINANTS ═══ */}
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
            shown against EWG health guidelines.
          </p>

          {exceedCount > 0 && (
            <div className="alert-banner">
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#ee5a24"
                strokeWidth="2"
              >
                <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              <div>
                <strong>
                  {exceedCount} contaminant{exceedCount > 1 ? "s" : ""} exceed
                  health guidelines
                </strong>
                <p>
                  Your area&apos;s water contains several contaminants above levels
                  recommended by the Environmental Working Group for safe
                  consumption.
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

      {/* ═══ SOCIAL PROOF ═══ */}
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

      {/* ═══ CTA ═══ */}
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
            <svg
              width="18"
              height="18"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              viewBox="0 0 24 24"
            >
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

/* ─── SUB-COMPONENTS ─── */

function ContaminantCard({ data }: { data: ContaminantData }) {
  const statusClass = data.status;
  const valueClass =
    data.status === "exceeds"
      ? "danger"
      : data.status === "warning"
      ? "warn"
      : "safe";

  // Calculate bar width (cap at 95%)
  const barWidth = Math.min(
    data.status === "ok" ? 15 : 30 + (data.times_above_guideline / 300) * 65,
    95
  );

  // Guideline mark position
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
