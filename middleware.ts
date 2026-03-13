import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function middleware(request: NextRequest) {
  var hostname = request.headers.get("host") || "";
  // Strip port for local dev
  hostname = hostname.split(":")[0];

  // Look up company by domain
  var { data: company } = await supabase
    .from("companies")
    .select("id, slug")
    .eq("domain", hostname)
    .eq("active", true)
    .single();

  // Clone the request headers and add company_id
  var requestHeaders = new Headers(request.headers);
  if (company) {
    requestHeaders.set("x-company-id", company.id);
    requestHeaders.set("x-company-slug", company.slug);
  }

  return NextResponse.next({
    request: { headers: requestHeaders },
  });
}

export const config = {
  matcher: ["/report/:path*", "/api/:path*"],
};
