/**
 * Print page layout — hides sidebar/navbar via CSS so the PO renders full-width.
 * NOTE: We cannot render <html>/<body> here (Next.js App Router only allows that
 * in the root layout). Instead we use a wrapper div + global style injection to
 * suppress the AppShell chrome on this route.
 */
export default function PrintLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <style>{`
        /* Hide sidebar / topbar only on the print route */
        body { background: #f0f0f0 !important; }
        /* Suppress AppShell chrome so PO fills the viewport */
        nav, aside, header, [data-sidebar], [data-topbar] { display: none !important; }
        main { padding: 0 !important; margin: 0 !important; width: 100% !important; }
        @media print {
          body { background: white !important; }
        }
      `}</style>
      {children}
    </>
  );
}
