// src/app/api/auth/create-profile/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: NextRequest) {
  try {
    const { userId, fullName, username, contactNumber, organization } =
      await req.json();

    // Basic server-side validation
    if (!userId || !fullName || !username || !contactNumber) {
      return NextResponse.json(
        { error: "Missing required fields." },
        { status: 400 }
      );
    }

    const admin = createAdminClient();

    // Insert the profile row using the service role client.
    // - Bypasses RLS so it works before the user confirms their email.
    // - The FK constraint (profiles.id → auth.users.id) acts as the
    //   security check: if userId doesn't exist in auth.users the insert
    //   will fail with a 23503 foreign key violation, so no extra
    //   getUserById call is needed.
    const { error: insertError } = await admin.from("profiles").insert({
      id: userId,
      full_name: fullName.trim(),
      username: username.trim().toLowerCase(),
      contact_number: contactNumber.trim(),
      organization: organization?.trim() || null,
      avatar_url: null,
    });

    if (insertError) {
      // Duplicate username
      if (insertError.code === "23505") {
        return NextResponse.json(
          { error: "That username is already taken." },
          { status: 409 }
        );
      }
      // userId doesn't exist in auth.users (spoofed request)
      if (insertError.code === "23503") {
        return NextResponse.json(
          { error: "User not found." },
          { status: 404 }
        );
      }
      throw insertError;
    }

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (err: any) {
    console.error("[create-profile]", err);
    return NextResponse.json(
      { error: err.message ?? "Internal server error." },
      { status: 500 }
    );
  }
}