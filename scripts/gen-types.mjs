#!/usr/bin/env node
// Lokal Postgres'dagi sxemadan Supabase formatidagi TypeScript turlarini generatsiya qiladi.
// Foydalanish: DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres npm run db:types
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const db = process.env.DATABASE_URL || process.env.TEST_DB || "replio_test";
const q = (sql) =>
  JSON.parse(execFileSync("psql", ["-d", db, "-At", "-c", sql], { encoding: "utf8" }).trim() || "null") ?? [];

const columns = q(`
  select json_agg(json_build_object(
    'table', c.table_name, 'name', c.column_name, 'udt', c.udt_name, 'data_type', c.data_type,
    'nullable', c.is_nullable = 'YES', 'has_default', c.column_default is not null or c.is_identity = 'YES',
    'generated', c.is_generated = 'ALWAYS' or c.identity_generation = 'ALWAYS'
  ) order by c.table_name, c.ordinal_position)
  from information_schema.columns c
  join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name
  where c.table_schema = 'public' and t.table_type = 'BASE TABLE'`);

const enums = q(`
  select json_agg(json_build_object('name', t.typname, 'values',
    (select json_agg(e.enumlabel order by e.enumsortorder) from pg_enum e where e.enumtypid = t.oid)))
  from pg_type t join pg_namespace n on n.oid = t.typnamespace
  where n.nspname = 'public' and t.typtype = 'e'`);

const functions = q(`
  select json_agg(json_build_object(
    'name', p.proname, 'set', p.proretset, 'returns', format_type(p.prorettype, null),
    'nargs', p.pronargs, 'ndefaults', p.pronargdefaults,
    'args', (select json_agg(json_build_object('name', p.proargnames[a.i], 'type', format_type(a.ty, null),
                                               'mode', coalesce(p.proargmodes[a.i]::text, 'i')) order by a.i)
             from unnest(coalesce(p.proallargtypes, p.proargtypes::oid[])) with ordinality a(ty, i))))
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prorettype <> 'trigger'::regtype
    and p.proname not in ('touch_updated_at', 'handle_new_user')`);

const fks = q(`
  select json_agg(json_build_object('table', cl.relname, 'name', con.conname,
    'columns', (select json_agg(a.attname order by k.i) from unnest(con.conkey) with ordinality k(n, i)
                join pg_attribute a on a.attrelid = con.conrelid and a.attnum = k.n),
    'ref', rcl.relname,
    'ref_columns', (select json_agg(a.attname order by k.i) from unnest(con.confkey) with ordinality k(n, i)
                join pg_attribute a on a.attrelid = con.confrelid and a.attnum = k.n),
    'one_to_one', exists (select 1 from pg_index ix where ix.indrelid = con.conrelid and ix.indisunique
                          and (ix.indkey::int2[])::int2[] @> con.conkey and (ix.indkey::int2[])::int2[] <@ con.conkey))
  order by cl.relname, con.conname)
  from pg_constraint con
  join pg_class cl on cl.oid = con.conrelid join pg_namespace n on n.oid = cl.relnamespace
  join pg_class rcl on rcl.oid = con.confrelid join pg_namespace rn on rn.oid = rcl.relnamespace
  where con.contype = 'f' and n.nspname = 'public' and rn.nspname = 'public'`);

const enumNames = new Set(enums.map((e) => e.name));
function tsType(udt) {
  const arr = udt.startsWith("_");
  const base = arr ? udt.slice(1) : udt;
  let t;
  if (enumNames.has(base)) t = `Database["public"]["Enums"]["${base}"]`;
  else if (["int2", "int4", "int8", "float4", "float8", "numeric"].includes(base)) t = "number";
  else if (["bool"].includes(base)) t = "boolean";
  else if (["json", "jsonb"].includes(base)) t = "Json";
  else if (base === "void") t = "undefined";
  else t = "string";
  return arr ? `${t}[]` : t;
}
const pgToUdt = (t) =>
  String(t).endsWith("[]") ? "_" + pgToUdt(String(t).slice(0, -2)) : ({
    uuid: "uuid",
    text: "text",
    integer: "int4",
    boolean: "bool",
    jsonb: "jsonb",
    bigint: "int8",
    "timestamp with time zone": "timestamptz",
    void: "void",
  })[t] ?? String(t).replace(/^public\./, "");

const tables = {};
for (const c of columns) (tables[c.table] ??= []).push(c);

let out = `// AVTOMATIK GENERATSIYA QILINGAN — qo'lda o'zgartirmang. (node scripts/gen-types.mjs)
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
`;
for (const [name, cols] of Object.entries(tables)) {
  const row = cols.map((c) => `          ${c.name}: ${tsType(c.udt)}${c.nullable ? " | null" : ""};`).join("\n");
  const ins = cols
    .filter((c) => !c.generated)
    .map((c) => `          ${c.name}${c.nullable || c.has_default ? "?" : ""}: ${tsType(c.udt)}${c.nullable ? " | null" : ""};`)
    .join("\n");
  const upd = cols
    .filter((c) => !c.generated)
    .map((c) => `          ${c.name}?: ${tsType(c.udt)}${c.nullable ? " | null" : ""};`)
    .join("\n");
  const rels = fks
    .filter((f) => f.table === name)
    .map(
      (f) =>
        `          {\n            foreignKeyName: ${JSON.stringify(f.name)};\n            columns: ${JSON.stringify(f.columns)};\n            isOneToOne: ${f.one_to_one};\n            referencedRelation: ${JSON.stringify(f.ref)};\n            referencedColumns: ${JSON.stringify(f.ref_columns)};\n          },`,
    )
    .join("\n");
  out += `      ${name}: {\n        Row: {\n${row}\n        };\n        Insert: {\n${ins}\n        };\n        Update: {\n${upd}\n        };\n        Relationships: [${rels ? "\n" + rels + "\n        " : ""}];\n      };\n`;
}
out += `    };\n    Views: { [_ in never]: never };\n    Functions: {\n`;
for (const f of functions) {
  const all = f.args ?? [];
  const inArgs = all.filter((a) => a.mode === "i" || a.mode === "b");
  const args = inArgs
    .map((a, idx) => `${a.name}${idx >= f.nargs - f.ndefaults ? "?" : ""}: ${tsType(pgToUdt(a.type))}`)
    .join("; ");
  const tableCols = all.filter((a) => a.mode === "t");
  const ret = tableCols.length
    ? `{ ${tableCols.map((c) => `${c.name}: ${tsType(pgToUdt(c.type))}`).join("; ")} }[]`
    : `${tsType(pgToUdt(f.returns))}${f.set ? "[]" : ""}`;
  out += `      ${f.name}: { Args: ${args ? `{ ${args} }` : "Record<PropertyKey, never>"}; Returns: ${ret} };\n`;
}
out += `    };\n    Enums: {\n`;
for (const e of enums) out += `      ${e.name}: ${e.values.map((v) => JSON.stringify(v)).join(" | ")};\n`;
out += `    };\n    CompositeTypes: { [_ in never]: never };\n  };\n};

type PublicSchema = Database["public"];
export type Tables<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Row"];
export type TablesInsert<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Insert"];
export type TablesUpdate<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Update"];
export type Enums<T extends keyof PublicSchema["Enums"]> = PublicSchema["Enums"][T];
`;
if (process.argv[2]) writeFileSync(process.argv[2], out);
else process.stdout.write(out);
