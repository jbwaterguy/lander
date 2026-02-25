import { supabase } from "./supabase";

export interface NearbyCustomer {
  lat: number;
  lng: number;
  install_date?: string;
}

/**
 * Fetches existing customers near a given lat/lng from Supabase.
 *
 * Your "customers" table should have columns:
 *   id, lat (float8), lng (float8), install_date (date), city (text)
 *
 * You can import your spreadsheet directly into Supabase:
 *   Supabase Dashboard > Table Editor > Import CSV
 *
 * To geocode addresses into lat/lng before importing, you can use:
 *   - Google Sheets geocoding add-on
 *   - A bulk geocoder like geocod.io ($0.50 per 1000 addresses)
 *   - Or I can build a script for you
 */
export async function fetchNearbyCustomers(
  lat: number,
  lng: number,
  radiusMiles: number = 10
): Promise<NearbyCustomer[]> {
  // Convert miles to approximate degrees (1 degree ≈ 69 miles)
  const radiusDeg = radiusMiles / 69;

  const { data, error } = await supabase
    .from("customers")
    .select("lat, lng, install_date")
    .gte("lat", lat - radiusDeg)
    .lte("lat", lat + radiusDeg)
    .gte("lng", lng - radiusDeg)
    .lte("lng", lng + radiusDeg);

  if (error) {
    console.error("Error fetching nearby customers:", error);
    // Return mock data as fallback during development
    return getMockNearbyCustomers(lat, lng);
  }

  return data || getMockNearbyCustomers(lat, lng);
}

/**
 * Mock data for development — remove once real data is in Supabase
 */
function getMockNearbyCustomers(
  centerLat: number,
  centerLng: number
): NearbyCustomer[] {
  const customers: NearbyCustomer[] = [];
  const count = 47;

  for (let i = 0; i < count; i++) {
    // Scatter pins within ~2 miles of center
    const angle = Math.random() * Math.PI * 2;
    const distance = Math.random() * 0.03; // ~2 miles in degrees
    customers.push({
      lat: centerLat + Math.cos(angle) * distance,
      lng: centerLng + Math.sin(angle) * distance,
      install_date: randomRecentDate(),
    });
  }

  return customers;
}

function randomRecentDate(): string {
  const months = [
    "2025-08",
    "2025-09",
    "2025-10",
    "2025-11",
    "2025-12",
    "2026-01",
    "2026-02",
  ];
  const m = months[Math.floor(Math.random() * months.length)];
  const d = String(Math.floor(Math.random() * 28) + 1).padStart(2, "0");
  return `${m}-${d}`;
}
