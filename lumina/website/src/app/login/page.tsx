import type { Metadata } from "next";
import LoginScreen from "@/app/components/LoginScreen";

export const metadata: Metadata = {
  title: "lumina | login",
  description: "Sign in to Lumina to see your conversations and dashboards.",
};

export default function LoginPage() {
  return <LoginScreen />;
}