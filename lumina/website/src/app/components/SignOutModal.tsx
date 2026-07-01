"use client";

import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { LogOut, X } from "lucide-react";

export default function SignOutModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { signOut } = useAuth();
  const [loading, setLoading] = useState(false);

  if (!open) return null;

  async function handleConfirm() {
    setLoading(true);
    await signOut();
    setLoading(false);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-xl bg-white p-8 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="float-right -mt-2 -mr-2 rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          aria-label="Close"
        >
          <X size={16} />
        </button>

        <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-[#FBEAE9]">
          <LogOut size={18} className="text-[#B3261E]" />
        </div>

        <h2 className="mb-2 text-xl font-bold tracking-tight text-[#133020]">
          Log out of Lumina?
        </h2>
        <p className="mb-6 text-sm text-gray-500">
          You'll need to log back in to see your conversations and generated dashboards.
        </p>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-[#133020] hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading}
            className="flex-1 rounded-lg bg-[#B3261E] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#8f1e18] disabled:opacity-50"
          >
            {loading ? "Logging out..." : "Log out"}
          </button>
        </div>
      </div>
    </div>
  );
}