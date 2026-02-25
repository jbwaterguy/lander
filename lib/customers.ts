import { supabase } from "./supabase";

export interface NearbyCustomer {
  lat: number;
  lng: number;
  install_date?: string;
}

/**
 * Fetches existing customers near a given lat/lng from Supabase.
 * Expands search radius until it finds at least 20 customers.
 * Starts at 3 miles, then 10, 25, 50.
 */
export async function fetchNearbyCustomers(
  lat: number,
  lng: number
): Promise<NearbyCustomer[]> {
  const radiusSteps = [3, 10, 25, 50];

  for (const radiusMiles of radiusSteps) {
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
      break;
    }

    if (data && data.length >= 20) {
      return data;
    }

    // If we're on the last radius step, return whatever we found
    if (radiusMiles === radiusSteps[radiusSteps.length - 1] && data && data.length > 0) {
      return data;
    }
  }

  // Final fallback — return empty array instead of fake data
  return [];
}
