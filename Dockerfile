# Imagen base ligera de Node
FROM node:20-alpine

# Directorio de trabajo dentro del contenedor
WORKDIR /usr/src/app

# Copiamos solo los archivos de dependencias primero
COPY package*.json ./

# Instalamos dependencias (usa npm ci si tienes package-lock.json)
RUN npm ci || npm install

# Copiamos el resto del código
COPY . .

# Variables de entorno por defecto (se sobreescribirán en ECS)
ENV NODE_ENV=production

# El backend escucha en este puerto (coincide con tu index.js y ECS)
EXPOSE 8080

# Comando de arranque
CMD ["npm", "start"]
