// Supabase 客户端(懒加载,单例)。缺少 env → 联网关闭,App 回退到本地 god-view。
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const URL = import.meta.env.VITE_SUPABASE_URL;
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY;

// 联网是否可用(两个 env 都在)。
export function isNetworkEnabled(): boolean {
  return Boolean(URL && ANON);
}

let client: SupabaseClient | null = null;

export function getClient(): SupabaseClient {
  if (!URL || !ANON) throw new Error('Supabase env missing (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY)');
  if (!client) client = createClient(URL, ANON, { realtime: { params: { eventsPerSecond: 5 } } });
  return client;
}
