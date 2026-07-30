import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * Delete a finished report: the file in storage, its record, and the summarised data
 * behind it.
 *
 * The conversation it came from is deliberately left alone. Deleting it would cascade
 * away the chat as well, and somebody clearing out reports built by code that has since
 * been improved is not asking to lose what they said.
 */
export async function DELETE(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { fileId } = await req.json();
    if (!fileId) {
      return NextResponse.json({ error: "Missing fileId" }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data: file, error: findError } = await admin
      .from("generated_files")
      .select("id, storage_path, dataset_id")
      .eq("id", fileId)
      .maybeSingle();

    if (findError) {
      return NextResponse.json({ error: findError.message }, { status: 500 });
    }
    if (!file) {
      return NextResponse.json({ error: "No such report" }, { status: 404 });
    }

    // Stored under the owner's id, which is what the download route checks too. Done
    // with the admin client, so this is the only thing standing between one account and
    // another's reports.
    if (!file.storage_path?.startsWith(`${user.id}/`)) {
      return NextResponse.json({ error: "Not your report" }, { status: 403 });
    }

    // Storage first. A record pointing at a file that is already gone is recoverable;
    // a file with no record is invisible and can never be cleared up.
    const { error: storageError } = await admin.storage
      .from("generated-files")
      .remove([file.storage_path]);
    if (storageError) {
      return NextResponse.json({ error: storageError.message }, { status: 500 });
    }

    const { error: rowError } = await admin
      .from("generated_files")
      .delete()
      .eq("id", file.id);
    if (rowError) {
      return NextResponse.json({ error: rowError.message }, { status: 500 });
    }

    // The summarised figures exist only to feed this one report, and nothing references
    // them once its record is gone. Left behind, they accumulate silently — there were
    // already fifty of these against forty-seven reports.
    if (file.dataset_id) {
      await admin.from("datasets").delete().eq("id", file.dataset_id);
    }

    return NextResponse.json({ deleted: file.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not delete that report.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
