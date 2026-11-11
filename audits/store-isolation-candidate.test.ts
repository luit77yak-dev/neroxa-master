import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (name: string) => readFileSync(resolve(process.cwd(), "audits/sql", name), "utf8");

describe("store isolation candidate security gates", () => {
  it("hardens the failures observed in the real JWT matrix", () => {
    const sql = read("store-isolation-runtime-hardening.candidate.sql");
    expect(sql).toContain("(auth.jwt()->>'aal')='aal2'");
    expect(sql).toContain("NEW.instance_id IS DISTINCT FROM OLD.instance_id");
    expect(sql).toContain("REVOKE INSERT,UPDATE,DELETE");
    expect(sql).toContain("instance members order items read");
    expect(sql).toContain("instance members order history read");
    expect(sql).toContain("subtotal=o.subtotal+v_add,total=o.total+v_add");
  });

  it("terminates every full RPC definition before the next CREATE", () => {
    const sql = read("storefront-rpcs-phase2.candidate.sql");
    const functions = sql.split("CREATE OR REPLACE FUNCTION").slice(1);
    expect(functions).toHaveLength(4);
    for (const definition of functions) expect(definition.trim()).toMatch(/\$function\$;$/);
  });

  it("removes organization-wide product and category policies", () => {
    const sql = read("store-isolation-policies.candidate.sql");
    for (const name of [
      "organization manager storefront products write",
      "organization member storefront products select",
      "organization manager storefront categories write",
      "organization member storefront categories select",
      "organization manager orders update",
      "organization member orders select",
    ]) {
      expect(sql).toContain('DROP POLICY IF EXISTS "' + name + '"');
    }
  });

  it("uses old and new row authorization for updates", () => {
    const sql = read("store-isolation-policies.candidate.sql");
    expect(sql).toMatch(/FOR UPDATE TO authenticated[\s\S]*?USING[\s\S]*?WITH CHECK/);
  });

  it("rejects cross-instance category links", () => {
    const sql = read("store-product-category-guard.candidate.sql");
    expect(sql).toContain("c.instance_id = NEW.instance_id");
  });

  it("requires an explicit order instance instead of first active instance", () => {
    const sql = read("storefront-rpcs-phase2.candidate.sql");
    expect(sql).toContain("i.id=nullif(p_order->>'instance_id','')::uuid");
    expect(sql).not.toContain("order by i.created_at limit 1");
  });

  it("requires a verified catalog domain consistent with the target instance", () => {
    const sql = read("storefront-rpcs-phase2.candidate.sql");
    expect(sql).toContain("p_order->>'store_domain'");
    expect(sql).toContain("public.get_public_storefront_context(v_store_domain)");
    expect(sql).toContain("ctx.organization_id=v_org");
    expect(sql).toContain("v_domain_instance IS DISTINCT FROM v_instance");
    expect(sql.indexOf("v_domain_instance IS DISTINCT FROM v_instance")).toBeLessThan(
      sql.indexOf("if nullif(p_order->>'idempotency_key','') is not null then"),
    );
  });

  it("scopes catalog settings and zones by instance", () => {
    const sql = read("storefront-rpcs-phase2.candidate.sql");
    expect(sql).toContain("s.instance_id = v_instance");
    expect(sql).toContain("z.instance_id = v_instance");
    expect(sql).toContain("s.instance_id=p_instance_id");
  });

  it("checks admin order update membership against the actual order", () => {
    const sql = read("storefront-rpcs-phase2.candidate.sql");
    expect(sql).toContain("has_instance_role(v_order.instance_id");
  });

  it("guards child tenant fields and parent organization reassignment", () => {
    const child = read("storefront-tenant-integrity.candidate.sql");
    const parent = read("storefront-parent-instance-guard.candidate.sql");
    for (const table of [
      "neroxa_storefront_settings",
      "neroxa_storefront_delivery_zones",
      "neroxa_orders",
    ]) {
      expect(child).toContain("ON public." + table);
    }
    expect(child).toContain("NEW.instance_id IS DISTINCT FROM OLD.instance_id");
    expect(child).toContain("NEW.organization_id IS DISTINCT FROM OLD.organization_id");
    expect(parent).toContain("BEFORE UPDATE OF organization_id");
    expect(parent).toContain("NEW.organization_id IS DISTINCT FROM OLD.organization_id");
  });

  it("blocks key cutover while unresolved records exist", () => {
    const sql = read("storefront-instance-phase2-cutover.candidate.sql");
    expect(sql).toContain("WHERE instance_id IS NULL");
    expect(sql).toContain("Organization/instance mismatch");
  });
});
