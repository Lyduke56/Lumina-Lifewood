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

    // Verify the userId actually exists in auth.users before inserting.
    // This prevents anyone from POSTing arbitrary userIds to this endpoint.
    const admin = createAdminClient();
    const { data: authUser, error: authError } =
      await admin.auth.admin.getUserById(userId);

    if (authError || !authUser.user) {
      return NextResponse.json(
        { error: "User not found." },
        { status: 404 }
      );
    }

    // Insert the profile row — service role bypasses RLS so this works
    // even before the user confirms their email.
    const { error: insertError } = await admin.from("profiles").insert({
      id: userId,
      full_name: fullName.trim(),
      username: username.trim().toLowerCase(),
      contact_number: contactNumber.trim(),
      organization: organization?.trim() || null,
      avatar_url: null,
    });

    if (insertError) {
      // Surface duplicate username clearly
      if (insertError.code === "23505") {
        return NextResponse.json(
          { error: "That username is already taken." },
          { status: 409 }
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