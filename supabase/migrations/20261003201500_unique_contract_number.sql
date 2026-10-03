create unique index if not exists uq_neroxa_contracts_contract_number
on public.neroxa_contracts(contract_number)
where contract_number is not null and btrim(contract_number) <> '';
