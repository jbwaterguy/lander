import { supabase } from "./supabase";

export interface NearbyCustomer {
  lat: number;
  lng: number;
  install_date?: string;
}

/**
 * Fetches existing customers near a given lat/lng from Supabase.
 * Scoped to a specific company. Expands search radius until it finds at least 20.
 */
export async function fetchNearbyCustomers(
  lat: number,
  lng: number,
  companyId?: string
): Promise<NearbyCustomer[]> {
  var radiusSteps = [3, 10, 25, 50];

  for (var r = 0; r < radiusSteps.length; r++) {
    var radiusMiles = radiusSteps[r];
    var radiusDeg = radiusMiles / 69;

    var query = supabase
      .from("customers")
      .select("lat, lng, install_date")
      .gte("lat", lat - radiusDeg)
      .lte("lat", lat + radiusDeg)
      .gte("lng", lng - radiusDeg)
      .lte("lng", lng + radiusDeg);

    // Scope to company if provided
    if (companyId) {
      query = query.eq("company_id", companyId);
    }

    var { data, error } = await query;

    if (error) {
      console.error("Error fetching nearby customers:", error);
      break;
    }

    if (data && data.length >= 20) {
      return data;
    }

    // If we're on the last radius step, return whatever we found
    if (r === radiusSteps.length - 1 && data && data.length > 0) {
      return data;
    }
  }

  return [];
}
