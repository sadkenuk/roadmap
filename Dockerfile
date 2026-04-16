FROM nginx:1.27-alpine

COPY index.html  /usr/share/nginx/html/index.html
COPY favicon.svg /usr/share/nginx/html/favicon.svg
COPY css/        /usr/share/nginx/html/css/
COPY js/         /usr/share/nginx/html/js/
COPY data/       /usr/share/nginx/html/data/

COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
