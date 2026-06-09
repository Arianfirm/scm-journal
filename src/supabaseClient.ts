import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://naqkwputuivuahnkakrw.supabase.co';
const supabaseKey = 'sb_publishable_zVDTGYHM9Hi0VYmOcQGKig_cZOgUgwN';

export const supabase = createClient(supabaseUrl, supabaseKey);
