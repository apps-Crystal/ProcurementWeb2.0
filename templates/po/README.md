# PO PDF Templates

This folder stores reference templates for PO PDF generation.

## Files

- `po-template.html` — HTML template used by the print route `/po/[id]/print`
- `letterhead-header.png` — Crystal Group / CRPL Infra Pvt. Ltd. letterhead header image
  *(Place the Crystal Group header letterhead PNG here — used in PO PDF header)*
- `letterhead-footer.png` — Crystal Group footer with address / phone / website
  *(Place the Crystal Group footer PNG here — used in PO PDF footer)*

## How the PO PDF works

1. After a PO is created, open `/po/<PO_ID>/print` in the browser
2. The page displays the full Purchase Order with Crystal Group letterhead
3. Use browser **Print → Save as PDF** (Ctrl+P / Cmd+P) to generate the PDF
4. OR: Click the "Download PDF" button on the PO detail page which opens this URL in a new tab

## Adding Letterhead Images

1. Save `letterhead-header.png` in this folder:  `/templates/po/letterhead-header.png`
2. Save `letterhead-footer.png` in this folder: `/templates/po/letterhead-footer.png`
3. Copy both to `public/letterhead/` so Next.js serves them:
   ```
   mkdir -p public/letterhead
   cp templates/po/letterhead-header.png public/letterhead/header.png
   cp templates/po/letterhead-footer.png public/letterhead/footer.png
   ```
4. The print page at `/po/[id]/print` will automatically use `/letterhead/header.png`
   and `/letterhead/footer.png` as the letterhead.

## Sample PO Reference

`Kingspan Jindal PUF Panel PO-2.docx` — the reference document provided by Crystal Group
showing the expected PO format (table of line items, payment terms, T&C structure).
