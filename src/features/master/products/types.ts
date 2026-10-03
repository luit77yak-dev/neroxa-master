export type NeroxaProduct = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  category: string;
  system_id: string | null;
  setup_price: number;
  price_monthly: number;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type NeroxaProductPlan = {
  id: string;
  plan_id: string;
  product_id: string;
  included: boolean;
  quantity: number | null;
  created_at: string;
};
