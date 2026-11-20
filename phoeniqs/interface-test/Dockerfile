# Banc de test Phoeniqs : image pour un hébergement en ligne.
FROM python:3.13-slim

RUN useradd --system --no-create-home banc
WORKDIR /app
COPY serveur.py ./
COPY static ./static

# Écoute sur toutes les interfaces, derrière le répartiteur HTTPS de l'hébergeur.
ENV HOTE=0.0.0.0 \
    PORT=8080 \
    DERRIERE_PROXY=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

USER banc
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD python -c "import os,urllib.request; urllib.request.urlopen('http://127.0.0.1:%s/api/sante' % os.environ.get('PORT','8080'), timeout=4)"

CMD ["python", "serveur.py"]
