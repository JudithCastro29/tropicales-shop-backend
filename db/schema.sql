-- 1️⃣ Crear base de datos (si no existe)
CREATE DATABASE IF NOT EXISTS tienda;
USE tienda;

-- 2️⃣ Crear tabla de productos
DROP TABLE IF EXISTS products;
CREATE TABLE products (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  image_key VARCHAR(255),
  category VARCHAR(100)
);

-- 3️⃣ Insertar productos de ejemplo (10 en total)
INSERT INTO products (name, price, image_key, category) VALUES
-- 🪴 Sustrato
('Sustrato universal x 1 kg', 8500.00, 'products/sustrato1kg.jpg', 'Sustrato'),
('Sustrato premium para orquídeas 2 kg', 15500.00, 'products/sustrato-orquideas.jpg', 'Sustrato'),

-- 🌿 Fertilizantes
('Fertilizante líquido foliar 1L', 12500.00, 'products/fertilizante-foliar.jpg', 'Fertilizante'),
('Abono orgánico compostado 3 kg', 18900.00, 'products/abono-organico.jpg', 'Fertilizante'),

-- 🪴 Macetas
('Maceta de barro pequeña', 9500.00, 'products/maceta-barro.jpg', 'Macetas'),
('Maceta plástica mediana con plato', 12900.00, 'products/maceta-plastica.jpg', 'Macetas'),
('Maceta colgante de fibra natural', 17900.00, 'products/maceta-colgante.jpg', 'Macetas'),

-- 🔧 Herramientas
('Tijeras de poda de acero inoxidable', 21000.00, 'products/tijeras-poda.jpg', 'Herramientas'),
('Palita metálica para jardinería', 9900.00, 'products/palita-metalica.jpg', 'Herramientas'),
('Guantes de jardinería con agarre', 7500.00, 'products/guantes-jardineria.jpg', 'Herramientas');

-- 4️⃣ Verificar inserción
SELECT * FROM products;




CREATE DATABASE IF NOT EXISTS tienda;
USE tienda;

CREATE TABLE IF NOT EXISTS customers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(160) NOT NULL,
  address VARCHAR(255),
  phone VARCHAR(32),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_email (email)
);

CREATE TABLE IF NOT EXISTS orders (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  customer_id INT,
  status ENUM('PENDING','PAID','CANCELLED') DEFAULT 'PENDING',
  subtotal DECIMAL(12,2) NOT NULL,
  tax DECIMAL(12,2) NOT NULL DEFAULT 0,
  total DECIMAL(12,2) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES customers(id)
);

CREATE TABLE IF NOT EXISTS order_items (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  order_id BIGINT NOT NULL,
  product_id INT NOT NULL,
  name VARCHAR(255) NOT NULL,
  unit_price DECIMAL(12,2) NOT NULL,
  quantity INT NOT NULL,
  line_total DECIMAL(12,2) NOT NULL,
  FOREIGN KEY (order_id) REFERENCES orders(id),
  FOREIGN KEY (product_id) REFERENCES products(id)
);
