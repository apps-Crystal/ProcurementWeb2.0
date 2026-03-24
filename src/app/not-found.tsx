import Link from "next/link";
import { AlertTriangle } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center">
      <AlertTriangle className="w-12 h-12 text-primary-300" />
      <h1 className="text-6xl font-bold text-primary-900">404</h1>
      <p className="text-text-secondary text-lg">The page you&apos;re looking for doesn&apos;t exist.</p>
      <Link href="/" className="text-primary-600 underline hover:text-primary-800 text-sm font-medium">
        Back to Dashboard
      </Link>
    </div>
  );
}
