import Link from "next/link";
import { LoginForm } from "@/components/login-form";

export default function LoginPage() {
  return (
    <div className="container grid">
      <Link href="/">← Back</Link>
      <LoginForm />
    </div>
  );
}

