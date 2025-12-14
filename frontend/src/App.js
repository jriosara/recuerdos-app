import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './App.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

function App() {
  const [recuerdos, setRecuerdos] = useState([]);
  const [formulario, setFormulario] = useState({
    titulo: '',
    descripcion: '',
    fecha: new Date().toISOString().split('T')[0],
    foto: null
  });
  const [editando, setEditando] = useState(null);
  const [vistaDetalle, setVistaDetalle] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [previewImagen, setPreviewImagen] = useState(null);
  const [temaOscuro, setTemaOscuro] = useState(false);
  const [mostrarFormulario, setMostrarFormulario] = useState(false);

  useEffect(() => {
    cargarRecuerdos();
    // Cargar preferencia de tema
    const temaGuardado = localStorage.getItem('temaOscuro');
    if (temaGuardado) {
      setTemaOscuro(JSON.parse(temaGuardado));
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('temaOscuro', JSON.stringify(temaOscuro));
    document.body.className = temaOscuro ? 'tema-oscuro' : 'tema-claro';
  }, [temaOscuro]);

  const cargarRecuerdos = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/recuerdos`);
      setRecuerdos(response.data);
    } catch (error) {
      console.error('Error al cargar recuerdos:', error);
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setFormulario({ ...formulario, foto: file });
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreviewImagen(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setCargando(true);

    const formData = new FormData();
    formData.append('titulo', formulario.titulo);
    formData.append('descripcion', formulario.descripcion);
    formData.append('fecha', formulario.fecha);
    if (formulario.foto) {
      formData.append('foto', formulario.foto);
    }

    try {
      if (editando) {
        await axios.put(`${API_URL}/api/recuerdos/${editando}`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
      } else {
        await axios.post(`${API_URL}/api/recuerdos`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
      }

      setFormulario({
        titulo: '',
        descripcion: '',
        fecha: new Date().toISOString().split('T')[0],
        foto: null
      });
      setPreviewImagen(null);
      setEditando(null);
      setMostrarFormulario(false);
      cargarRecuerdos();
    } catch (error) {
      console.error('Error al guardar:', error);
      alert('Error al guardar el recuerdo');
    } finally {
      setCargando(false);
    }
  };

  const eliminarRecuerdo = async (id) => {
    if (!window.confirm('¿Eliminar este recuerdo?')) return;

    try {
      await axios.delete(`${API_URL}/api/recuerdos/${id}`);
      cargarRecuerdos();
    } catch (error) {
      alert('Error al eliminar recuerdo');
    }
  };

  const editarRecuerdo = (recuerdo) => {
    setFormulario({
      titulo: recuerdo.titulo,
      descripcion: recuerdo.descripcion,
      fecha: recuerdo.fecha.split('T')[0],
      foto: null
    });
    setPreviewImagen(recuerdo.url_foto);
    setEditando(recuerdo.id);
    setMostrarFormulario(true);
  };

  const cancelarEdicion = () => {
    setFormulario({
      titulo: '',
      descripcion: '',
      fecha: new Date().toISOString().split('T')[0],
      foto: null
    });
    setPreviewImagen(null);
    setEditando(null);
    setMostrarFormulario(false);
  };

  return (
    <div className={`app ${temaOscuro ? 'dark' : 'light'}`}>
      {/* Header */}
      <header className="header">
        <div className="header-content">
          <div className="header-left">
            <h1>✨ Recuerdos</h1>
            <p className="subtitle">Tus momentos especiales</p>
          </div>
          
          <div className="header-right">
            <button 
              className="btn-nuevo"
              onClick={() => setMostrarFormulario(!mostrarFormulario)}
            >
              {mostrarFormulario ? '✕ Cerrar' : '+ Nuevo Recuerdo'}
            </button>
            
            <button 
              className="btn-tema"
              onClick={() => setTemaOscuro(!temaOscuro)}
              title={temaOscuro ? 'Modo claro' : 'Modo oscuro'}
            >
              {temaOscuro ? '☀️' : '🌙'}
            </button>
          </div>
        </div>
      </header>

      {/* Formulario (modal overlay) */}
      {mostrarFormulario && (
        <div className="formulario-overlay" onClick={cancelarEdicion}>
          <div className="formulario-modal" onClick={(e) => e.stopPropagation()}>
            <button className="btn-close" onClick={cancelarEdicion}>✕</button>
            
            <h2>{editando ? 'Editar Recuerdo' : 'Nuevo Recuerdo'}</h2>

            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Título</label>
                <input
                  type="text"
                  placeholder="Nombre del recuerdo..."
                  value={formulario.titulo}
                  onChange={(e) => setFormulario({ ...formulario, titulo: e.target.value })}
                  required
                />
              </div>

              <div className="form-group">
                <label>Descripción</label>
                <textarea
                  placeholder="Describe este momento especial..."
                  value={formulario.descripcion}
                  onChange={(e) => setFormulario({ ...formulario, descripcion: e.target.value })}
                  rows="4"
                />
              </div>

              <div className="form-group">
                <label>Fecha</label>
                <input
                  type="date"
                  value={formulario.fecha}
                  onChange={(e) => setFormulario({ ...formulario, fecha: e.target.value })}
                  required
                />
              </div>

              <div className="form-group">
                <label>Foto</label>
                <div className="file-input-wrapper">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    required={!editando}
                    id="file-input"
                  />
                  <label htmlFor="file-input" className="file-label">
                    📷 {formulario.foto ? formulario.foto.name : 'Seleccionar imagen'}
                  </label>
                </div>
                
                {previewImagen && (
                  <div className="preview-imagen">
                    <img src={previewImagen} alt="Preview" />
                  </div>
                )}
              </div>

              <div className="form-actions">
                <button type="submit" className="btn-guardar" disabled={cargando}>
                  {cargando ? 'Guardando...' : (editando ? 'Actualizar' : 'Guardar')}
                </button>
                <button type="button" className="btn-cancelar" onClick={cancelarEdicion}>
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Galería estilo Pinterest */}
      <main className="main-content">
        <div className="galeria-header">
          <h2>Mis Recuerdos</h2>
          <span className="contador">{recuerdos.length} {recuerdos.length === 1 ? 'recuerdo' : 'recuerdos'}</span>
        </div>

        {recuerdos.length === 0 ? (
          <div className="empty-state">
            <span className="empty-icon">📸</span>
            <p>Aún no tienes recuerdos guardados</p>
            <button className="btn-primary" onClick={() => setMostrarFormulario(true)}>
              Crear tu primer recuerdo
            </button>
          </div>
        ) : (
          <div className="masonry-grid">
            {recuerdos.map((recuerdo) => (
              <div key={recuerdo.id} className="masonry-item">
                <div className="card">
                  <div className="card-image" onClick={() => setVistaDetalle(recuerdo)}>
                    <img src={recuerdo.url_foto} alt={recuerdo.titulo} />
                    <div className="card-overlay">
                      <span className="zoom-icon">🔍</span>
                    </div>
                  </div>
                  
                  <div className="card-content">
                    <h3 className="card-titulo">{recuerdo.titulo}</h3>
                    <p className="card-fecha">
                      {new Date(recuerdo.fecha).toLocaleDateString('es-ES', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                      })}
                    </p>
                    {recuerdo.descripcion && (
                      <p className="card-descripcion">{recuerdo.descripcion}</p>
                    )}
                    
                    <div className="card-actions">
                      <button 
                        className="btn-icon btn-editar" 
                        onClick={() => editarRecuerdo(recuerdo)}
                        title="Editar"
                      >
                        ✏️
                      </button>
                      <button 
                        className="btn-icon btn-eliminar" 
                        onClick={() => eliminarRecuerdo(recuerdo.id)}
                        title="Eliminar"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Modal detalle (lightbox) */}
      {vistaDetalle && (
        <div className="lightbox" onClick={() => setVistaDetalle(null)}>
          <button className="lightbox-close" onClick={() => setVistaDetalle(null)}>
            ✕
          </button>
          
          <div className="lightbox-content" onClick={(e) => e.stopPropagation()}>
            <img 
              src={vistaDetalle.url_foto} 
              alt={vistaDetalle.titulo}
              className="lightbox-image"
            />
            
            <div className="lightbox-info">
              <h2>{vistaDetalle.titulo}</h2>
              <p className="lightbox-fecha">
                {new Date(vistaDetalle.fecha).toLocaleDateString('es-ES', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric'
                })}
              </p>
              {vistaDetalle.descripcion && (
                <p className="lightbox-descripcion">{vistaDetalle.descripcion}</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;