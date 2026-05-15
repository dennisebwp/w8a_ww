import { createClient } from '@supabase/supabase-js'

export function createBrowserSupabaseClient(supabaseUrl, supabasePublishableKey) {
  if (!supabaseUrl || !supabasePublishableKey) {
    return null
  }

  return createClient(supabaseUrl, supabasePublishableKey)
}
