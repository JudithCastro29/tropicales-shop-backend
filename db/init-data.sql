-- Script para poblar la base de datos con datos iniciales
USE tienda;

-- Insertar productos si no existen
INSERT IGNORE INTO products (name, price, image_key, category) VALUES
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

-- Verificar que se insertaron los productos
SELECT COUNT(*) as total_products FROM products;