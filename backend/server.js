const express = require('express');
const cors = require('cors');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const mysql = require('mysql2/promise');
require('dotenv').config();

const app = express();

// AGREGAR ESTA LÍNEA:
app.use(express.static('public'));

// Middlewares
app.use(cors());
app.use(express.json());

// Configurar Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Configurar almacenamiento en Cloudinary
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'recuerdos',
    allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
    transformation: [{ width: 1500, height: 1500, crop: 'limit' }]
  }
});

const upload = multer({ storage: storage });

// Conexión a MySQL
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10
});

// RUTAS DE LA API

// Obtener todos los recuerdos
app.get('/api/recuerdos', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM recuerdos ORDER BY fecha DESC');
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al obtener recuerdos' });
  }
});

// Obtener un recuerdo por ID
app.get('/api/recuerdos/:id', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM recuerdos WHERE id = ?', [req.params.id]);
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

    const [result] = await pool.query(
      'INSERT INTO recuerdos (titulo, descripcion, fecha, url_foto, public_id) VALUES (?, ?, ?, ?, ?)',
      [titulo, descripcion, fecha, req.file.path, req.file.filename]
    );

    res.status(201).json({
      id: result.insertId,
      titulo,
      descripcion,
      fecha,
      url_foto: req.file.path,
      message: 'Recuerdo creado exitosamente'
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al crear recuerdo' });
  }
});

// Actualizar recuerdo
app.put('/api/recuerdos/:id', upload.single('foto'), async (req, res) => {
  try {
    const { titulo, descripcion, fecha } = req.body;
    const { id } = req.params;

    // Verificar si existe
    const [existing] = await pool.query('SELECT * FROM recuerdos WHERE id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ error: 'Recuerdo no encontrado' });
    }

    let updateQuery, params;

    if (req.file) {
      // Si hay nueva foto, eliminar la anterior de Cloudinary
      await cloudinary.uploader.destroy(existing[0].public_id);
      
      updateQuery = 'UPDATE recuerdos SET titulo = ?, descripcion = ?, fecha = ?, url_foto = ?, public_id = ? WHERE id = ?';
      params = [titulo, descripcion, fecha, req.file.path, req.file.filename, id];
    } else {
      updateQuery = 'UPDATE recuerdos SET titulo = ?, descripcion = ?, fecha = ? WHERE id = ?';
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

    // Obtener el public_id para eliminar de Cloudinary
    const [rows] = await pool.query('SELECT public_id FROM recuerdos WHERE id = ?', [id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Recuerdo no encontrado' });
    }

    // Eliminar de Cloudinary
    await cloudinary.uploader.destroy(rows[0].public_id);

    // Eliminar de la base de datos
    await pool.query('DELETE FROM recuerdos WHERE id = ?', [id]);
    
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