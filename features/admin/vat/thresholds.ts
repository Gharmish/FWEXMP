/**
 * ZATCA VAT registration thresholds (KSA): taxable turnover over any
 * rolling 12-month period. Registration becomes MANDATORY at 375,000 SAR
 * and available voluntarily at half that. The cron alerts the team when
 * turnover crosses ALERT_RATIO of the mandatory line so registration can
 * be arranged before the legal deadline, not after.
 */
export const VAT_MANDATORY_THRESHOLD_SAR = 375_000;
export const VAT_VOLUNTARY_THRESHOLD_SAR = 187_500;
export const VAT_THRESHOLD_ALERT_RATIO = 0.9;
