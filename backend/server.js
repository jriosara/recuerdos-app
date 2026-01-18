const express = require('express');
const cors = require('cors');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const { createClient } = require('@supabase/supabase-js');
const { parse } = require('pg-connection-string'); // ← AGREGAR ESTA LÍNEA
const dns = require('dns'); // ← Y ESTA
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(express.static('public'));

// Clave secreta para JWT (debería estar en .env, pero usaremos un default para dev)
const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_key_123';

// Configuración de CORS
app.use(cors({
  origin: [
    'http://localhost:3000',
    'http://localhost:3001',
    'https://recuerdos-app.vercel.app',
    'https://recuerdos-8c3p41f2l-alexs-projects-4ce180e5.vercel.app'
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Parsear la URL de conexión
const config = parse(process.env.DATABASE_URL);

const pool = new Pool({
  host: config.host,
  port: config.port,
  database: config.database,
  user: config.user,
  password: config.password,
  ssl: {
    rejectUnauthorized: false
  },
  // IMPORTANTE: Forzar IPv4
  ...(config.host && { 
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 30000,
    max: 20,
    // Esta es la clave para forzar IPv4
    options: '-c search_path=public'
  })
});

// Forzar IPv4 a nivel de DNS
dns.setDefaultResultOrder('ipv4first');
const initDB = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id serial PRIMARY KEY,
        username varchar(50) NOT NULL UNIQUE,
        password varchar(255) NOT NULL,
        created_at timestamptz DEFAULT now()
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS recuerdos (
        id serial PRIMARY KEY,
        user_id integer REFERENCES users(id) ON DELETE CASCADE,
        titulo varchar(255) NOT NULL,
        descripcion text,
        fecha date NOT NULL,
        url_foto varchar(500) NOT NULL,
        public_id varchar(255) NOT NULL,
        created_at timestamptz DEFAULT now(),
        updated_at timestamptz DEFAULT now()
      )
    `);
  } catch (err) {
    console.error('Error al inicializar DB:', err);
  }
};

// 🐛 LOGS TEMPORALES PARA DEBUGGEAR
console.log('🔍 SUPABASE_URL:', process.env.SUPABASE_URL);
console.log('🔍 SUPABASE_SERVICE_ROLE_KEY existe:', !!process.env.SUPABASE_SERVICE_ROLE_KEY);
console.log('🔍 SUPABASE_BUCKET:', process.env.SUPABASE_BUCKET);
initDB();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SUPABASE_BUCKET = process.env.SUPABASE_BUCKET || 'recuerdos';

const upload = multer({
  storage: multer.memoryStorage()
});

// Obtener todos los recuerdos
app.get('/api/recuerdos', async (req, res) => {
  try {
    const { search, year, month, order } = req.query;
    
    let query = 'SELECT * FROM recuerdos WHERE 1=1';
    const params = [];
    let index = 1;
    
    if (search) {
      query += ` AND titulo ILIKE $${index}`;
      params.push(`%${search}%`);
      index++;
    }

    if (year) {
      query += ` AND EXTRACT(YEAR FROM fecha) = $${index}`;
      params.push(year);
      index++;
    }

    if (month) {
      query += ` AND EXTRACT(MONTH FROM fecha) = $${index}`;
      params.push(month);
      index++;
    }

    if (order === 'antiguo') {
      query += ' ORDER BY fecha ASC';
    } else {
      query += ' ORDER BY fecha DESC';
    }

    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al obtener recuerdos' });
  }
});

// Obtener un recuerdo por ID
app.get('/api/recuerdos/:id', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM recuerdos WHERE id = $1', [req.params.id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Recuerdo no encontrado' });
    }
    res.json(rows[0]);
  } catch (error) {
    console.error(error);
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

    const publicUrl = publicData.publicUrl;

    const result = await pool.query(
      'INSERT INTO recuerdos (titulo, descripcion, fecha, url_foto, public_id, user_id) VALUES ($1, $2, $3, $4, $5, NULL) RETURNING id',
      [
        titulo,
        descripcion,
        fecha,
        publicUrl,
        filePath
      ]
    );

    res.status(201).json({
      id: result.rows[0].id,
      titulo,
      descripcion,
      fecha,
      url_foto: publicUrl,
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

    const { rows: existing } = await pool.query('SELECT * FROM recuerdos WHERE id = $1', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ error: 'Recuerdo no encontrado o no autorizado' });
    }

    let updateQuery, params;

    if (req.file) {
      await supabase.storage
        .from(SUPABASE_BUCKET)
        .remove([existing[0].public_id]);

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

      const publicUrl = publicData.publicUrl;

      updateQuery = 'UPDATE recuerdos SET titulo = $1, descripcion = $2, fecha = $3, url_foto = $4, public_id = $5 WHERE id = $6';
      params = [titulo, descripcion, fecha, publicUrl, filePath, id];
    } else {
      updateQuery = 'UPDATE recuerdos SET titulo = $1, descripcion = $2, fecha = $3 WHERE id = $4';
      params = [titulo, descripcion, fecha, id];
    }

    await pool.query(updateQuery, params);
    res.json({ message: 'Recuerdo actualizado exitosamente' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al actualizar recuerdo' });
  }
});

// Eliminar recuerdo
app.delete('/api/recuerdos/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query('SELECT public_id FROM recuerdos WHERE id = $1', [id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Recuerdo no encontrado o no autorizado' });
    }
    
    await supabase.storage
      .from(SUPABASE_BUCKET)
      .remove([rows[0].public_id]);

    await pool.query('DELETE FROM recuerdos WHERE id = $1', [id]);
    
    res.json({ message: 'Recuerdo eliminado exitosamente' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al eliminar recuerdo' });
  }
});

// Iniciar servidor
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
});
