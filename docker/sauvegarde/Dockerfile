FROM alpine:3.22
RUN apk add --no-cache sqlite tzdata
COPY sauvegarde.sh /usr/local/bin/sauvegarde.sh
RUN chmod +x /usr/local/bin/sauvegarde.sh
CMD ["/usr/local/bin/sauvegarde.sh", "--boucle"]
