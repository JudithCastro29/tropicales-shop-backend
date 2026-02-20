const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { SQSClient, SendMessageCommand } = require('@aws-sdk/client-sqs');
const { CognitoJwtVerifier } = require('aws-jwt-verify');
const { initDatabase } = require('./db/init');
require('dotenv').config();

const app = express();
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));
app.use(express.json());

// ---------- AWS CLIENTS ----------
const region = process.env.AWS_REGION || 'us-east-1';
const s3Client = new S3Client({ region });
const sqsClient = new SQSClient({ region });

const ASSETS_BUCKET = process.env.ASSETS_BUCKET || 'jfc-ecommerce-dev-s3-assets1';
const PAYMENT_QUEUE_URL = process.env.PAYMENT_QUEUE_URL || '';

// ---------- COGNITO AUTH ----------
const COGNITO_USER_POOL_ID = process.env.COGNITO_USER_POOL_ID || '';
const COGNITO_CLIENT_ID = process.env.COGNITO_CLIENT_ID || '';

let cognitoVerifier = null;
if (COGNITO_USER_POOL_ID && COGNITO_CLIENT_ID) {
  cognitoVerifier = CognitoJwtVerifier.create({
    userPoolId: COGNITO_USER_POOL_ID,
    tokenUse: 'id',
    clientId: COGNITO_CLIENT_ID,
  });
  console.log('[AUTH] Cognito verificador configurado para User Pool:', COGNITO_USER_POOL_ID);
} else {
  console.warn('[AUTH] COGNITO_USER_POOL_ID o COGNITO_CLIENT_ID no configurado. Rutas admin NO protegidas.');
}

/**
 * Middleware para verificar JWT de Cognito y que el usuario sea admin
 */
const requireAdmin = async (req, res, next) => {
  // Si Cognito no está configurado, permitir (desarrollo local)
  if (!cognitoVerifier) {
    console.log('[AUTH] Cognito no configurado, permitiendo acceso sin verificación');
    return next();
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ ok: false, error: 'Token de autorización requerido' });
  }

  const token = authHeader.substring(7);

  try {
    const payload = await cognitoVerifier.verify(token);
    
    // Verificar que el usuario pertenezca al grupo 'admin'
    const groups = payload['cognito:groups'] || [];
    if (!groups.includes('admin')) {
      return res.status(403).json({ ok: false, error: 'Se requiere rol de administrador' });
    }

    req.user = {
      email: payload.email,
      groups: groups,
      sub: payload.sub
    };
    next();
  } catch (error) {
    console.error('[AUTH] Token inválido:', error.message);
    return res.status(401).json({ ok: false, error: 'Token inválido o expirado' });
  }
};

// ---------- DB POOL ---------
const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASS || 'secret',
  database: process.env.DB_NAME || 'tienda',
  waitForConnections: true,
  connectionLimit: 5,
});

// ---------- UTILS ----------
const validEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((e || '').trim());
const fmtCOP = (n) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP' }).format(n);

/**
 * Enviar solicitud de pago a SQS
 */
async function sendPaymentRequest(orderData) {
  if (!PAYMENT_QUEUE_URL) {
    console.log('[PAYMENT] PAYMENT_QUEUE_URL no configurada, omitiendo SQS');
    return null;
  }

  const message = {
    type: 'PAYMENT_REQUEST',
    orderId: orderData.orderId,
    customerId: orderData.customerId,
    customerEmail: orderData.customerEmail,
    amount: orderData.total,
    currency: 'COP',
    items: orderData.items,
    createdAt: new Date().toISOString()
  };

  const command = new SendMessageCommand({
    QueueUrl: PAYMENT_QUEUE_URL,
    MessageBody: JSON.stringify(message),
    MessageAttributes: {
      'OrderId': {
        DataType: 'String',
        StringValue: String(orderData.orderId)
      },
      'EventType': {
        DataType: 'String',
        StringValue: 'PAYMENT_REQUEST'
      }
    }
  });

  try {
    const result = await sqsClient.send(command);
    console.log(`[PAYMENT] Mensaje enviado a SQS para orden #${orderData.orderId}, MessageId: ${result.MessageId}`);
    return result.MessageId;
  } catch (error) {
    console.error('[PAYMENT] Error enviando a SQS:', error);
    throw error;
  }
}

async function priceCartItems(cart) {
  const ids = cart.map((i) => i.productId);
  if (!ids.length) return { items: [], subtotal: 0 };

  const [rows] = await pool.query(
    `SELECT id, name, price FROM products WHERE id IN (${ids.map(() => '?').join(',')})`,
    ids
  );

  const byId = new Map(rows.map((r) => [r.id, r]));
  let subtotal = 0;

  const items = cart.map((i) => {
    const p = byId.get(i.productId);
    if (!p) throw new Error(`Producto ${i.productId} no existe`);
    const q = Math.max(1, Number(i.quantity || 1));
    const unit_price = Number(p.price);
    const line_total = unit_price * q;
    subtotal += line_total;
    return {
      product_id: p.id,
      name: p.name,
      unit_price,
      quantity: q,
      line_total,
    };
  });

  return { items, subtotal };
}

// ---------- HEALTH ----------
app.get('/health', (_, res) => res.send('ok'));

// ---------- PRODUCTS ----------
app.get('/api/products', async (_, res) => {
  const [rows] = await pool.query(
    'SELECT id, name, price, image_key FROM products ORDER BY id DESC'
  );
  res.json(rows);
});

app.post('/api/products', requireAdmin, async (req, res) => {
  const { name, price, image_key } = req.body || {};
  if (!name || price == null || !image_key) {
    return res.status(400).json({ ok: false, error: 'Faltan campos' });
  }
  const [r] = await pool.query(
    'INSERT INTO products(name, price, image_key) VALUES (?,?,?)',
    [name, price, image_key]
  );
  console.log(`[ADMIN] Producto creado por ${req.user?.email}: ${name}`);
  res.status(201).json({ id: r.insertId, name, price, image_key });
});

app.put('/api/products/:id', requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const { name, price, image_key } = req.body || {};
  const [r] = await pool.query(
    'UPDATE products SET name=?, price=?, image_key=? WHERE id=?',
    [name, price, image_key, id]
  );
  if (!r.affectedRows) return res.status(404).json({ ok: false, error: 'No encontrado' });
  res.json({ id, name, price, image_key });
});

app.delete('/api/products/:id', requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const [r] = await pool.query('DELETE FROM products WHERE id=?', [id]);
  if (!r.affectedRows) return res.status(404).json({ ok: false, error: 'No encontrado' });
  console.log(`[ADMIN] Producto #${id} eliminado por ${req.user?.email}`);
  res.status(204).send();
});

// ---------- UPLOAD (Presigned URL) ----------
app.post('/api/upload/presigned-url', requireAdmin, async (req, res) => {
  try {
    const { filename, contentType } = req.body || {};
    if (!filename || !contentType) {
      return res.status(400).json({ ok: false, error: 'filename y contentType requeridos' });
    }
    
    // Generar key único para el archivo
    const timestamp = Date.now();
    const cleanName = filename.replace(/[^a-zA-Z0-9.-]/g, '_');
    const key = `products/${timestamp}-${cleanName}`;
    
    const command = new PutObjectCommand({
      Bucket: ASSETS_BUCKET,
      Key: key,
      ContentType: contentType,
    });
    
    const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 300 }); // 5 min
    
    res.json({ 
      ok: true, 
      uploadUrl, 
      key,
      publicUrl: `https://${ASSETS_BUCKET}.s3.amazonaws.com/${key}`
    });
  } catch (err) {
    console.error('Error generating presigned URL:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ---------- ORDERS (ÚNICO HANDLER) ----------
app.post('/api/orders', async (req, res) => {
  const { customer, cart } = req.body || {};
  try {
    // Validación básica
    if (!customer?.name || !validEmail(customer?.email)) {
      return res.status(400).json({ ok: false, error: 'Falta name/email válido' });
    }
    if (!Array.isArray(cart) || !cart.length) {
      return res.status(400).json({ ok: false, error: 'Carrito vacío' });
    }

    // Recalcular items y totales
    const { items, subtotal } = await priceCartItems(cart);
    const tax = 0; // ajusta si quieres IVA
    const total = subtotal + tax;

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      // Upsert cliente por email
      const [[exists]] = await conn.query(
        'SELECT id FROM customers WHERE email=? LIMIT 1',
        [customer.email]
      );

      let customer_id;
      if (exists) {
        customer_id = exists.id;
        await conn.query(
          'UPDATE customers SET name=?, address=?, phone=? WHERE id=?',
          [customer.name, customer.address || '', customer.phone || '', customer_id]
        );
      } else {
        const [ins] = await conn.query(
          'INSERT INTO customers (name,email,address,phone) VALUES (?,?,?,?)',
          [customer.name, customer.email, customer.address || '', customer.phone || '']
        );
        customer_id = ins.insertId;
      }

      // Insertar orden
      const [oins] = await conn.query(
        'INSERT INTO orders (customer_id, status, subtotal, tax, total) VALUES (?,?,?,?,?)',
        [customer_id, 'PENDING', subtotal, tax, total]
      );
      const order_id = oins.insertId;

      // Insertar ítems
      const placeholders = items.map(() => '(?,?,?,?,?,?)').join(',');
      const values = items.flatMap((it) => [
        order_id,
        it.product_id,
        it.name,
        it.unit_price,
        it.quantity,
        it.line_total,
      ]);
      await conn.query(
        `INSERT INTO order_items (order_id, product_id, name, unit_price, quantity, line_total)
         VALUES ${placeholders}`,
        values
      );

      await conn.commit();

      // Enviar solicitud de pago a SQS
      try {
        await sendPaymentRequest({
          orderId: order_id,
          customerId: customer_id,
          customerEmail: customer.email,
          total,
          items
        });
      } catch (sqsError) {
        console.error('[ORDEN] Error enviando a SQS (la orden fue creada):', sqsError);
        // No fallamos la orden si SQS falla - el pago puede procesarse manualmente
      }

      console.log(
        `[ORDEN] #${order_id} total ${fmtCOP(total)} para ${customer.name} <${customer.email}>`
      );
      res.json({ ok: true, orderId: order_id, total, status: 'PENDING_PAYMENT' });
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  } catch (e) {
    console.error('POST /api/orders', e);
    res.status(500).json({ ok: false, error: e.message || 'Error al crear la orden' });
  }
});

// ---------- GET ORDER STATUS ----------
app.get('/api/orders/:id', async (req, res) => {
  try {
    const orderId = Number(req.params.id);
    
    const [[order]] = await pool.query(
      `SELECT o.id, o.status, o.subtotal, o.tax, o.total, o.created_at,
              c.name as customer_name, c.email as customer_email
       FROM orders o
       JOIN customers c ON o.customer_id = c.id
       WHERE o.id = ?`,
      [orderId]
    );
    
    if (!order) {
      return res.status(404).json({ ok: false, error: 'Orden no encontrada' });
    }
    
    const [items] = await pool.query(
      'SELECT product_id, name, unit_price, quantity, line_total FROM order_items WHERE order_id = ?',
      [orderId]
    );
    
    res.json({
      ok: true,
      order: {
        ...order,
        items
      }
    });
  } catch (e) {
    console.error('GET /api/orders/:id', e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ---------- UPDATE ORDER STATUS (interno/webhook) ----------
app.patch('/api/orders/:id/status', async (req, res) => {
  try {
    const orderId = Number(req.params.id);
    const { status } = req.body;
    
    const validStatuses = ['PENDING', 'PENDING_PAYMENT', 'PROCESSING', 'PAID', 'SHIPPED', 'DELIVERED', 'CANCELLED'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ ok: false, error: `Estado inválido. Válidos: ${validStatuses.join(', ')}` });
    }
    
    const [result] = await pool.query(
      'UPDATE orders SET status = ? WHERE id = ?',
      [status, orderId]
    );
    
    if (!result.affectedRows) {
      return res.status(404).json({ ok: false, error: 'Orden no encontrada' });
    }
    
    console.log(`[ORDEN] #${orderId} actualizada a estado: ${status}`);
    res.json({ ok: true, orderId, status });
  } catch (e) {
    console.error('PATCH /api/orders/:id/status', e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ---------- SERVER ----------
const port = Number(process.env.PORT || 8080);

// Initialize database before starting server
(async () => {
  try {
    if (process.env.INIT_DB === 'true') {
      await initDatabase();
    }
  } catch (err) {
    console.error('DB init error (continuing anyway):', err.message);
  }
  
  app.listen(port, '0.0.0.0', () =>
    console.log(`API lista en puerto ${port} (0.0.0.0)`)
  );
})();