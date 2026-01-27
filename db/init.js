const mysql = require('mysql2/promise');

const initSQL = `
  -- Create database if not exists
  CREATE DATABASE IF NOT EXISTS jfcecommerce;
  USE jfcecommerce;

  -- Products table
  CREATE TABLE IF NOT EXISTS products (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    price DECIMAL(10,2) NOT NULL,
    image_key VARCHAR(255),
    category VARCHAR(100)
  );

  -- Customers table
  CREATE TABLE IF NOT EXISTS customers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(120) NOT NULL,
    email VARCHAR(160) NOT NULL,
    address VARCHAR(255),
    phone VARCHAR(32),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_email (email)
  );

  -- Orders table
  CREATE TABLE IF NOT EXISTS orders (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    customer_id INT,
    status ENUM('PENDING','PAID','CANCELLED') DEFAULT 'PENDING',
    subtotal DECIMAL(12,2) NOT NULL,
    tax DECIMAL(12,2) NOT NULL DEFAULT 0,
    total DECIMAL(12,2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_orders_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL
  );

  -- Order items table
  CREATE TABLE IF NOT EXISTS order_items (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    order_id BIGINT NOT NULL,
    product_id INT NOT NULL,
    name VARCHAR(255) NOT NULL,
    unit_price DECIMAL(12,2) NOT NULL,
    quantity INT NOT NULL,
    line_total DECIMAL(12,2) NOT NULL,
    CONSTRAINT fk_items_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    CONSTRAINT fk_items_product FOREIGN KEY (product_id) REFERENCES products(id)
  );
`;

const seedSQL = `
  INSERT IGNORE INTO products (id, name, price, image_key, category) VALUES
  (1, 'Sustrato universal x 1 kg', 8500.00, 'products/sustrato1kg.jpg', 'Sustrato'),
  (2, 'Sustrato premium para orquideas 2 kg', 15500.00, 'products/sustrato-orquideas.jpg', 'Sustrato'),
  (3, 'Fertilizante liquido foliar 1L', 12500.00, 'products/fertilizante-foliar.jpg', 'Fertilizante'),
  (4, 'Abono organico compostado 3 kg', 18900.00, 'products/abono-organico.jpg', 'Fertilizante'),
  (5, 'Maceta de barro pequena', 9500.00, 'products/maceta-barro.jpg', 'Macetas'),
  (6, 'Maceta plastica mediana con plato', 12900.00, 'products/maceta-plastica.jpg', 'Macetas'),
  (7, 'Maceta colgante de fibra natural', 17900.00, 'products/maceta-colgante.jpg', 'Macetas'),
  (8, 'Tijeras de poda de acero inoxidable', 21000.00, 'products/tijeras-poda.jpg', 'Herramientas'),
  (9, 'Palita metalica para jardineria', 9900.00, 'products/palita-metalica.jpg', 'Herramientas'),
  (10, 'Guantes de jardineria con agarre', 7500.00, 'products/guantes-jardineria.jpg', 'Herramientas');
`;

async function initDatabase() {
  const config = {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || 'secret',
    multipleStatements: true,
  };

  console.log('🔄 Connecting to database...');
  
  let conn;
  try {
    conn = await mysql.createConnection(config);
    
    console.log('📦 Creating tables if not exist...');
    await conn.query(initSQL);
    
    console.log('🌱 Seeding products...');
    await conn.query(seedSQL);
    
    const [rows] = await conn.query('SELECT COUNT(*) as count FROM jfcecommerce.products');
    console.log(`✅ Database initialized! Products count: ${rows[0].count}`);
    
  } catch (error) {
    console.error('❌ Database initialization failed:', error.message);
    throw error;
  } finally {
    if (conn) await conn.end();
  }
}

module.exports = { initDatabase };
