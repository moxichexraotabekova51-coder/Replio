-- Replio — SECURITY DEFINER funksiyalarni anon (tizimga kirmagan) foydalanuvchilardan yopish.
-- RLS yordamchilari authenticated uchun qoladi (siyosatlar chaqiruvchi nomidan bajariladi).

revoke execute on function
  public.account_role(uuid), public.is_member(uuid), public.can_view_automation(uuid),
  public.can_edit(uuid), public.can_chat(uuid), public.is_admin(uuid),
  public.contact_account(uuid), public.flow_account(uuid), public.sequence_account(uuid),
  public.create_account(text, text), public.account_member_emails(uuid)
from public, anon;

-- Trigger funksiyasi — to'g'ridan-to'g'ri RPC orqali chaqirilmasligi kerak
revoke execute on function public.handle_new_user() from public, anon, authenticated;
