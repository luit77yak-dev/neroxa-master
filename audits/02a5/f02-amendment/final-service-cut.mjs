import fs from 'node:fs';
import crypto from 'node:crypto';
/** Additional controls only: same ACL fragment; remote preimage guard NOT tested. */
export async function finalServiceCut({sql,ids,services,digest,report}){
 const manifest=JSON.parse(fs.readFileSync('audits/02a5/legacy-cut/MANIFEST.json'));
 const bytes=fs.readFileSync('audits/02a5/legacy-cut/revoke-observed.sql');
 if(crypto.createHash('sha256').update(bytes).digest('hex')!==manifest.files['revoke-observed.sql'])throw Error('Final cut fragment drift');
 sql('BEGIN;'+bytes.toString('utf8')+'COMMIT;');await new Promise(r=>setTimeout(r,2000));
 const out=report.finalServiceCut={scope:'disposable ONLY; exact ACL fragment, NOT remote preimage/identity/admission',status:'RUNNING',cases:[]};
 const payloads=[['get_public_order_status',{p_order_id:ids.Border,p_customer_phone:'00000000001'}],['append_public_order_items_with_payment',{p_order_id:ids.Border,p_customer_phone:'00000000001',p_items:[{product_id:'91000000-0000-4000-8000-000000000299',quantity:1,unit_price:0.01}],p_payment_method:'CASH'}]];
 for(const [name,payload] of payloads){const before=digest();const r=await services.admin.rpc(name,payload);const after=digest();const unchanged=JSON.stringify(before)===JSON.stringify(after);const row={rpc:name,actor:'service_role',http:r.status,sqlstate:r.error?.code??null,stateUnchanged:unchanged,status:[401,403].includes(r.status)&&r.error?.code==='42501'&&unchanged?'PASS':'FAIL',before,after};out.cases.push(row);if(row.status!=='PASS')throw Error('Final legacy service denial failed: '+name);}
 out.status='PASS DISPOSABLE SERVICE CUT';console.log('F02_FINAL_SERVICE_CUT='+JSON.stringify(out));
}
