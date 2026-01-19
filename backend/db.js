const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

// Helper para ejecutar queries
const query = async (text, params = []) => {
  try {
    // Usar Supabase para queries SQL directas
    const { data, error } = await supabase.rpc('exec_sql', {
      query_text: text,
      query_params: params
    });
    
    if (error) throw error;
    return { rows: data };
  } catch (err) {
    // Si no tienes la función RPC, usar tablas directamente
    console.error('Query error:', err);
    throw err;
  }
};

// Funciones específicas para recuerdos
const db = {
  // Obtener todos los recuerdos con filtros
  async getRecuerdos(filters = {}) {
    let query = supabase.from('recuerdos').select('*');
    
    if (filters.search) {
      query = query.ilike('titulo', `%${filters.search}%`);
    }
    
    if (filters.year) {
      query = query.gte('fecha', `${filters.year}-01-01`)
                   .lte('fecha', `${filters.year}-12-31`);
    }
    
    if (filters.month && filters.year) {
      const startDate = `${filters.year}-${String(filters.month).padStart(2, '0')}-01`;
      const endDate = new Date(filters.year, filters.month, 0);
      query = query.gte('fecha', startDate)
                   .lte('fecha', endDate.toISOString().split('T')[0]);
    }
    
    query = query.order('fecha', { ascending: filters.order === 'antiguo' });
    
    const { data, error } = await query;
    if (error) throw error;
    return data;
  },

  // Obtener un recuerdo por ID
  async getRecuerdoById(id) {
    const { data, error } = await supabase
      .from('recuerdos')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error) throw error;
    return data;
  },

  // Crear recuerdo
  async createRecuerdo(recuerdo) {
    const { data, error } = await supabase
      .from('recuerdos')
      .insert([recuerdo])
      .select()
      .single();
    
    if (error) throw error;
    return data;
  },

  // Actualizar recuerdo
  async updateRecuerdo(id, updates) {
    const { data, error } = await supabase
      .from('recuerdos')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  },

  // Eliminar recuerdo
  async deleteRecuerdo(id) {
    const { error } = await supabase
      .from('recuerdos')
      .delete()
      .eq('id', id);
    
    if (error) throw error;
    return true;
  },

  // Inicializar tablas (si es necesario)
  async initTables() {
    // Las tablas ya están creadas en Supabase
    console.log('✅ Usando tablas de Supabase');
  }
};

module.exports = { supabase, db };