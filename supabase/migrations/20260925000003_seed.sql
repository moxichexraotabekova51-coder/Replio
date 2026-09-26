-- Replio — boshlang'ich ma'lumotlar: tariflar va shablonlar

insert into public.plans (id, name, price_monthly, price_yearly, contact_limit, bot_limit, seat_limit, features, sort_order)
values
  ('start', 'Start', 89000, 854000, 250, 1, 2,
   '{"external_request": false, "api": false, "webhook_trigger": false, "live_chat_assign": false,
     "data_collection": false, "growth_stats": "basic"}'::jsonb, 1),
  ('pro', 'Pro', 179000, 1718000, 2500, 3, 3,
   '{"external_request": true, "api": true, "webhook_trigger": true, "live_chat_assign": true,
     "data_collection": true, "growth_stats": "full"}'::jsonb, 2)
on conflict (id) do update set
  name = excluded.name, price_monthly = excluded.price_monthly, price_yearly = excluded.price_yearly,
  contact_limit = excluded.contact_limit, bot_limit = excluded.bot_limit, seat_limit = excluded.seat_limit,
  features = excluded.features, sort_order = excluded.sort_order;

-- Shablon formati: { "triggers": [{type, config}], "draft": {nodes, edges} }
insert into public.templates (name, description, category, icon, sort_order, flow_json) values
(
  'Xush kelibsiz xabari',
  '/start bosgan har bir yangi obunachini kutib oling',
  'welcome', 'hand', 1,
  '{
    "triggers": [{"type": "welcome", "config": {}}],
    "draft": {
      "nodes": [
        {"id": "trigger", "type": "trigger", "position": {"x": 0, "y": 0}, "data": {}},
        {"id": "m1", "type": "message", "position": {"x": 700, "y": 0}, "data": {
          "name": "Send Message",
          "blocks": [{"id": "b1", "type": "text", "text": "Salom, {{first_name}}! 👋 Botimizga xush kelibsiz.", "buttons": []}]
        }}
      ],
      "edges": [{"id": "e1", "source": "trigger", "sourceHandle": "then", "target": "m1"}]
    }
  }'::jsonb
),
(
  'Kalit so''zga javob',
  '"narx" deb yozganlarga avtomatik javob bering',
  'keyword', 'message-square', 2,
  '{
    "triggers": [{"type": "keyword", "config": {"match": "contains", "keywords": ["narx"]}}],
    "draft": {
      "nodes": [
        {"id": "trigger", "type": "trigger", "position": {"x": 0, "y": 0}, "data": {}},
        {"id": "m1", "type": "message", "position": {"x": 700, "y": 0}, "data": {
          "name": "Send Message",
          "blocks": [{"id": "b1", "type": "text", "text": "Narxlarimiz bilan tanishing 👇", "buttons": []}]
        }}
      ],
      "edges": [{"id": "e1", "source": "trigger", "sourceHandle": "then", "target": "m1"}]
    }
  }'::jsonb
),
(
  'Telefon raqamini yig''ish',
  'Kontakt so''rash tugmasi bilan lid yig''ing',
  'leads', 'phone', 3,
  '{
    "triggers": [{"type": "keyword", "config": {"match": "contains", "keywords": ["buyurtma"]}}],
    "draft": {
      "nodes": [
        {"id": "trigger", "type": "trigger", "position": {"x": 0, "y": 0}, "data": {}},
        {"id": "m1", "type": "message", "position": {"x": 700, "y": 0}, "data": {
          "name": "Send Message",
          "blocks": [
            {"id": "b1", "type": "text", "text": "Buyurtma berish uchun telefon raqamingizni yuboring.", "buttons": []},
            {"id": "b2", "type": "request_contact", "text": "📞 Raqamni yuborish"}
          ]
        }}
      ],
      "edges": [{"id": "e1", "source": "trigger", "sourceHandle": "then", "target": "m1"}]
    }
  }'::jsonb
),
(
  '/menu buyrug''i',
  'Asosiy menyuni tugmalar bilan ko''rsating',
  'menu', 'menu', 4,
  '{
    "triggers": [{"type": "command", "config": {"command": "menu"}}],
    "draft": {
      "nodes": [
        {"id": "trigger", "type": "trigger", "position": {"x": 0, "y": 0}, "data": {}},
        {"id": "m1", "type": "message", "position": {"x": 700, "y": 0}, "data": {
          "name": "Send Message",
          "blocks": [{"id": "b1", "type": "text", "text": "Asosiy menyu:", "buttons": [
            {"id": "btn1", "title": "Mahsulotlar", "kind": "step", "target": null},
            {"id": "btn2", "title": "Bog''lanish", "kind": "step", "target": null}
          ]}]
        }}
      ],
      "edges": [{"id": "e1", "source": "trigger", "sourceHandle": "then", "target": "m1"}]
    }
  }'::jsonb
),
(
  'Chegirma kodi',
  '"chegirma" so''ziga promo-kod yuboring va teg qo''ying',
  'promo', 'gift', 5,
  '{
    "triggers": [{"type": "keyword", "config": {"match": "contains", "keywords": ["chegirma", "promo"]}}],
    "draft": {
      "nodes": [
        {"id": "trigger", "type": "trigger", "position": {"x": 0, "y": 0}, "data": {}},
        {"id": "m1", "type": "message", "position": {"x": 700, "y": 0}, "data": {
          "name": "Send Message",
          "blocks": [{"id": "b1", "type": "text", "text": "Sizning chegirma kodingiz: REPLIO10 🎁", "buttons": []}]
        }}
      ],
      "edges": [{"id": "e1", "source": "trigger", "sourceHandle": "then", "target": "m1"}]
    }
  }'::jsonb
);
