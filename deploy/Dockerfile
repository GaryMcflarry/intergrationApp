# syntax=docker/dockerfile:1
FROM scratch AS installer
ARG ASTRUM_WINDOWS_URL=https://github.com/GaryMcflarry/intergrationApp/releases/download/v1.0.0/Astrum-Setup-1.0.0.exe
ARG ASTRUM_WINDOWS_SHA256=fdd187b76680793bd713f2d145451d7a3f5fb609958e0f4df1284a7950232d86
ADD --checksum=sha256:${ASTRUM_WINDOWS_SHA256} ${ASTRUM_WINDOWS_URL} /Astrum-Setup.exe

FROM docker.io/nginxinc/nginx-unprivileged:stable-alpine
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY app/guide/index.html app/guide/setup.html app/guide/guide.css app/guide/guide.js app/guide/landing.js /srv/astrum/
COPY --from=installer --chmod=0644 /Astrum-Setup.exe /srv/astrum-artifacts/download/windows

EXPOSE 8080
