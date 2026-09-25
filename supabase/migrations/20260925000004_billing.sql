-- Replio — to'lovni faollashtirish (idempotent). Faqat service_role chaqiradi.

create or replace function public.activate_payment(p_payment_id uuid, p_raw jsonb default null)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  v_pay public.payments;
  v_sub public.subscriptions;
  v_base timestamptz;
  v_step interval;
begin
  -- Faqat birinchi marta: status 'paid' bo'lmagan to'lovni qulflab yangilaymiz
  update public.payments
     set status = 'paid', paid_at = now(), raw = coalesce(p_raw, raw)
   where id = p_payment_id and status <> 'paid'
  returning * into v_pay;

  if not found then
    return false;  -- allaqachon faollashtirilgan yoki topilmadi
  end if;

  v_step := case v_pay.billing_period when 'yearly' then interval '1 year' else interval '1 month' end;

  select * into v_sub from public.subscriptions where account_id = v_pay.account_id for update;

  -- Xuddi shu tarif hali amal qilayotgan bo'lsa — muddat oxiridan uzaytiramiz
  if found and v_sub.status in ('active', 'past_due') and v_sub.plan_id = v_pay.plan_id and v_sub.current_period_end > now() then
    v_base := v_sub.current_period_end;
  else
    v_base := now();
  end if;

  insert into public.subscriptions (account_id, plan_id, billing_period, status, current_period_end, updated_at)
  values (v_pay.account_id, v_pay.plan_id, v_pay.billing_period, 'active', v_base + v_step, now())
  on conflict (account_id) do update set
    plan_id = excluded.plan_id,
    billing_period = excluded.billing_period,
    status = 'active',
    current_period_end = excluded.current_period_end,
    updated_at = now();

  update public.accounts set plan_id = v_pay.plan_id where id = v_pay.account_id;

  return true;
end $$;

revoke execute on function public.activate_payment(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.activate_payment(uuid, jsonb) to service_role;
