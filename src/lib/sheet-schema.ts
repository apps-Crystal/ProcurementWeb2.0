/**
 * sheet-schema.ts — Crystal Group Procurement System
 *
 * Single source of truth for every Google Sheet and its columns.
 * Column names here MUST exactly match Row 1 headers in the live Google Sheet.
 *
 * Used by sheets.ts to:
 *   1. Validate fields before writing (catches mismatches at dev time)
 *   2. Build rows without a live header fetch (faster writes)
 *   3. Warn on unknown or missing fields in dev/staging
 *
 * When you add a column to a sheet:
 *   → Add it here first, then add it to the Google Sheet Row 1.
 *   → Never add to the sheet without updating this file.
 */

export type SheetName = keyof typeof SHEET_SCHEMA;

export const SHEET_SCHEMA = {

    // ── VENDORS ────────────────────────────────────────────────────────────────
    // Bank/GST details moved to VENDOR_SUB_PROFILES (multi-account support)
    VENDORS: [
        "VENDOR_ID", "COMPANY_NAME", "VENDOR_TYPE", "CONTACT_PERSON",
        "EMAIL", "PHONE", "ADDRESS", "CITY",
        "STATE", "PAN", "IS_MSME", "UDYAM_REG_NUMBER",
        "TDS_CATEGORY", "KYC_PAN_COPY_URL", "KYC_MSME_CERT_URL", "YEARS_IN_BUSINESS",
        "KEY_CLIENT_1", "KEY_CLIENT_2", "WORK_EXPERIENCE_NOTES", "CAPACITY_SCALE",
        "REFERENCE_VERIFIED", "STATUS", "DEACTIVATION_REASON", "REGISTERED_BY",
        "REGISTERED_DATE", "APPROVED_BY", "APPROVED_DATE", "LAST_UPDATED_BY",
        "LAST_UPDATED_DATE", "REMARKS",
    ],

    // ── VENDOR SUB-PROFILES (bank accounts / GST registrations per vendor) ─────
    VENDOR_SUB_PROFILES: [
        "SUB_PROFILE_ID", "VENDOR_ID", "SUB_PROFILE_LABEL", "GSTIN",
        "BILLING_ADDRESS", "BILLING_STATE", "BANK_NAME", "ACCOUNT_NUMBER",
        "IFSC_CODE", "ACCOUNT_TYPE", "KYC_GST_CERT_URL", "KYC_CANCELLED_CHEQUE_URL",
        "IS_PRIMARY", "STATUS", "DEACTIVATION_REASON", "CREATED_BY",
        "CREATED_DATE", "VERIFIED_BY", "VERIFIED_DATE", "LAST_UPDATED_BY",
        "LAST_UPDATED_DATE", "REMARKS",
    ],

    // ── USERS ──────────────────────────────────────────────────────────────────
    USERS: [
        "USER_ID", "FULL_NAME", "EMAIL", "PHONE",
        "DEPARTMENT", "SITE", "ROLE", "IS_PROCUREMENT_HEAD",
        "IS_FINANCE_HEAD", "IS_SITE_HEAD", "APPROVAL_SITES", "PAYMENT_APPROVAL_LIMIT_INR",
        "STATUS", "ACCOUNT_LOCKED", "LAST_LOGIN_DATE", "PASSWORD_LAST_CHANGED",
        "ACCESS_REQUEST_DATE", "PROVISIONED_BY", "PROVISIONED_DATE", "MANAGER_APPROVED_BY",
        "REVOCATION_DATE", "REVOCATION_REASON", "LAST_UPDATED_BY", "LAST_UPDATED_DATE",
    ],

    // ── USER AUTH ──────────────────────────────────────────────────────────────
    USER_AUTH: [
        "USER_ID", "PASSWORD_HASH", "FAILED_LOGIN_COUNT", "RESET_TOKEN",
        "RESET_TOKEN_EXPIRY",
    ],

    // ── MPR (Material Purchase Request) ───────────────────────────────────────
    MPR: [
        "PR_ID", "PR_DATE", "PR_VERSION", "REQUESTOR_USER_ID",
        "REQUESTOR_NAME", "REQUESTOR_SITE", "CATEGORY", "PURPOSE",
        "PROCUREMENT_TYPE", "DELIVERY_LOCATION", "EXPECTED_DELIVERY_DATE", "PREFERRED_VENDOR_ID",
        "PREFERRED_VENDOR_NAME", "PAYMENT_TERMS", "ADVANCE_PERCENT", "CREDIT_PERIOD_DAYS",
        "RETENTION_AMOUNT", "PAYMENT_SCHEDULE_TYPE", "AMC_BILLING_FREQUENCY", "PAYMENT_LINKED_TO_MILESTONE",
        "LATE_DELIVERY_LD_PCT", "LATE_DELIVERY_LD_MAX_PCT", "QUALITY_STANDARD", "WARRANTY_MONTHS",
        "TEST_CERT_REQUIRED", "SPECIAL_COMMERCIAL_TERMS",
        "QUOTATION_URL", "PROFORMA_INVOICE_URL", "SUPPORTING_DOC_URL", "AI_EXTRACTED",
        "TOTAL_AMOUNT_BEFORE_GST", "TOTAL_GST_AMOUNT", "TOTAL_AMOUNT_WITH_GST", "PRICE_DEVIATION_FLAG",
        "STATUS", "ASSIGNED_APPROVER_ID", "ASSIGNED_APPROVER_NAME", "APPROVER_ACTION_DATE",
        "APPROVER_REMARKS", "SUBMITTED_DATE", "LAST_UPDATED_BY", "LAST_UPDATED_DATE",
    ],

    // ── MPR LINES ──────────────────────────────────────────────────────────────
    MPR_LINES: [
        "LINE_ID", "PR_ID", "LINE_NUMBER", "ITEM_NAME",
        "ITEM_DESCRIPTION", "UNIT_OF_MEASURE", "QUANTITY", "RATE",
        "GST_PERCENT", "HSN_CODE", "LINE_AMOUNT_BEFORE_GST", "GST_AMOUNT",
        "LINE_TOTAL", "ITEM_PURPOSE", "LAST_PURCHASE_PRICE", "PRICE_DEVIATION_PCT",
        "PRICE_DEVIATION_FLAG", "AI_OVERRIDDEN", "REMARKS",
    ],

    // ── SPR (Service Purchase Request) ────────────────────────────────────────
    SPR: [
        "SPR_ID", "SPR_DATE", "SPR_VERSION", "REQUESTOR_USER_ID",
        "REQUESTOR_NAME", "REQUESTOR_SITE", "SERVICE_CATEGORY", "SERVICE_SUBCATEGORY",
        "SERVICE_DESCRIPTION", "SERVICE_PURPOSE", "VENDOR_ID", "VENDOR_NAME",
        "PAYMENT_TERMS", "ADVANCE_PERCENT", "CREDIT_PERIOD_DAYS", "RETENTION_AMOUNT",
        "PAYMENT_SCHEDULE_TYPE", "CONTRACT_START_DATE", "CONTRACT_END_DATE", "AMC_VALUE",
        "AMC_SCOPE", "AMC_BILLING_FREQUENCY", "RENEWAL_ALERT_SENT", "PROJECT_CODE",
        "MILESTONE_TAGS", "PAYMENT_LINKED_TO_MILESTONES", "CONSULTANT_NAME", "ENGAGEMENT_TYPE",
        "SAC_CODE", "TDS_APPLICABLE", "TDS_SECTION", "QUANTITY",
        "RATE", "GST_PERCENT", "TOTAL_AMOUNT_BEFORE_GST", "TOTAL_GST_AMOUNT",
        "TOTAL_AMOUNT_WITH_GST", "QUOTATION_URL", "PROFORMA_INVOICE_URL", "SCOPE_DOC_URL",
        "STATUS", "ASSIGNED_APPROVER_ID", "ASSIGNED_APPROVER_NAME", "APPROVER_ACTION_DATE",
        "APPROVER_REMARKS", "SUBMITTED_DATE", "LAST_UPDATED_BY", "LAST_UPDATED_DATE",
    ],

    // ── PO (Purchase Order / Work Order) ──────────────────────────────────────
    PO: [
        "PO_ID", "PO_TYPE", "PO_DATE", "PO_VERSION",
        "TALLY_PO_NUMBER", "SOURCE_PR_ID", "SOURCE_PR_TYPE", "VENDOR_ID",
        "SUB_PROFILE_ID", "VENDOR_NAME", "VENDOR_EMAIL", "DELIVERY_DATE",
        "DELIVERY_LOCATION", "FREIGHT_CHARGES", "INSTALLATION_CHARGES", "PAYMENT_TERMS",
        "ADVANCE_PAYMENT_PCT", "ADVANCE_AMOUNT", "PAYMENT_SCHEDULE", "PAYMENT_SCHEDULE_TYPE",
        "PAYMENT_SCHEDULE_TOTAL_PCT", "SUBTOTAL", "TOTAL_GST",
        "FREIGHT_GST", "GRAND_TOTAL", "TC_STANDARD_APPLIED", "TC_CUSTOMISED",
        "TC_CUSTOMISATION_NOTES", "TC_APPROVED_BY", "PO_PDF_URL", "CUSTOM_TC_DOC_URL",
        "ACK_STATUS", "ACK_TIMESTAMP", "ACK_METHOD", "ACCEPTANCE_STATUS",
        "ACCEPTANCE_TIMESTAMP", "ACCEPTANCE_REMARKS", "FF_ALL_GRNS_CLOSED", "FF_NO_OPEN_FLAGS",
        "FF_WARRANTY_CONFIRMED", "FF_ADVANCE_ADJUSTED", "FF_NO_PENDING_DEBIT_NOTES", "FF_GST_ITC_CONFIRMED",
        "FF_TDS_CONFIRMED", "FF_CHECKLIST_COMPLETE", "STATUS", "CREATED_BY",
        "CREATED_DATE", "RELEASED_BY", "RELEASED_DATE", "AMENDMENT_REASON",
        "AMENDMENT_APPROVED_BY", "CANCELLATION_REASON", "CANCELLED_BY", "CANCELLED_DATE",
        "ADVANCE_RECOVERY_TRIGGERED", "LAST_UPDATED_BY", "LAST_UPDATED_DATE",
    ],

    // ── PO LINES ───────────────────────────────────────────────────────────────
    PO_LINES: [
        "PO_LINE_ID", "PO_ID", "LINE_NUMBER", "MPR_LINE_ID",
        "ITEM_NAME", "ITEM_DESCRIPTION", "UNIT_OF_MEASURE", "ORDERED_QTY",
        "RATE", "GST_PERCENT", "HSN_SAC_CODE", "LINE_AMOUNT_BEFORE_GST",
        "GST_AMOUNT", "LINE_TOTAL", "QTY_RECEIVED", "QTY_OUTSTANDING",
        "REMARKS",
    ],

    // ── PAYMENT SCHEDULE (tranches per PO / PR) ────────────────────────────────
    PAYMENT_SCHEDULE: [
        "SCHEDULE_ID", "PO_ID", "PR_ID", "PR_TYPE",
        "TRANCHE_NUMBER", "TRANCHE_NAME", "TRIGGER_EVENT", "MILESTONE_TAG",
        "PERCENT", "AMOUNT", "DUE_DAYS_AFTER_TRIGGER", "STATUS",
        "TRIGGERED_DATE", "TRIGGERED_BY", "PAY_ID", "PAYMENT_CREATED_DATE",
        "REMARKS", "CREATED_BY", "CREATED_DATE", "LAST_UPDATED_BY",
        "LAST_UPDATED_DATE",
    ],

    // ── GRN (Goods Receipt Note) ───────────────────────────────────────────────
    GRN: [
        "GRN_ID", "GRN_DATE", "PO_ID", "VENDOR_ID",
        "VENDOR_NAME", "SITE", "LR_CHALLAN_NUMBER", "VEHICLE_NUMBER",
        "TRANSPORTER_NAME", "DELIVERY_DATE", "EWAY_BILL_NUMBER", "VENDOR_INVOICE_NUMBER",
        "VENDOR_INVOICE_DATE", "QC_CONDUCTED", "QC_INSPECTOR_NAME", "QC_INSPECTION_DATE",
        "QC_OVERALL_OUTCOME", "QC_REMARKS", "DELIVERY_CHALLAN_URL", "MATERIAL_PHOTOS_URL",
        "VENDOR_INVOICE_URL", "TEST_CERTIFICATE_URL", "PACKING_LIST_URL", "TOTAL_ORDERED_QTY",
        "TOTAL_RECEIVED_QTY", "TOTAL_ACCEPTED_QTY", "TOTAL_DEFECTIVE_QTY", "INVOICE_ID",
        "AI_EXTRACTED_CHALLAN", "STATUS", "SITE_HEAD_USER_ID", "SITE_HEAD_NAME",
        "SITE_HEAD_ACTION_DATE", "SITE_HEAD_REMARKS", "ACCOUNTS_USER_ID", "ACCOUNTS_VERIFIED_DATE",
        "ACCOUNTS_REMARKS", "RAISED_BY_USER_ID", "RAISED_BY_NAME", "RAISED_DATE",
        "LAST_UPDATED_BY", "LAST_UPDATED_DATE",
    ],

    // ── GRN LINES ──────────────────────────────────────────────────────────────
    GRN_LINES: [
        "GRN_LINE_ID", "GRN_ID", "PO_LINE_ID", "LINE_NUMBER",
        "ITEM_NAME", "UNIT_OF_MEASURE", "ORDERED_QTY", "RECEIVED_QTY",
        "DEFECTIVE_QTY", "ACCEPTED_QTY", "ITEM_CONDITION", "QC_LINE_OUTCOME",
        "REMARKS",
    ],

    // ── SRN (Service Receipt Note) ─────────────────────────────────────────────
    SRN: [
        "SRN_ID", "SRN_DATE", "WO_ID", "SPR_ID",
        "VENDOR_ID", "VENDOR_NAME", "SITE", "SERVICE_DESCRIPTION",
        "SERVICE_PERIOD_FROM", "SERVICE_PERIOD_TO", "MILESTONE_CONFIRMED", "MILESTONE_NAME",
        "SERVICE_CHALLAN_URL", "SERVICE_REPORT_URL", "PEST_CONTROL_CARD_URL", "EQUIPMENT_SERVICE_CARD_URL",
        "SITE_PHOTOS_URL", "VENDOR_INVOICE_URL", "OTHER_DOCS_URL", "INVOICE_ID",
        "STATUS", "SITE_HEAD_USER_ID", "SITE_HEAD_NAME", "SITE_HEAD_ACTION_DATE",
        "SITE_HEAD_REMARKS", "ACCOUNTS_USER_ID", "ACCOUNTS_VERIFIED_DATE", "ACCOUNTS_REMARKS",
        "RAISED_BY_USER_ID", "RAISED_BY_NAME", "RAISED_DATE", "LAST_UPDATED_BY",
        "LAST_UPDATED_DATE",
    ],

    // ── SRN LINES ──────────────────────────────────────────────────────────────
    SRN_LINES: [
        "SRN_LINE_ID", "SRN_ID", "LINE_NUMBER", "SCOPE_ITEM",
        "DELIVERY_STATUS", "REMARKS", "QUANTITY", "RATE",
        "AMOUNT",
    ],

    // ── NON-PO GRN ─────────────────────────────────────────────────────────────
    NON_PO_GRN: [
        "NON_PO_ID", "NON_PO_DATE", "SITE", "VENDOR_ID",
        "VENDOR_NAME", "VENDOR_GSTIN", "PURCHASE_REASON", "TOTAL_AMOUNT",
        "GST_AMOUNT", "NET_PAYABLE", "PAYMENT_MODE", "IS_PETTY_CASH",
        "PETTY_CASH_EMPLOYEE_ID", "REIMBURSEMENT_STATUS", "REIMBURSEMENT_PAID_DATE", "VENDOR_INVOICE_URL",
        "SUPPORTING_DOC_URL", "STATUS", "APPROVER_TYPE", "APPROVER_USER_ID",
        "APPROVER_NAME", "APPROVER_ACTION_DATE", "APPROVER_REMARKS", "RAISED_BY_USER_ID",
        "RAISED_BY_NAME", "RAISED_DATE", "LAST_UPDATED_BY", "LAST_UPDATED_DATE",
    ],

    // ── NON-PO LINES ───────────────────────────────────────────────────────────
    NON_PO_LINES: [
        "NON_PO_LINE_ID", "NON_PO_ID", "LINE_NUMBER", "ITEM_DESCRIPTION",
        "UNIT_OF_MEASURE", "QUANTITY", "RATE", "GST_PERCENT",
        "LINE_TOTAL", "REMARKS",
    ],

    // ── INVOICES ───────────────────────────────────────────────────────────────
    INVOICES: [
        "INV_ID", "INVOICE_DATE", "VENDOR_INVOICE_NUMBER", "VENDOR_INVOICE_DATE",
        "VENDOR_ID", "VENDOR_NAME", "VENDOR_GSTIN", "CRYSTAL_GSTIN",
        "GRN_ID", "SRN_ID", "NON_PO_ID", "PO_ID",
        "AI_EXTRACTED", "AI_CONFIDENCE_SCORE", "AI_AUTHENTICITY_SCORE", "AI_AUTHENTICITY_FLAG",
        "TAXABLE_AMOUNT", "GST_AMOUNT", "TDS_AMOUNT", "TOTAL_PAYABLE",
        "INVOICE_PDF_URL", "STATUS", "HOLD_REASON", "UPLOADED_BY",
        "UPLOADED_DATE", "VERIFIED_BY", "VERIFIED_DATE", "REMARKS",
    ],

    // ── INVOICE LINES ──────────────────────────────────────────────────────────
    INVOICE_LINES: [
        "INVOICE_LINE_ID", "INV_ID", "LINE_NUMBER", "DESCRIPTION",
        "HSN_SAC_CODE", "QTY", "RATE", "TAXABLE_AMOUNT",
        "GST_PERCENT", "GST_AMOUNT", "LINE_TOTAL", "AI_EXTRACTED",
        "AI_CONFIDENCE_SCORE", "VERIFIED", "VERIFIED_BY", "REMARKS",
    ],

    // ── THREE-WAY MATCH ────────────────────────────────────────────────────────
    THREE_WAY_MATCH: [
        "MATCH_ID", "MATCH_TIMESTAMP", "INVOICE_ID", "PO_ID",
        "GRN_ID", "VENDOR_ID", "PO_RATE", "PO_QTY",
        "PO_AMOUNT", "GRN_ACCEPTED_QTY", "GRN_ACCEPTED_AMOUNT", "INVOICE_QTY",
        "INVOICE_RATE", "INVOICE_AMOUNT", "RATE_VARIANCE", "RATE_VARIANCE_PCT",
        "QTY_VARIANCE", "AMOUNT_VARIANCE", "MATCH_RESULT", "PAYMENT_ACTION",
        "DEBIT_NOTE_REQUIRED", "DEBIT_NOTE_ID", "REVIEWED_BY", "REVIEW_DATE",
        "REVIEW_REMARKS", "RESOLUTION_STATUS",
    ],

    // ── THREE-WAY MATCH LINES ──────────────────────────────────────────────────
    THREE_WAY_MATCH_LINES: [
        "MATCH_LINE_ID", "MATCH_ID", "LINE_NUMBER", "PO_LINE_ID",
        "GRN_LINE_ID", "SRN_LINE_ID", "INVOICE_LINE_ID", "PO_ITEM_DESCRIPTION",
        "PO_HSN_SAC_CODE", "PO_QTY", "PO_RATE", "PO_LINE_AMOUNT",
        "RECEIPT_QTY", "RECEIPT_AMOUNT", "INVOICE_QTY", "INVOICE_RATE",
        "INVOICE_LINE_AMOUNT", "RATE_VARIANCE", "RATE_VARIANCE_PCT", "QTY_VARIANCE",
        "AMOUNT_VARIANCE", "LINE_MATCH_RESULT", "LINE_PAYMENT_ACTION", "REMARKS",
    ],

    // ── PAYMENTS ───────────────────────────────────────────────────────────────
    PAYMENTS: [
        "PAYMENT_ID", "PAYMENT_DATE", "PAYMENT_TYPE", "INVOICE_ID",
        "PO_ID", "GRN_ID", "SRN_ID", "NON_PO_ID",
        "MATCH_ID", "VENDOR_ID", "SUB_PROFILE_ID", "VENDOR_NAME",
        "IS_MSME", "MSME_DUE_DATE", "PAYMENT_DUE_DATE", "GROSS_AMOUNT",
        "ADVANCE_DEDUCTION", "CREDIT_NOTE_DEDUCTION", "DEBIT_NOTE_DEDUCTION", "TDS_DEDUCTION",
        "NET_PAYABLE", "PAYMENT_MODE", "BANK_ACCOUNT_NUMBER", "IFSC_CODE",
        "UTR_NUMBER", "PAYMENT_VOUCHER_NUMBER", "PAYMENT_ADVICE_PDF_URL", "STATUS",
        "HOLD_REASON", "IS_PREPAID", "IS_FINAL_PAYMENT", "CREATED_BY",
        "CREATED_DATE", "LAST_UPDATED_BY", "LAST_UPDATED_DATE", "REMARKS",
        "SCHEDULE_ID", "TRANCHE_NUMBER", "TRANCHE_NAME",
    ],

    // ── PAYMENT STAGES ─────────────────────────────────────────────────────────
    PAYMENT_STAGES: [
        "STAGE_LOG_ID", "PAYMENT_ID", "STAGE_NUMBER", "STAGE_NAME",
        "ACTOR_USER_ID", "ACTOR_NAME", "ACTOR_ROLE", "ACTION",
        "ACTION_TIMESTAMP", "REMARKS", "SLA_DUE_TIMESTAMP", "SLA_BREACHED",
        "ESCALATION_SENT_TO", "ESCALATION_TIMESTAMP", "SOD_CHECK_PASSED", "SOD_VIOLATION_FLAG",
    ],

    // ── FLAGS ──────────────────────────────────────────────────────────────────
    FLAGS: [
        "FLAG_ID", "FLAG_DATE", "SOURCE_TYPE", "SOURCE_ID",
        "PAYMENT_ID", "VENDOR_ID", "FLAG_TYPE", "FLAG_DESCRIPTION",
        "RAISED_BY_USER_ID", "RAISED_BY_NAME", "RAISED_BY_ROLE", "RAISED_DATE",
        "REVIEWED_BY_USER_ID", "REVIEWED_BY_NAME", "REVIEW_DATE", "REVIEW_COMMENTS",
        "RESOLUTION", "RESOLUTION_DATE", "DEBIT_NOTE_AMOUNT", "DEBIT_NOTE_ID",
        "PAYMENT_RELEASED_AFTER_RESOLUTION", "STATUS", "LAST_UPDATED_BY", "LAST_UPDATED_DATE",
    ],

    // ── FLAGS COMMENTS ─────────────────────────────────────────────────────────
    FLAGS_COMMENTS: [
        "COMMENT_ID", "FLAG_ID", "COMMENT_DATE", "COMMENTED_BY_USER_ID",
        "COMMENTED_BY_NAME", "COMMENTED_BY_ROLE", "COMMENT_TEXT", "ATTACHMENT_URL",
        "IS_RESOLUTION_COMMENT",
    ],

    // ── FEEDBACK (app-level bug reports & feature requests) ──────────────────
    FEEDBACK: [
        "FEEDBACK_ID", "FEEDBACK_DATE", "TYPE", "CATEGORY",
        "TITLE", "DESCRIPTION", "SCREENSHOT_1_URL", "SCREENSHOT_2_URL",
        "SCREENSHOT_3_URL", "SEVERITY", "BROWSER_INFO", "PAGE_URL",
        "REPORTED_BY_USER_ID", "REPORTED_BY_NAME", "REPORTED_BY_ROLE", "STATUS",
        "PRIORITY", "ASSIGNED_TO_USER_ID", "ASSIGNED_TO_NAME", "RESOLUTION_NOTES",
        "RESOLVED_DATE", "CREATED_DATE", "LAST_UPDATED_BY", "LAST_UPDATED_DATE",
    ],

    // ── FEEDBACK COMMENTS (conversation thread on feedback items) ────────────
    FEEDBACK_COMMENTS: [
        "COMMENT_ID", "FEEDBACK_ID", "COMMENT_DATE", "COMMENTED_BY_USER_ID",
        "COMMENTED_BY_NAME", "COMMENTED_BY_ROLE", "COMMENT_TEXT", "ATTACHMENT_URL",
        "IS_INTERNAL_NOTE",
    ],

    // ── AUDIT LOG ──────────────────────────────────────────────────────────────
    AUDIT_LOG: [
        "LOG_ID", "TIMESTAMP", "USER_ID", "USER_NAME",
        "USER_ROLE", "IP_ADDRESS", "MODULE", "RECORD_ID",
        "ACTION", "FIELD_CHANGED", "OLD_VALUE", "NEW_VALUE",
        "REMARKS",
    ],

    // ── DROPDOWNS ──────────────────────────────────────────────────────────────
    DROPDOWNS: [
        "LIST_NAME", "VALUE", "DISPLAY_LABEL", "SORT_ORDER",
        "IS_ACTIVE",
    ],

    // ── VENDORS BACKUP (pre-migration snapshot) ────────────────────────────────
    VENDORS_BACKUP_v1_1: [
        "VENDOR_ID", "COMPANY_NAME", "VENDOR_TYPE", "CONTACT_PERSON",
        "EMAIL", "PHONE", "ADDRESS", "CITY",
        "STATE", "GSTIN", "PAN", "IS_MSME",
        "UDYAM_REG_NUMBER", "TDS_CATEGORY", "BANK_NAME", "ACCOUNT_NUMBER",
        "IFSC_CODE", "ACCOUNT_TYPE", "KYC_GST_CERT_URL", "KYC_PAN_COPY_URL",
        "KYC_CANCELLED_CHEQUE_URL", "KYC_MSME_CERT_URL", "YEARS_IN_BUSINESS", "KEY_CLIENT_1",
        "KEY_CLIENT_2", "WORK_EXPERIENCE_NOTES", "CAPACITY_SCALE", "REFERENCE_VERIFIED",
        "STATUS", "DEACTIVATION_REASON", "REGISTERED_BY", "REGISTERED_DATE",
        "APPROVED_BY", "APPROVED_DATE", "LAST_UPDATED_BY", "LAST_UPDATED_DATE",
        "REMARKS",
    ],

    // ── MIGRATION LOG ──────────────────────────────────────────────────────────
    MIGRATION_LOG: [
        "TIMESTAMP", "ACTION", "DETAIL", "STATUS",
    ],

    // ── SEQUENCES (atomic ID counters — do not edit manually) ─────────────────
    SEQUENCES: ["SHEET_NAME", "LAST_SEQ"],

} as const;

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/** Returns the ordered column list for a sheet, or undefined if sheet is unknown. */
export function getSheetColumns(sheetName: string): readonly string[] | undefined {
    return (SHEET_SCHEMA as Record<string, readonly string[]>)[sheetName];
}

/** Returns true if the given sheet name is defined in the schema. */
export function isKnownSheet(sheetName: string): sheetName is SheetName {
    return sheetName in SHEET_SCHEMA;
}

/** Returns any fields that are in `fields` but NOT in the sheet schema. */
export function getUnknownFields(
    sheetName: string,
    fields: Record<string, unknown>
): string[] {
    const cols = getSheetColumns(sheetName);
    if (!cols) return [];
    return Object.keys(fields).filter((f) => !(cols as readonly string[]).includes(f));
}

/** Returns any schema columns that are missing from the `fields` object (for debugging). */
export function getMissingFields(
    sheetName: string,
    fields: Record<string, unknown>
): string[] {
    const cols = getSheetColumns(sheetName);
    if (!cols) return [];
    return (cols as readonly string[]).filter((c) => !(c in fields));
}