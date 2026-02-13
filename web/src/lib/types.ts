export type CatalogStatus = "draft" | "ready" | "published" | "archived";

export type ParseStatus =
  | "queued"
  | "processing"
  | "needs_review"
  | "failed"
  | "complete";

export type ParserJobStatus = "queued" | "processing" | "success" | "failed";

export interface Profile {
  user_id: string;
  role: "admin";
  created_at: string;
}

export interface Catalog {
  id: string;
  version_label: string;
  pdf_storage_path: string;
  status: CatalogStatus;
  parse_status: ParseStatus;
  parse_summary: Record<string, unknown>;
  created_by: string;
  created_at: string;
  published_at: string | null;
}

export interface CatalogItem {
  id: string;
  catalog_id: string;
  sku: string;
  name: string;
  upc: string | null;
  pack: string | null;
  category: string;
  image_storage_path: string;
  parse_issues: string[];
  approved: boolean;
  updated_at: string;
}

export interface CustomerLink {
  id: string;
  token: string;
  catalog_id: string;
  customer_name: string;
  active: boolean;
  created_by: string;
  created_at: string;
  disabled_at: string | null;
}

export interface Order {
  id: string;
  customer_link_id: string;
  catalog_id: string;
  customer_name: string;
  submitted_at: string;
  total_skus: number;
  total_cases: number;
  csv_storage_path: string | null;
}

export interface OrderItem {
  id: string;
  order_id: string;
  sku: string;
  product_name: string;
  upc: string | null;
  pack: string | null;
  category: string;
  qty: number;
}

export interface ParserJob {
  id: string;
  catalog_id: string;
  status: ParserJobStatus;
  attempts: number;
  error_log: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

export interface ProductForOrder {
  sku: string;
  name: string;
  upc: string;
  pack: string;
  category: string;
  imageUrl: string;
}

