import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { storagePath } = await req.json();
    if (!storagePath) {
      return NextResponse.json({ error: "Missing storagePath" }, { status: 400 });
    }

    // Basic security check: ensure the user can only download their own files
    if (!storagePath.startsWith(`${user.id}/`)) {
      return NextResponse.json({ error: "Unauthorized access to file" }, { status: 403 });
    }

    const adminClient = createAdminClient();
    const { data, error } = await adminClient.storage
      .from("generated_dashboards")
      .createSignedUrl(storagePath, 60);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ signedUrl: data.signedUrl });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
