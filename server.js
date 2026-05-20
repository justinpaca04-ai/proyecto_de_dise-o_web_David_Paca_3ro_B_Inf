require('dotenv').config();
const express  = require('express');
const mysql    = require('mysql2/promise');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const cors     = require('cors');
const path     = require('path');

const app        = express();
const PORT       = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'hcpt_secreto_2024';

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const pool = mysql.createPool({
  host    : process.env.DB_HOST,
  user    : process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit   : 10
});

function verificarToken(req, res, next) {
  const auth = req.headers['authorization'];
  if (!auth) return res.status(401).json({ error: 'Token requerido' });
  const token = auth.split(' ')[1];
  try {
    req.usuario = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(403).json({ error: 'Token inválido' });
  }
}

app.post('/api/login', async (req, res) => {
  const { cedula, contrasena } = req.body;
  if (!cedula || !contrasena)
    return res.status(400).json({ error: 'Cédula y contraseña requeridas' });
  try {
    const [rows] = await pool.query(
      'SELECT * FROM usuarios WHERE cedula = ? AND activo = 1', [cedula]
    );
    if (rows.length === 0)
      return res.status(401).json({ error: 'Credenciales incorrectas' });
    const valido = await bcrypt.compare(contrasena, rows[0].contrasena);
    if (!valido)
      return res.status(401).json({ error: 'Credenciales incorrectas' });
    const token = jwt.sign(
      { cedula: rows[0].cedula, nombre: rows[0].nombre, rol: rows[0].rol },
      JWT_SECRET, { expiresIn: '8h' }
    );
    res.json({ token, nombre: rows[0].nombre, rol: rows[0].rol });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/equipos', verificarToken, async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT e.*, u.nombre AS nombre_responsable
      FROM equipos_baja e
      JOIN usuarios u ON u.cedula = e.cedula_responsable
      ORDER BY e.registrado_en DESC
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/equipos', verificarToken, async (req, res) => {
  const { codigo_inventario, tipo_equipo, marca, modelo, serie,
          descripcion_dano, diagnostico_tecnico, fecha_baja, observaciones } = req.body;
  if (!codigo_inventario || !tipo_equipo || !marca || !modelo ||
      !serie || !descripcion_dano || !diagnostico_tecnico || !fecha_baja)
    return res.status(400).json({ error: 'Faltan campos obligatorios' });
  try {
    await pool.query(
      `INSERT INTO equipos_baja
        (codigo_inventario, tipo_equipo, marca, modelo, serie,
         descripcion_dano, diagnostico_tecnico, fecha_baja,
         cedula_responsable, observaciones)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [codigo_inventario, tipo_equipo, marca, modelo, serie,
       descripcion_dano, diagnostico_tecnico, fecha_baja,
       req.usuario.cedula, observaciones || null]
    );
    res.status(201).json({ mensaje: 'Equipo registrado correctamente' });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY')
      return res.status(409).json({ error: 'El código de inventario ya existe' });
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/equipos/:codigo', verificarToken, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT e.*, u.nombre AS nombre_responsable
       FROM equipos_baja e
       JOIN usuarios u ON u.cedula = e.cedula_responsable
       WHERE e.codigo_inventario = ?`,
      [req.params.codigo]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'No encontrado' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.patch('/api/equipos/:codigo/estado', verificarToken, async (req, res) => {
  if (req.usuario.rol !== 'admin')
    return res.status(403).json({ error: 'Sin permisos' });

  const { estado_nuevo, motivo } = req.body;
  const estadosValidos = ['en_revision','aprobado','rechazado','dado_de_baja'];
  if (!estadosValidos.includes(estado_nuevo))
    return res.status(400).json({ error: 'Estado no válido' });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query(
      'SELECT estado_proceso FROM equipos_baja WHERE codigo_inventario = ?',
      [req.params.codigo]
    );
    if (rows.length === 0) {
      await conn.rollback();
      return res.status(404).json({ error: 'No encontrado' });
    }
    const anterior = rows[0].estado_proceso;
    await conn.query(
      'UPDATE equipos_baja SET estado_proceso = ? WHERE codigo_inventario = ?',
      [estado_nuevo, req.params.codigo]
    );
    await conn.query(
      `INSERT INTO historial_estados
        (codigo_inventario, estado_anterior, estado_nuevo, cedula_tecnico, motivo)
       VALUES (?,?,?,?,?)`,
      [req.params.codigo, anterior, estado_nuevo, req.usuario.cedula, motivo || null]
    );
    await conn.commit();
    res.json({ mensaje: 'Estado actualizado' });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
});

app.post('/api/usuarios', verificarToken, async (req, res) => {
  if (req.usuario.rol !== 'admin')
    return res.status(403).json({ error: 'Sin permisos' });

  const { cedula, nombre, cargo, contrasena, rol } = req.body;
  if (!cedula || !nombre || !cargo || !contrasena)
    return res.status(400).json({ error: 'Faltan campos obligatorios' });

  try {
    const hash = await bcrypt.hash(contrasena, 10);
    await pool.query(
      'INSERT INTO usuarios (cedula, nombre, cargo, contrasena, rol, activo) VALUES (?,?,?,?,?,1)',
      [cedula, nombre, cargo, hash, rol || 'tecnico']
    );
    res.status(201).json({ mensaje: 'Usuario creado correctamente' });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY')
      return res.status(409).json({ error: 'La cédula ya existe' });
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/usuarios', verificarToken, async (req, res) => {
  if (req.usuario.rol !== 'admin')
    return res.status(403).json({ error: 'Sin permisos' });
  try {
    const [rows] = await pool.query(
      'SELECT cedula, nombre, cargo, rol, activo FROM usuarios ORDER BY nombre'
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');

async function obtenerDatosReporte(filtros) {
  let query = `
    SELECT e.*, u.nombre AS nombre_responsable, u.cargo
    FROM equipos_baja e
    JOIN usuarios u ON u.cedula = e.cedula_responsable
    WHERE 1=1
  `;
  const params = [];

  if (filtros.fecha_inicio) {
    query += ' AND e.fecha_baja >= ?';
    params.push(filtros.fecha_inicio);
  }
  if (filtros.fecha_fin) {
    query += ' AND e.fecha_baja <= ?';
    params.push(filtros.fecha_fin);
  }
  if (filtros.mes) {
    query += ' AND MONTH(e.fecha_baja) = ?';
    params.push(filtros.mes);
  }
  if (filtros.anio) {
    query += ' AND YEAR(e.fecha_baja) = ?';
    params.push(filtros.anio);
  }
  if (filtros.tipo_equipo) {
    query += ' AND e.tipo_equipo = ?';
    params.push(filtros.tipo_equipo);
  }
  if (filtros.estado_proceso) {
    query += ' AND e.estado_proceso = ?';
    params.push(filtros.estado_proceso);
  }

  query += ' ORDER BY e.fecha_baja DESC';
  const [rows] = await pool.query(query, params);
  return rows;
}

app.get('/api/equipos/reporte/datos', verificarToken, async (req, res) => {
  try {
    const datos = await obtenerDatosReporte(req.query);
    res.json(datos);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/reportes/excel', verificarToken, async (req, res) => {
  try {
    const datos = await obtenerDatosReporte(req.query);
    const workbook  = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Reporte de Bajas');

    worksheet.mergeCells('A1:H1');
    worksheet.getCell('A1').value = 'HONORABLE CONSEJO PROVINCIAL DE TUNGURAHUA';
    worksheet.getCell('A1').font  = { bold: true, size: 14 };
    worksheet.getCell('A1').alignment = { horizontal: 'center' };

    worksheet.mergeCells('A2:H2');
    worksheet.getCell('A2').value = 'Dirección de Sistemas — Reporte de Baja de Equipos Dañados';
    worksheet.getCell('A2').font  = { bold: true, size: 11 };
    worksheet.getCell('A2').alignment = { horizontal: 'center' };

    worksheet.mergeCells('A3:H3');
    worksheet.getCell('A3').value = `Generado el: ${new Date().toLocaleDateString('es-EC')}`;
    worksheet.getCell('A3').alignment = { horizontal: 'center' };

    worksheet.addRow([]);

    const cabecera = worksheet.addRow([
      'Código Inventario', 'Tipo Equipo', 'Marca', 'Modelo',
      'Serie', 'Responsable', 'Fecha Baja', 'Estado'
    ]);
    cabecera.eachCell(cell => {
      cell.font      = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1a5c2e' } };
      cell.alignment = { horizontal: 'center' };
      cell.border    = {
        top: { style: 'thin' }, bottom: { style: 'thin' },
        left: { style: 'thin' }, right: { style: 'thin' }
      };
    });

    datos.forEach((eq, i) => {
      const fila = worksheet.addRow([
        eq.codigo_inventario,
        eq.tipo_equipo,
        eq.marca,
        eq.modelo,
        eq.serie,
        eq.nombre_responsable,
        eq.fecha_baja ? String(eq.fecha_baja).substring(0, 10) : '',
        eq.estado_proceso.replace('_', ' ')
      ]);
      const color = i % 2 === 0 ? 'FFe8f5ec' : 'FFFFFFFF';
      fila.eachCell(cell => {
        cell.fill   = { type: 'pattern', pattern: 'solid', fgColor: { argb: color } };
        cell.border = {
          top: { style: 'thin' }, bottom: { style: 'thin' },
          left: { style: 'thin' }, right: { style: 'thin' }
        };
      });
    });

    worksheet.addRow([]);
    worksheet.addRow(['Total de equipos:', datos.length]);

    worksheet.columns = [
      { width: 20 }, { width: 25 }, { width: 15 }, { width: 20 },
      { width: 18 }, { width: 25 }, { width: 14 }, { width: 16 }
    ];

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=reporte_bajas.xlsx');
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/reportes/pdf', verificarToken, async (req, res) => {
  try {
    const datos = await obtenerDatosReporte(req.query);
    const doc = new PDFDocument({ margin: 40, size: 'A4', layout: 'landscape' });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=reporte_bajas.pdf');
    doc.pipe(res);

    doc.fontSize(14).font('Helvetica-Bold')
       .text('HONORABLE CONSEJO PROVINCIAL DE TUNGURAHUA', { align: 'center' });
    doc.fontSize(11)
       .text('Dirección de Sistemas — Reporte de Baja de Equipos Dañados', { align: 'center' });
    doc.fontSize(9).font('Helvetica')
       .text(`Generado el: ${new Date().toLocaleDateString('es-EC')}  |  Total de equipos: ${datos.length}`, { align: 'center' });
    doc.moveDown();

    const cols  = [90, 110, 70, 90, 90, 110, 80, 80];
    const heads = ['Código', 'Tipo Equipo', 'Marca', 'Modelo', 'Serie', 'Responsable', 'Fecha Baja', 'Estado'];
    let x = 30;
    let y = doc.y;

    doc.rect(30, y, cols.reduce((a, b) => a + b, 0), 20).fill('#1a5c2e');
    doc.fillColor('white').font('Helvetica-Bold').fontSize(8);
    heads.forEach((h, i) => {
      doc.text(h, x + 3, y + 6, { width: cols[i] - 6, align: 'center' });
      x += cols[i];
    });

    doc.fillColor('black').font('Helvetica').fontSize(7.5);
    datos.forEach((eq, idx) => {
      y += 20;
      if (y > 530) {
        doc.addPage({ layout: 'landscape' });
        y = 40;
      }
      const color = idx % 2 === 0 ? '#e8f5ec' : '#ffffff';
      doc.rect(30, y, cols.reduce((a, b) => a + b, 0), 18).fill(color);
      doc.fillColor('black');
      x = 30;
      const valores = [
        eq.codigo_inventario,
        eq.tipo_equipo,
        eq.marca,
        eq.modelo,
        eq.serie,
        eq.nombre_responsable,
        eq.fecha_baja ? String(eq.fecha_baja).substring(0, 10) : '',
        eq.estado_proceso.replace('_', ' ')
      ];
      valores.forEach((v, i) => {
        doc.text(String(v || ''), x + 3, y + 5, { width: cols[i] - 6, align: 'left', ellipsis: true });
        x += cols[i];
      });
    });

    doc.end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Servidor HCPT corriendo en http://localhost:${PORT}`);
});