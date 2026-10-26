-- Only post-checkpoint catalog mutation permitted by this driver.
REVOKE EXECUTE ON FUNCTION public.calculate_public_order_line_price(uuid,uuid,uuid,text,text,jsonb,jsonb) FROM PUBLIC;
