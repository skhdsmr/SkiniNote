#!/bin/bash
# 피부장벽진단 추론 서버 + 외부 접속 터널을 함께 켠다.
#
#   1) 피부상태_파이프라인/serve_skin.py (MediaPipe 부위 crop + QuadTree 모델 3개, GPU)
#   2) cloudflared quick tunnel -> https://xxxx.trycloudflare.com (아이폰이 어디서든 접속)
#   3) 그 주소를 이 폴더의 .env(EXPO_PUBLIC_SKIN_API_URL)에 써 넣는다
#
# 터널 주소는 켤 때마다 바뀐다. 이 스크립트를 다시 켰으면 Expo도 캐시를 지우고 다시 켠다:
#   npx expo start -c --tunnel ngrok --go
# Ctrl+C로 끄면 서버와 터널이 함께 꺼진다.
set -e
APP_DIR="$(cd "$(dirname "$0")" && pwd)"
PIPE=/home/work/MINJI/피부상태_파이프라인
PY=/home/work/MINJI/.aet_venv/bin/python
CLOUDFLARED=/home/work/MINJI/cloudflared
PORT=${PORT:-8765}
LOG_DIR="$APP_DIR/.skin_server"
mkdir -p "$LOG_DIR"

cleanup() { kill $SERVER_PID $TUNNEL_PID 2>/dev/null || true; }
trap cleanup EXIT INT TERM

echo "[1/3] 추론 서버 시작 (모델 로딩에 10~20초)..."
(cd "$PIPE" && exec "$PY" -m uvicorn serve_skin:app --host 127.0.0.1 --port "$PORT") > "$LOG_DIR/server.log" 2>&1 &
SERVER_PID=$!
for i in $(seq 1 90); do
  curl -sf "http://127.0.0.1:$PORT/health" > /dev/null && break
  kill -0 $SERVER_PID 2>/dev/null || { echo "서버가 죽었어요 — $LOG_DIR/server.log 확인"; tail -20 "$LOG_DIR/server.log"; exit 1; }
  sleep 2
done
echo "      $(curl -s "http://127.0.0.1:$PORT/health")"

echo "[2/3] cloudflared 터널 여는 중..."
"$CLOUDFLARED" tunnel --no-autoupdate --url "http://127.0.0.1:$PORT" > "$LOG_DIR/tunnel.log" 2>&1 &
TUNNEL_PID=$!
URL=""
for i in $(seq 1 60); do
  URL=$(grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' "$LOG_DIR/tunnel.log" | head -1 || true)
  [ -n "$URL" ] && break
  sleep 1
done
[ -n "$URL" ] || { echo "터널 주소를 못 받았어요 — $LOG_DIR/tunnel.log 확인"; exit 1; }

# 서버 하나를 두 앱(app_expogo, app_separate)이 함께 쓴다 — 둘 다 같은 주소로 맞춘다
for D in /home/work/MINJI/app_expogo /home/work/MINJI/app_separate; do
  echo "[3/3] $D/.env 갱신: EXPO_PUBLIC_SKIN_API_URL=$URL"
  echo "EXPO_PUBLIC_SKIN_API_URL=$URL" > "$D/.env"
done

echo
echo "준비 완료. 다른 터미널에서 Expo를 캐시 지우고 다시 켜세요 (두 앱을 같이 켜면 포트를 다르게):"
echo "  export PATH=/home/work/MINJI/.node22/bin:\$PATH"
echo "  cd /home/work/MINJI/app_expogo   && npx expo start -c --tunnel --go --port 8081"
echo "  cd /home/work/MINJI/app_separate && npx expo start -c --tunnel --go --port 8082"
echo "(이 창은 켜 둔 채로 두세요 — Ctrl+C 하면 서버가 꺼져요)"
wait $SERVER_PID
