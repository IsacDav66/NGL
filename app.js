require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const bodyParser = require('body-parser');

const app = express();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

const initDb = async () => {
    try {
        const client = await pool.connect();
        
        // 1. Asegurar que la tabla existe
        await client.query(`
            CREATE TABLE IF NOT EXISTS ngl_privados (
                id SERIAL PRIMARY KEY,
                content TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // 2. FORZAR la creación de la columna target_user_id si no existe
        await client.query(`
            ALTER TABLE ngl_privados 
            ADD COLUMN IF NOT EXISTS target_user_id TEXT;
        `);

        client.release();
        console.log("\x1b[32m[DB]\x1b[0m Estructura de tabla actualizada correctamente.");
    } catch (err) {
        console.error("\x1b[31m[DB Error]\x1b[0m:", err.message);
    }
};
initDb();

app.set('view engine', 'ejs');
app.use(bodyParser.urlencoded({ extended: true }));

// RUTA: Formulario de envío (Carga usuarios de la tabla 'users')
app.get('u/tu-usuario', async (req, res) => {
    try {
        // Obtenemos los usuarios usando los nombres de columna de tu captura
        const result = await pool.query('SELECT "userId", pushname, "phoneNumber" FROM users WHERE pushname IS NOT NULL ORDER BY pushname ASC');
        res.render('index', { usuarios: result.rows });
    } catch (err) {
        console.error("Error al obtener usuarios:", err);
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
            
            // CAMBIO AQUÍ: En lugar de res.send, usamos res.render
            res.render('success'); 

        } catch (e) {
            console.error("Error al insertar:", e);
            res.status(500).send("Error al enviar");
        }
    } else {
        res.redirect('/u/tu-usuario');
    }
});

// RUTA: Inbox (Con JOIN para ver a quién se mencionó)
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
        console.error("Error al leer inbox:", e);
        res.status(500).send("Error al obtener mensajes.");
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Corriendo en http://localhost:${PORT}/u/tu-usuario`));