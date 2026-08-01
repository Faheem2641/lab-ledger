import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://tetyytemppcdnjjjjsrl.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_7umEbloP8w7d4t_cyCgk8Q_WxBUkdM0';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
