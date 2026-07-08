/** UTM triplet as captured from a request URL; null = absent/organic. */
export interface UtmParams {
  source: string | null;
  medium: string | null;
  campaign: string | null;
}
