/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

interface WindowEventMap {
  'dailypep:update-ready': CustomEvent<{ update: () => Promise<void> }>;
  'dailypep:offline-ready': CustomEvent<void>;
}
