import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(process.cwd(), 'audits/sql');
const read = (name: string) => readFileSync(resolve(root, name), 'utf8');
describe('store isolation candidate static security gates', () => {
 it('replaces broad organization policies before adding scoped policies', () => {
  const sql=read('store-isolation-policies.candidate.sql');
  for(const table of ['products','categories','orders']) {
   expect(sql).toContain('DROP POLICY IF EXISTS "organization manager');
   expect(sql).toContain('instance members '+table+' read');
  }
 });
 it('checks both old and new row on updates',()=>{
  const sql=read('store-isolation-policies.candidate.sql');
  expect(sql).toMatch(/FOR UPDATE TO authenticated[\s\S]*?USING[\s\S]*?WITH CHECK/);
 });
 it('prevents cross-instance product-category references',()=>{
  const sql=read('store-product-category-guard.candidate.sql');
  expect(sql).toContain('c.instance_id = NEW.instance_id');
  expect(sql).toContain('BEFORE INSERT OR UPDATE');
 });
 it('does not accidentally claim settings or zones are scoped',()=>{
  const sql=read('store-isolation-policies.candidate.sql');
  expect(sql).toContain('settings and zones have no instance_id');
 });
});
