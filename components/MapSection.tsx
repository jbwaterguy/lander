"use client";

import { useEffect, useRef } from "react";

interface NearbyCustomer {
  lat: number;
  lng: number;
  install_date?: string;
}

interface MapSectionProps {
  centerLat: number;
  centerLng: number;
  customers: NearbyCustomer[];
  clientName: string;
  customerCount: number;
}

export default function MapSection({
  centerLat,
  centerLng,
  customers,
  clientName,
  customerCount,
}: MapSectionProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);

  useEffect(() => {
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    if (!token || token === "your-mapbox-token-here" || !mapContainer.current) return;

    const link = document.createElement("link");
    link.href = "https://api.mapbox.com/mapbox-gl-js/v3.4.0/mapbox-gl.css";
    link.rel = "stylesheet";
    document.head.appendChild(link);

    const script = document.createElement("script");
    script.src = "https://api.mapbox.com/mapbox-gl-js/v3.4.0/mapbox-gl.js";
    script.onload = () => {
      const mapboxgl = (window as any).mapboxgl;
      mapboxgl.accessToken = token;

     const map = new mapboxgl.Map({
        container: mapContainer.current!,
        style: "mapbox://styles/mapbox/satellite-streets-v12",
        center: [centerLng, centerLat],
        zoom: 13,
        interactive: true,
        scrollZoom: false,
        logoPosition: "top-left",
        attributionControl: false,
      });

      map.addControl(new mapboxgl.AttributionControl({ compact: true }), "top-left");

      map.addControl(new mapboxgl.NavigationControl(), "top-right");

      map.on("load", () => {
        // Build GeoJSON for customer pins
        const customerFeatures = customers.map((c) => ({
          type: "Feature" as const,
          geometry: { type: "Point" as const, coordinates: [c.lng, c.lat] },
          properties: {},
        }));

        // Add customer pins as a GeoJSON source + circle layer (stays fixed on zoom)
        map.addSource("customers", {
          type: "geojson",
          data: { type: "FeatureCollection", features: customerFeatures },
        });

        // White border ring (larger circle behind)
        map.addLayer({
          id: "customers-border",
          type: "circle",
          source: "customers",
          paint: {
            "circle-radius": 7,
            "circle-color": "#ffffff",
            "circle-opacity": 1,
          },
        });

        // Blue fill dot
        map.addLayer({
          id: "customers-fill",
          type: "circle",
          source: "customers",
          paint: {
            "circle-radius": 5,
            "circle-color": "#2e86de",
            "circle-opacity": 0.9,
          },
        });

        // Client pin as GeoJSON too
        map.addSource("client", {
          type: "geojson",
          data: {
            type: "FeatureCollection",
            features: [{
              type: "Feature",
              geometry: { type: "Point", coordinates: [centerLng, centerLat] },
              properties: {},
            }],
          },
        });

        // White border for client pin
        map.addLayer({
          id: "client-border",
          type: "circle",
          source: "client",
          paint: {
            "circle-radius": 10,
            "circle-color": "#ffffff",
            "circle-opacity": 1,
          },
        });

        // Red fill for client pin
        map.addLayer({
          id: "client-fill",
          type: "circle",
          source: "client",
          paint: {
            "circle-radius": 8,
            "circle-color": "#ee5a24",
            "circle-opacity": 1,
          },
        });

      // "Your Home" label as a single clean marker
        var labelEl = document.createElement("div");
        labelEl.innerHTML = '<div style="background:#0a1628;color:white;font-family:Outfit,sans-serif;font-size:11px;font-weight:600;padding:4px 10px;border-radius:6px;white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,0.3);text-align:center;">Your Home</div>';
        new mapboxgl.Marker({ element: labelEl, anchor: "bottom", offset: [0, -12] })
          .setLngLat([centerLng, centerLat])
          .addTo(map);
      });

      mapRef.current = map;
    };
    document.head.appendChild(script);

    return () => {
      if (mapRef.current) mapRef.current.remove();
    };
  }, [centerLat, centerLng, customers]);

  return (
    <div className="map-container">
      <div className="map-frame" ref={mapContainer}>
        <FallbackMap customerCount={customerCount} clientName={clientName} />
      </div>
      <div className="map-legend">
        <div className="legend-item">
          <div className="legend-dot blue"></div>
          Protected Home
        </div>
        <div className="legend-item">
          <div className="legend-dot red"></div>
          Your Home
        </div>
        <div className="map-stat">{customerCount} homes in your area</div>
      </div>
    </div>
  );
}

function FallbackMap({
  customerCount,
  clientName,
}: {
  customerCount: number;
  clientName: string;
}) {
  const pins = Array.from({ length: Math.min(customerCount, 35) }, (_, i) => ({
    left: 5 + Math.random() * 90,
    top: 5 + Math.random() * 90,
    delay: i * 0.03,
  }));

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background:
          "linear-gradient(135deg, #e3edf5 0%, #d4e2ed 50%, #c8d8e4 100%)",
        backgroundImage: `
          linear-gradient(rgba(176,190,197,0.15) 1px, transparent 1px),
          linear-gradient(90deg, rgba(176,190,197,0.15) 1px, transparent 1px),
          linear-gradient(135deg, #e3edf5 0%, #d4e2ed 50%, #c8d8e4 100%)
        `,
        backgroundSize: "40px 40px, 40px 40px, 100% 100%",
      }}
    >
      <div style={{ position: "absolute", top: "35%", left: 0, right: 0, height: 3, background: "rgba(255,255,255,0.8)" }} />
      <div style={{ position: "absolute", top: "62%", left: "10%", right: "5%", height: 2, background: "rgba(255,255,255,0.8)" }} />
      <div style={{ position: "absolute", left: "28%", top: 0, bottom: 0, width: 3, background: "rgba(255,255,255,0.8)" }} />
      <div style={{ position: "absolute", left: "55%", top: "10%", bottom: "15%", width: 2, background: "rgba(255,255,255,0.8)" }} />
      <div style={{ position: "absolute", left: "78%", top: "5%", bottom: 0, width: 2, background: "rgba(255,255,255,0.8)" }} />

      {pins.map((pin, i) => (
        <div key={i} style={{ position: "absolute", left: `${pin.left}%`, top: `${pin.top}%`, zIndex: 2, animation: `dropIn 0.5s ease-out ${pin.delay}s backwards` }}>
          <div style={{ width: 14, height: 14, background: "#2e86de", border: "3px solid white", borderRadius: "50%", boxShadow: "0 2px 8px rgba(46,134,222,0.4)" }} />
        </div>
      ))}

      <div style={{ position: "absolute", left: "50%", top: "48%", transform: "translate(-50%, -50%)", zIndex: 10, textAlign: "center", animation: "dropIn 0.5s ease-out 1.2s backwards" }}>
        <div style={{ background: "#0a1628", color: "white", fontSize: 11, fontWeight: 600, padding: "4px 10px", borderRadius: 6, marginBottom: 6, whiteSpace: "nowrap", boxShadow: "0 2px 8px rgba(0,0,0,0.2)" }}>Your Home</div>
        <div style={{ width: 18, height: 18, background: "#ee5a24", border: "3px solid white", borderRadius: "50%", boxShadow: "0 2px 12px rgba(238,90,36,0.5)", margin: "0 auto" }} />
      </div>

      <style>{`
        @keyframes dropIn {
          from { opacity: 0; transform: translateY(-20px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
