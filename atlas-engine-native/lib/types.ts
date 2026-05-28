// Atlas Engine — shared types

export type SavedBusiness = {
  id: string;
  slug: string;
  name: string;
  industry: string | null;
  logo_url: string | null;
  hero_image_url: string | null;
  brand_colors: { primary: string; secondary: string; accent: string };
  added_at: string;       // ISO timestamp the user saved this business
  last_opened_at: string; // ISO timestamp last opened in WebView
};

export type DiscoverBusiness = {
  id: string;
  slug: string;
  name: string;
  industry: string | null;
  logo_url: string | null;
  brand_colors: { primary: string; secondary: string; accent: string };
};
