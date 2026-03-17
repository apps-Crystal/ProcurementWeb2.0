import { Construction, ArrowLeft } from "lucide-react";
import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] text-center p-6">
      <div className="w-20 h-20 bg-primary-50 rounded-full flex items-center justify-center mb-6 border-4 border-surface shadow-sm text-primary-300">
        <Construction className="w-10 h-10" />
      </div>
      
      <h1 className="text-3xl font-bold text-primary-900 tracking-tight mb-2">View Not Implemented</h1>
      <p className="text-sm text-text-secondary max-w-md mx-auto mb-8 leading-relaxed">
        This view has not been built for the initial frontend demonstration. Please select a primary workflow item from the Sidebar, such as <strong className="text-primary-700">New MPR</strong>, <strong className="text-primary-700">GRN</strong>, or <strong className="text-primary-700">Three-Way Match</strong>.
      </p>

      <Link 
        href="/"
        className="inline-flex items-center justify-center h-10 px-6 font-medium text-sm transition-colors rounded-sm text-white bg-primary-900 hover:bg-primary-800 shadow-sm"
      >
        <ArrowLeft className="w-4 h-4 mr-2" />
        Return to Dashboard
      </Link>
    </div>
  );
}
