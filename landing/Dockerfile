# Landing estática. Se sirve con nginx: una imagen de ~10 MB, sin Node.
FROM nginx:1.27-alpine

# Plantilla del servidor
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Sitio
COPY index.html config.js /usr/share/nginx/html/

EXPOSE 80
