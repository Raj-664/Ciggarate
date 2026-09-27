/* Supabase storage layer for Cig Diary */
(function () {
  'use strict';

  const STORES = {
    brands: 'brands',
    cigarettes: 'cigarettes',
    packs: 'packs'
  };

  function client() {
    if (!window.supabaseClient) {
      throw new Error('Supabase client is not available.');
    }

    return window.supabaseClient;
  }

  function checkError(result) {
    if (result.error) {
      console.error('Supabase error:', result.error);
      throw result.error;
    }

    return result.data;
  }

  const DB = {
    STORES,

    uid() {
      return Date.now().toString(36) + '-' +
        Math.random().toString(36).slice(2, 9);
    },

    async all(store) {
      const result = await client()
        .from(store)
        .select('*');

      return checkError(result) || [];
    },

    async get(store, id) {
      const result = await client()
        .from(store)
        .select('*')
        .eq('id', id)
        .maybeSingle();

      return checkError(result);
    },

    async put(store, value) {
      const result = await client()
        .from(store)
        .upsert(value, { onConflict: 'id' })
        .select()
        .single();

      return checkError(result);
    },

    async remove(store, id) {
      const result = await client()
        .from(store)
        .delete()
        .eq('id', id);

      checkError(result);
      return true;
    },

    async clear(store) {
      const result = await client()
        .from(store)
        .delete()
        .neq('id', '');

      checkError(result);
      return true;
    },

    async bulkPut(store, values) {
      if (!Array.isArray(values) || values.length === 0) {
        return;
      }

      const result = await client()
        .from(store)
        .upsert(values, { onConflict: 'id' });

      checkError(result);
    }
  };

  window.DB = DB;
})();