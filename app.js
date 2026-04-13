require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const bodyParser = require('body-parser');
const path = require('path');

const app = express();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// --- NUEVO: Configuración de Cabeceras de Seguridad (Para evitar el error de CSP) ---
app.use((req, res, next) => {
    res.setHeader("Content-Security-Policy", "default-src * 'unsafe-inline' 'unsafe-eval' data: blob:; font-src * data:; img-src * data:;");
    next();
});

app.set('view engine', 'ejs');
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

// RUTA: Formulario de envío (IMPORTANTE: Debe tener el "/" inicial)
app.get('/u/tu-usuario', async (req, res) => {
    try {
        const result = await pool.query('SELECT "userId", pushname, "phoneNumber" FROM users WHERE pushname IS NOT NULL ORDER BY pushname ASC');
        res.render('index', { usuarios: result.rows });
    } catch (err) {
        console.error("Error usuarios:", err);
        res.render('index', { usuarios: [] });
    }
});

// RUTA: Guardar mensaje
app.post('/send', async (req, res) => {
    const { question, target_user_id } = req.body;
    if (question) {
        try {
            await pool.query(
                'INSERT INTO ngl_privados (content, target_user_id) VALUES ($1, $2)', 
                [question, target_user_id || null]
            );
            res.render('success'); 
        } catch (e) {
            res.status(500).send("Error");
        }
    } else {
        res.redirect('/ngl/u/tu-usuario'); // Con prefijo para Nginx
    }
});

// RUTA: Inbox
app.get('/inbox', async (req, res) => {
    try {
        const query = `
            SELECT n.*, u.pushname, u."phoneNumber" 
            FROM ngl_privados n
            LEFT JOIN users u ON n.target_user_id = u."userId"
            ORDER BY n.created_at DESC
        `;
        const result = await pool.query(query);
        res.render('inbox', { messages: result.rows });
    } catch (e) {
        res.status(500).send("Error");
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Corriendo en puerto ${PORT}`));