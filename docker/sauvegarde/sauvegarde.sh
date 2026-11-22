#!/bin/sh
# Copie cohérente de la base SQLite du hub (même pendant qu'il tourne).
# Sans argument : une copie tout de suite. Avec --boucle : une copie par jour à HEURE_SAUVEGARDE.
set -eu

BASE="${BASE:-/data/hub.db}"
DOSSIER="${DOSSIER:-/sauvegardes}"
JOURS="${JOURS_A_GARDER:-14}"
HEURE="${HEURE_SAUVEGARDE:-4}"

copier() {
	if [ ! -f "$BASE" ]; then
		echo "[sauvegarde] $BASE n'existe pas encore, rien à copier."
		return 0
	fi
	mkdir -p "$DOSSIER"
	fichier="$DOSSIER/hub-$(date +%Y-%m-%d_%H%M).db"
	sqlite3 "$BASE" ".backup '$fichier'"
	gzip -f "$fichier"
	find "$DOSSIER" -name 'hub-*.db.gz' -mtime "+$JOURS" -delete
	echo "[sauvegarde] $fichier.gz"
}

if [ "${1:-}" != "--boucle" ]; then
	copier
	exit 0
fi

while true; do
	maintenant=$(date +%s)
	cible=$(date -d "$(date +%Y-%m-%d) $(printf %02d "$HEURE"):00:00" +%s)
	[ "$cible" -le "$maintenant" ] && cible=$((cible + 86400))
	sleep $((cible - maintenant))
	copier || echo "[sauvegarde] échec de la copie"
done
