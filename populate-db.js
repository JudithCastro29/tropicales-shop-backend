const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: 'tropicales-shop-dev-mysql.ch2s8smos70f.us-east-2.rds.amazonaws.com',
  port: 3306,
  user: 'app_user',
  password: 'tienda123',
  database: 'tienda',
});

async function populateDB() {
  try {
    const products = [
      ['Sustrato universal x 1 kg', 8500.00, 'products/sustrato1kg.jpg', 'Sustrato'],
      ['Sustrato premium para orquídeas 2 kg', 15500.00, 'products/sustrato-orquideas.jpg', 'Sustrato'],
      ['Fertilizante líquido foliar 1L', 12500.00, 'products/fertilizante-foliar.jpg', 'Fertilizante'],
      ['Abono orgánico compostado 3 kg', 18900.00, 'products/abono-organico.jpg', 'Fertilizante'],
      ['Maceta de barro pequeña', 9500.00, 'products/maceta-barro.jpg', 'Macetas'],
      ['Maceta plástica mediana con plato', 12900.00, 'products/maceta-plastica.jpg', 'Macetas'],
      ['Maceta colgante de fibra natural', 17900.00, 'products/maceta-colgante.jpg', 'Macetas'],
      ['Tijeras de poda de acero inoxidable', 21000.00, 'products/tijeras-poda.jpg', 'Herramientas'],
      ['Palita metálica para jardinería', 9900.00, 'products/palita-metalica.jpg', 'Herramientas'],
      ['Guantes de jardinería con agarre', 7500.00, 'products/guantes-jardineria.jpg', 'Herramientas']
    ];

    for (const [name, price, image_key, category] of products) {
      await pool.query(
        'INSERT IGNORE INTO products (name, price, image_key, category) VALUES (?, ?, ?, ?)',
        [name, price, image_key, category]
      );
    }

    const [rows] = await pool.query('SELECT COUNT(*) as count FROM products');
    console.log(`✅ Base de datos poblada. Total productos: ${rows[0].count}`);
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await pool.end();
  }
}

populateDB();