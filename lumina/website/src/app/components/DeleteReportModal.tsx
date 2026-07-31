"use client";

import { useState } from "react";
import { Trash2, X } from "lucide-react";

/**
 * Confirms deleting a report, from the sidebar or from the Files view.
 *
 * Asked rather than assumed, because the file is genuinely gone afterwards — removed from
 * storage, not hidden — and because both places this is reached from are lists of
 * near-identical rows a single click apart.
 *
 * Styled after SignOutModal, the project's other confirmation, so the two behave alike.
 */

interface DeleteReportModalProps {
  /** The name, so it is obvious which one is about to go. */
  name: string;
  /** A report, or a whole conversation. They lose different things. */
  what?: "report" | "conversation";
  onClose: () => void;
  onConfirm: () => Promise<void>;
}

export default function DeleteReportModal({ name, what = "report", onClose, onConfirm }: DeleteReportModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    setLoading(true);
    setError(null);
    try {
      await onConfirm();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete that report.");
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={loading ? undefined : onClose}
    >
      <div className="w-full max-w-sm rounded-xl bg-white p-8 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={onClose}
          disabled={loading}
          className="float-right -mt-2 -mr-2 rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:opacity-40"
        >
          <X size={16} />
        </button>

        <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-[#FBEAE9]">
          <Trash2 size={18} className="text-[#B3261E]" />
        </div>

        <h2 className="mb-2 text-xl font-bold tracking-tight text-[#133020]">
          {what === "conversation" ? "Delete this conversation?" : "Delete this report?"}
        </h2>
        <p className="mb-6 text-sm text-gray-500">
          <span className="font-semibold text-[#133020]">{name}</span>{" "}
          {what === "conversation" ? (
            <>
              will be removed for good, <strong>along with any Power BI file built during
              it</strong>. Everything is stored against the conversation, so the reports
              cannot be kept without it.
            </>
          ) : (
            <>
              and its Power BI file will be removed for good. The conversation it came from
              is kept, and stays in your Chats list.
            </>
          )}
        </p>

        {error && <p className="mb-4 text-sm text-[#B3261E]">{error}</p>}

        <div className="flex gap-3">
          <button
            onClick={onClose}
            disabled={loading}
            className="flex-1 rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-[#133020] hover:bg-gray-50 disabled:opacity-50"
          >
            Keep it
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading}
            className="flex-1 rounded-lg bg-[#B3261E] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#8f1e18] disabled:opacity-50"
          >
            {loading ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}
