const express = require('express');
const cors = require('cors');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(express.static('public'));

// Clave secreta para JWT
const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_key_123';

// Configuración de CORS
app.use(cors({
  origin: function(origin, callback) {
    const allowedOrigins = [
      'http://localhost:3000',
      'http://localhost:3001',
      'https://recuerdos-app.vercel.app'
    ];
    
    // Permitir todas las URLs de preview de Vercel
    if (!origin || allowedOrigins.includes(origin) || (origin && origin.endsWith('.vercel.app'))) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

// Inicializar Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SUPABASE_BUCKET = process.env.SUPABASE_BUCKET || 'recuerdos';

// Configuración de multer
const upload = multer({
  storage: multer.memoryStorage()
});

// Verificar conexión con Supabase
const checkConnection = async () => {
  try {
    const { data, error } = await supabase.from('recuerdos').select('count').limit(1);
    if (error && error.code !== 'PGRST116') throw error;
    console.log('✅ Conectado a Supabase correctamente');
  } catch (err) {
    console.error('❌ Error al conectar con Supabase:', err.message);
  }
};

checkConnection();

// Obtener todos los recuerdos
app.get('/api/recuerdos', async (req, res) => {
  try {
    const { search, year, month, order } = req.query;
    
    let query = supabase.from('recuerdos').select('*');
    
    if (search) {
      query = query.ilike('titulo', `%${search}%`);
    }

    if (year) {
      query = query.gte('fecha', `${year}-01-01`).lte('fecha', `${year}-12-31`);
    }

    if (month && year) {
      const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
      const lastDay = new Date(year, month, 0).getDate();
      const endDate = `${year}-${String(month).padStart(2, '0')}-${lastDay}`;
      query = query.gte('fecha', startDate).lte('fecha', endDate);
    }

    if (order === 'antiguo') {
      query = query.order('fecha', { ascending: true });
    } else {
      query = query.order('fecha', { ascending: false });
    }

    const { data, error } = await query;
    
    if (error) {
      console.error('Error en query:', error);
      throw error;
    }
    
    res.json(data || []);
  } catch (error) {
    console.error('Error al obtener recuerdos:', error);
    res.status(500).json({ error: 'Error al obtener recuerdos' });
  }
});

// Obtener un recuerdo por ID
app.get('/api/recuerdos/:id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('recuerdos')
      .select('*')
      .eq('id', req.params.id)
      .single();
    
    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: 'Recuerdo no encontrado' });
      }
      throw error;
    }
    
    res.json(data);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al obtener recuerdo' });
  }
});

// Crear nuevo recuerdo
app.post('/api/recuerdos', upload.single('foto'), async (req, res) => {
  try {
    const { titulo, descripcion, fecha } = req.body;
    
    if (!req.file) {
      return res.status(400).json({ error: 'La foto es obligatoria' });
    }

    const file = req.file;
    const filePath = `recuerdos/${Date.now()}-${file.originalname}`;

    // Subir imagen a Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from(SUPABASE_BUCKET)
      .upload(filePath, file.buffer, {
        contentType: file.mimetype
      });

    if (uploadError) {
      console.error('Error al subir imagen:', uploadError);
      return res.status(500).json({ error: 'Error al subir imagen' });
    }

    // Obtener URL pública
    const { data: publicData } = supabase.storage
      .from(SUPABASE_BUCKET)
      .getPublicUrl(filePath);

    const publicUrl = publicData.publicUrl;

    // Insertar en base de datos
    const { data, error } = await supabase
      .from('recuerdos')
      .insert([{
        titulo,
        descripcion,
        fecha,
        url_foto: publicUrl,
        public_id: filePath,
        user_id: null
      }])
      .select()
      .single();

    if (error) {
      console.error('Error al insertar:', error);
      throw error;
    }

    res.status(201).json({
      ...data,
      message: 'Recuerdo creado exitosamente'
    });

  } catch (error) {
    console.error('🔥 ERROR:', error);
    res.status(500).json({ error: 'Error al crear recuerdo' });
  }
});

// Actualizar recuerdo
app.put('/api/recuerdos/:id', upload.single('foto'), async (req, res) => {
  try {
    const { titulo, descripcion, fecha } = req.body;
    const { id } = req.params;

    // Verificar que existe
    const { data: existing, error: fetchError } = await supabase
      .from('recuerdos')
      .select('*')
      .eq('id', id)
      .single();
    
    if (fetchError || !existing) {
      return res.status(404).json({ error: 'Recuerdo no encontrado' });
    }

    let updateData = { titulo, descripcion, fecha };

    // Si hay nueva imagen
    if (req.file) {
      // Eliminar imagen anterior
      await supabase.storage
        .from(SUPABASE_BUCKET)
        .remove([existing.public_id]);

      // Subir nueva imagen
      const file = req.file;
      const filePath = `recuerdos/${Date.now()}-${file.originalname}`;

      const { error: uploadError } = await supabase.storage
        .from(SUPABASE_BUCKET)
        .upload(filePath, file.buffer, {
          contentType: file.mimetype
        });

      if (uploadError) {
        return res.status(500).json({ error: 'Error al subir imagen' });
      }

      const { data: publicData } = supabase.storage
        .from(SUPABASE_BUCKET)
        .getPublicUrl(filePath);

      updateData.url_foto = publicData.publicUrl;
      updateData.public_id = filePath;
    }

    // Actualizar en base de datos
    const { data, error } = await supabase
      .from('recuerdos')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    res.json({ ...data, message: 'Recuerdo actualizado exitosamente' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al actualizar recuerdo' });
  }
});

// Eliminar recuerdo
app.delete('/api/recuerdos/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Obtener info del recuerdo para eliminar imagen
    const { data: recuerdo, error: fetchError } = await supabase
      .from('recuerdos')
      .select('public_id')
      .eq('id', id)
      .single();
    
    if (fetchError || !recuerdo) {
      return res.status(404).json({ error: 'Recuerdo no encontrado' });
    }
    
    // Eliminar imagen de storage
    await supabase.storage
      .from(SUPABASE_BUCKET)
      .remove([recuerdo.public_id]);

    // Eliminar de base de datos
    const { error } = await supabase
      .from('recuerdos')
      .delete()
      .eq('id', id);
    
    if (error) throw error;
    
    res.json({ message: 'Recuerdo eliminado exitosamente' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al eliminar recuerdo' });
  }
});

// Iniciar servidor
const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
});