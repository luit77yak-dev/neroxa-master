import { supabase } from "@/integrations/supabase/client";
import type { NeroxaProduct, NeroxaProductPlan } from "./types";

export async function listProducts(): Promise<NeroxaProduct[]> {
  const { data, error } = await supabase
    .from("neroxa_products" as never)
    .select("*")
    .order("active", { ascending: false })
    .order("name", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as NeroxaProduct[];
}

export async function createProduct(input: {
  name: string;
  slug: string;
  description?: string;
  category: string;
  systemId?: string | null;
  setupPrice: number;
  priceMonthly: number;
  active: boolean;
}) {
  const { data, error } = await supabase
    .from("neroxa_products" as never)
    .insert({
      name: input.name.trim(),
      slug: input.slug.trim().toLowerCase(),
      description: input.description?.trim() || null,
      category: input.category.trim() || "SOLUTION",
      system_id: input.systemId || null,
      setup_price: input.setupPrice,
      price_monthly: input.priceMonthly,
      active: input.active,
    } as never)
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return (data as { id: string }).id;
}

export async function updateProduct(input: {
  id: string;
  name: string;
  slug: string;
  description?: string;
  category: string;
  systemId?: string | null;
  setupPrice: number;
  priceMonthly: number;
  active: boolean;
}) {
  const { error } = await supabase
    .from("neroxa_products" as never)
    .update({
      name: input.name.trim(),
      slug: input.slug.trim().toLowerCase(),
      description: input.description?.trim() || null,
      category: input.category.trim() || "SOLUTION",
      system_id: input.systemId || null,
      setup_price: input.setupPrice,
      price_monthly: input.priceMonthly,
      active: input.active,
      updated_at: new Date().toISOString(),
    } as never)
    .eq("id", input.id);
  if (error) throw new Error(error.message);
}

export async function deleteProduct(id: string) {
  const { error } = await supabase.from("neroxa_products" as never).delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function listProductPlans(productId: string): Promise<NeroxaProductPlan[]> {
  const { data, error } = await supabase
    .from("neroxa_plan_products" as never)
    .select("*")
    .eq("product_id", productId);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as NeroxaProductPlan[];
}

export async function setPlanProduct(input: {
  planId: string;
  productId: string;
  included: boolean;
  quantity?: number | null;
}) {
  const { error } = await supabase
    .from("neroxa_plan_products" as never)
    .upsert({
      plan_id: input.planId,
      product_id: input.productId,
      included: input.included,
      quantity: input.quantity ?? null,
    } as never, { onConflict: "plan_id,product_id" });
  if (error) throw new Error(error.message);
}

export async function removePlanProduct(planId: string, productId: string) {
  const { error } = await supabase
    .from("neroxa_plan_products" as never)
    .delete()
    .eq("plan_id", planId)
    .eq("product_id", productId);
  if (error) throw new Error(error.message);
}
