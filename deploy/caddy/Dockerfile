FROM caddy:2-alpine@sha256:003a97808e781aa9f7e75cc2f43d34d461099031faf5e20faefb9f61126836f0
RUN mkdir -p /data/caddy /config/caddy && chown -R 1000:1000 /data /config
USER 1000:1000
EXPOSE 8080 8443
