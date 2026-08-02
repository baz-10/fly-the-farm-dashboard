import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';

const directory=resolve(dirname(fileURLToPath(import.meta.url)),'../supabase/migrations');
const db=new PGlite();
try{
 await db.exec(`create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select null::uuid$$;create role anon;create role authenticated;create role service_role;`);
 for(const name of (await readdir(directory)).filter(name=>name.endsWith('.sql')).sort())await db.exec(await readFile(resolve(directory,name),'utf8'));
 const delta=await db.query(`select public.ftf_calculate_delta_t(30,40) value`);
 if(Number(delta.rows[0].value)!==9.6)throw new Error(`unexpected Delta T ${delta.rows[0].value}`);
 const fresh=await db.query(`select public.ftf_weather_freshness('2026-08-02T10:00:00Z','2026-08-02T10:20:00Z',30,10) state`);
 if(fresh.rows[0].state!=='APPROACHING_EXPIRY')throw new Error('approaching-expiry weather was not identified');
}finally{await db.close();}
